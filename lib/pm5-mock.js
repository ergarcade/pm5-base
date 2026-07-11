class PM5Mock extends EventTarget {

    #rawEvents; // flat [{t, type, data}], t = elapsed ms since replay start
    #load;      // async () => that same shape
    #speed;
    #loop;
    #timer     = null;
    #connected = false;

    // Two ways in, mutually exclusive:
    //  - `samples`/`loadSamples`: the reduced sample shape
    //    ({ t, distance, pace, watts, calPerHour, strokeRate, heartRate }),
    //    synthesized into transport-shaped raw events via `_toRawEvents`
    //    (using `emulate`) since samples carry no type/transport info of
    //    their own. CSV replay is one source, implemented in
    //    mock-data/csv-source.js.
    //  - `events`/`loadEvents`: already-real raw events (our own JSON
    //    export format, mock-data/events-source.js) -- replayed verbatim,
    //    no synthesis, since they already carry the right type/data.
    // Either pre-loaded or an async loader; PM5Mock has no knowledge of
    // where either comes from. `MESSAGE_EVENTS` is set as soon as data is
    // in hand -- synchronously here if given directly, or once `connect()`
    // resolves the loader -- always before `connected` is dispatched.
    constructor({ samples, loadSamples, events, loadEvents, emulate = 'ble', speed = 1, loop = false } = {}) {
        super();
        this.#speed = speed;
        this.#loop  = loop;

        if (events || loadEvents) {
            this.#rawEvents = events ?? null;
            this.#load = loadEvents;
        } else {
            this.#rawEvents = samples ? PM5Mock._toRawEvents(samples, emulate) : null;
            this.#load = loadSamples ? async () => PM5Mock._toRawEvents(await loadSamples(), emulate) : undefined;
        }
        if (this.#rawEvents) this.MESSAGE_EVENTS = [...new Set(this.#rawEvents.map(e => e.type))];
    }

    // ── Public API ──────────────────────────────────────────────────

    async connect() {
        this.#dispatch('connecting');
        if (!this.#rawEvents) {
            this.#rawEvents = await this.#load();
            this.MESSAGE_EVENTS = [...new Set(this.#rawEvents.map(e => e.type))];
        }
        this.#connected = true;
        this.#dispatch('connected', { model: 'Mock', firmwareVersion: '0', serial: 'MOCK' });
        this.#scheduleNext(0);
    }

    disconnect() {
        if (this.#timer !== null) { clearTimeout(this.#timer); this.#timer = null; }
        this.#connected = false;
        this.#dispatch('disconnected');
    }

    connected() {
        return this.#connected;
    }

    // Mock-only: adjust replay speed live. Takes effect from the next
    // scheduled sample onward (the in-flight setTimeout already has its
    // delay computed).
    setSpeed(speed) {
        this.#speed = speed;
    }

    // ── Replay engine ─────────────────────────────────────────────────
    //
    // One chained-setTimeout engine over a flat, already-transport-shaped
    // raw event list, regardless of source (CSV-derived samples pre-flattened
    // by `_toRawEvents`, or our own JSON events used as-is). `t` is always
    // elapsed ms since replay start, so `prevT`'s i=0 baseline of 0 honors
    // the real gap before the very first event either way. The real ergs
    // don't auto-disconnect at the end of a workout, so a non-looping replay
    // just stops emitting and stays connected.

    #scheduleNext(i) {
        if (i >= this.#rawEvents.length) {
            if (this.#loop) this.#scheduleNext(0);
            return;
        }
        const prevT   = i > 0 ? this.#rawEvents[i - 1].t : 0;
        const delayMs = (this.#rawEvents[i].t - prevT) / this.#speed;
        this.#timer = setTimeout(() => {
            const { type, data } = this.#rawEvents[i];
            this.#dispatch(type, data);
            this.#scheduleNext(i + 1);
        }, Math.max(0, delayMs));
    }

    #dispatch(type, data = null) {
        const event = new Event(type);
        event.data = data;
        this.dispatchEvent(event);
    }

    // ── Sample -> raw event synthesis ───────────────────────────────────
    //
    // Pure (no browser APIs), so tests can call these directly. Only keys
    // present in pm5fields are emitted, and undefined sample values are
    // omitted so nothing renders for missing HR/stroke-rate readings.

    // Flattens the reduced sample shape into the same { t, type, data } list
    // a real transport (or our own JSON export) would produce: `t` in ms
    // (samples' `t` is elapsed seconds), one 'workout' entry per sample for
    // HID, three 'multiplexed-information' entries per sample for BLE --
    // mirroring how real hardware demuxes distinct sub-messages onto that
    // one event type rather than bundling every field into a single dispatch.
    static _toRawEvents(samples, emulate) {
        const events = [];
        for (const s of samples) {
            const t = s.t * 1000;
            if (emulate === 'hid') {
                events.push({ t, type: 'workout', data: PM5Mock._toHid(s) });
            } else {
                events.push({ t, type: 'multiplexed-information', data: PM5Mock._toBleGeneralStatus(s) });
                events.push({ t, type: 'multiplexed-information', data: PM5Mock._toBleAdditionalStatus(s) });
                events.push({ t, type: 'multiplexed-information', data: PM5Mock._toBleAdditionalStrokeData(s) });
            }
        }
        return events;
    }

    // Mirrors real general-status: elapsedTime + distance.
    static _toBleGeneralStatus(s) {
        const data = {};
        if (s.t        !== undefined) data.elapsedTime = s.t;
        if (s.distance !== undefined) data.distance    = s.distance;
        return data;
    }

    // Mirrors real additional-status: elapsedTime + pace/power/HR/stroke rate.
    static _toBleAdditionalStatus(s) {
        const data = {};
        if (s.t          !== undefined) data.elapsedTime  = s.t;
        if (s.pace       !== undefined) data.currentPace  = s.pace;
        if (s.watts      !== undefined) data.averagePower = s.watts;
        if (s.strokeRate !== undefined) data.strokeRate   = s.strokeRate;
        if (s.heartRate  !== undefined) data.heartRate    = s.heartRate;
        return data;
    }

    // Mirrors real additional-stroke-data: elapsedTime + stroke caloric burn rate.
    static _toBleAdditionalStrokeData(s) {
        const data = {};
        if (s.t          !== undefined) data.elapsedTime           = s.t;
        if (s.calPerHour !== undefined) data.strokeCaloricBurnRate = s.calPerHour;
        return data;
    }

    static _toHid(s) {
        const data = { workoutState: 1 }; // "Workout Row"
        if (s.t          !== undefined) data.workTime     = s.t;
        if (s.distance   !== undefined) data.workDistance = s.distance;
        if (s.pace       !== undefined) data.pace         = s.pace;
        if (s.watts      !== undefined) data.power        = s.watts;
        if (s.strokeRate !== undefined) data.cadence      = s.strokeRate;
        if (s.heartRate  !== undefined) data.heartRate    = s.heartRate;
        return data;
    }
}

// ponytail: export shim so test/ can import the pure parse/map functions
// under node; a no-op in the browser (no `module`).
if (typeof module !== 'undefined') {
    module.exports = { PM5Mock };
}

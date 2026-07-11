class PM5Mock extends EventTarget {

    // Data-event types app.js subscribes to for this transport. Set per
    // instance (not static) since the shape depends on the `emulate` option;
    // app.js reads `monitor.MESSAGE_EVENTS ?? monitor.constructor.MESSAGE_EVENTS`.
    static MESSAGE_EVENTS_BLE = ['multiplexed-information'];
    static MESSAGE_EVENTS_HID = ['workout', 'stroke'];

    #samples;
    #loadSamples;
    #emulate;
    #speed;
    #loop;
    #timer     = null;
    #connected = false;

    // `samples` (pre-loaded array) or `loadSamples` (async () => samples[])
    // are the only two ways in: PM5Mock has no knowledge of where samples
    // come from. Each sample is { t, distance, pace, watts, calPerHour,
    // strokeRate, heartRate } (any field but `t` may be undefined). CSV
    // replay is one source, implemented in mock-data/csv-source.js; a future
    // Concept2 Logbook API source would be a sibling module producing the
    // same shape, with no changes needed here.
    constructor({ samples, loadSamples, emulate = 'ble', speed = 1, loop = false } = {}) {
        super();
        this.#samples     = samples ?? null;
        this.#loadSamples = loadSamples;
        this.#emulate     = emulate;
        this.#speed       = speed;
        this.#loop        = loop;
        this.MESSAGE_EVENTS = emulate === 'hid' ? PM5Mock.MESSAGE_EVENTS_HID : PM5Mock.MESSAGE_EVENTS_BLE;
    }

    // ── Public API ──────────────────────────────────────────────────

    async connect() {
        this.#dispatch('connecting');
        if (!this.#samples) {
            this.#samples = await this.#loadSamples();
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
    // Chained setTimeout honoring real inter-sample gaps (scaled by speed).
    // The real ergs don't auto-disconnect at the end of a workout, so a
    // non-looping replay just stops emitting and stays connected.

    #scheduleNext(i) {
        if (i >= this.#samples.length) {
            if (this.#loop) this.#scheduleNext(0);
            return;
        }
        const prevT   = i > 0 ? this.#samples[i - 1].t : 0;
        const delayMs = (this.#samples[i].t - prevT) / this.#speed * 1000;
        this.#timer = setTimeout(() => {
            this.#emit(this.#samples[i]);
            this.#scheduleNext(i + 1);
        }, Math.max(0, delayMs));
    }

    #emit(sample) {
        if (this.#emulate === 'hid') {
            this.#dispatch('workout', PM5Mock._toHid(sample));
            return;
        }
        // Real BLE hardware demuxes several distinct sub-messages onto the
        // one 'multiplexed-information' event type, each carrying only its
        // own fields (see pm5-ble.js _cbGeneralStatus/_cbAdditionalStatus/
        // _cbAdditionalStrokeData). Mirror that here with narrower dispatches
        // instead of one event bundling every field.
        this.#dispatch('multiplexed-information', PM5Mock._toBleGeneralStatus(sample));
        this.#dispatch('multiplexed-information', PM5Mock._toBleAdditionalStatus(sample));
        this.#dispatch('multiplexed-information', PM5Mock._toBleAdditionalStrokeData(sample));
    }

    #dispatch(type, data = null) {
        const event = new Event(type);
        event.data = data;
        this.dispatchEvent(event);
    }

    // ── Sample -> event mapping ─────────────────────────────────────────
    //
    // Pure (no browser APIs), so tests can call these directly. Only keys
    // present in pm5fields are emitted, and undefined sample values are
    // omitted so nothing renders for missing HR/stroke-rate readings.

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

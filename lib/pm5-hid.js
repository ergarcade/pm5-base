// Standard CSAFE_GETPACE_CMD (0xA6) reports Stroke Pace at 1 sec/500m
// resolution (CSAFE spec Appendix B, "Time and Distance Displayed" -- pace is
// 1sec resolution, unlike the PM-specific BLE additional-status pace fields,
// which are a *different* command (CSAFE_PM_GET_STROKE_500MPACE) with a
// 0.01 sec lsb). No scaling needed here -- confirmed against recorded HID
// workouts by cross-checking the raw value against Watts = 2.8/pace^3 (pace
// in sec/meter), which matched 1:1.
function hidPaceSeconds(raw) {
    return raw;
}

class PM5HID extends EventTarget {

    // Data-event types app.js subscribes to for this transport.
    static MESSAGE_EVENTS = ['workout', 'stroke'];

    static VENDOR_ID   = 0x17a4;
    static REPORT_ID   = 0x02;
    static REPORT_SIZE = 120;   // HID report payload size (excludes report ID byte)

    static #START_FLAG = 0xf1;
    static #STOP_FLAG  = 0xf2;
    static #STUFF_FLAG = 0xf3;

    // Standard CSAFE commands
    static #CMD = Object.freeze({
        RESET:         0x81,
        GETVERSION:    0x91,
        GETSERIAL:     0x94,
        GETTWORK:      0xa0,
        GETHORIZONTAL: 0xa1,
        GETCALORIES:   0xa3,
        GETPACE:       0xa6,
        GETCADENCE:    0xa7,
        GETHRCUR:      0xb0,
        GETPOWER:      0xb4,
        SETUSERCFG1:   0x1a,
    });

    // PM-specific sub-commands (routed via SETUSERCFG1)
    static #PM = Object.freeze({
        GET_WORKOUTTYPE:  0x89,
        GET_WORKOUTSTATE: 0x8d,
        GET_STROKESTATE:  0xbf,
        GET_DRAGFACTOR:   0xc1,
    });

    #device       = null;
    #pollTimer    = null;
    #pollCounter  = 0;
    #workoutFrame = null;
    #strokeFrame  = null;

    // ── Public API ──────────────────────────────────────────────────

    async connect() {
        this.#dispatch('connecting');

        const devices = await navigator.hid.requestDevice({
            filters: [{ vendorId: PM5HID.VENDOR_ID }],
        });
        if (!devices.length) return;

        const device = devices[0];
        await device.open();
        this.#device = device;

        navigator.hid.addEventListener('disconnect', ({ device: d }) => {
            if (d === this.#device) this.#handleDisconnect();
        });

        this.#workoutFrame = this.#buildFrame([
            [PM5HID.#CMD.GETTWORK],
            [PM5HID.#CMD.GETHORIZONTAL],
            [PM5HID.#CMD.GETPACE],
            [PM5HID.#CMD.GETPOWER],
            [PM5HID.#CMD.GETCALORIES],
            [PM5HID.#CMD.GETCADENCE],
            [PM5HID.#CMD.GETHRCUR],
            [PM5HID.#CMD.SETUSERCFG1, 0x01, PM5HID.#PM.GET_DRAGFACTOR],
            [PM5HID.#CMD.SETUSERCFG1, 0x01, PM5HID.#PM.GET_WORKOUTTYPE],
            [PM5HID.#CMD.SETUSERCFG1, 0x01, PM5HID.#PM.GET_WORKOUTSTATE],
        ]);

        this.#strokeFrame = this.#buildFrame([
            [PM5HID.#CMD.GETPOWER],
            [PM5HID.#CMD.SETUSERCFG1, 0x01, PM5HID.#PM.GET_STROKESTATE],
        ]);

        // Reset device, then query machine info before starting the poll loop
        await this.#sendFrame(this.#buildFrame([[PM5HID.#CMD.RESET]]));

        try {
            const machine = await this.#queryMachineInfo();
            this.#dispatch('connected', machine);
        } catch (err) {
            console.warn('PM5HID: machine info unavailable:', err.message);
            this.#dispatch('connected', {});
        }

        this.#device.addEventListener('inputreport', e => this.#onInputReport(e));
        this.#startPolling();
    }

    disconnect() {
        this.#stopPolling();
        this.#device?.close();
        this.#device = null;
        this.#dispatch('disconnected');
    }

    connected() {
        return this.#device !== null && this.#device.opened;
    }

    // ── Frame encoding ──────────────────────────────────────────────

    #buildFrame(commands) {
        const payload = [];
        for (const cmd of commands) payload.push(...cmd);

        let checksum = 0;
        for (const b of payload) checksum ^= b;
        payload.push(checksum);

        const stuffed = this.#byteStuff(payload);

        const frame = new Uint8Array(PM5HID.REPORT_SIZE).fill(0);
        frame[0] = PM5HID.#START_FLAG;
        stuffed.forEach((b, i) => { frame[i + 1] = b; });
        frame[stuffed.length + 1] = PM5HID.#STOP_FLAG;
        return frame;
    }

    #byteStuff(bytes) {
        const out = [];
        for (const b of bytes) {
            if (b >= 0xf0 && b <= 0xf3) {
                out.push(PM5HID.#STUFF_FLAG, b - 0xf0);
            } else {
                out.push(b);
            }
        }
        return out;
    }

    // ── Frame decoding ──────────────────────────────────────────────

    #parseFrame(data) {
        if (data[0] !== PM5HID.#START_FLAG) return null;
        const stopIdx = data.indexOf(PM5HID.#STOP_FLAG, 1);
        if (stopIdx < 0) return null;

        const unstuffed = this.#byteUnstuff(data.subarray(1, stopIdx));

        let chk = 0;
        for (const b of unstuffed) chk ^= b;
        if (chk !== 0) { console.warn('PM5HID: checksum mismatch'); return null; }

        return unstuffed.slice(0, -1); // strip checksum byte
    }

    #byteUnstuff(bytes) {
        const out = [];
        for (let i = 0; i < bytes.length; i++) {
            if (bytes[i] === PM5HID.#STUFF_FLAG) {
                out.push(bytes[++i] + 0xf0);
            } else {
                out.push(bytes[i]);
            }
        }
        return out;
    }

    // ── Response parsing ────────────────────────────────────────────
    //
    // Response frame payload (after decoding):
    //   byte 0:  status (& 0x7f strips the frame-count high bit)
    //   byte 1+: command responses, each:
    //     standard:      [cmd] [data_len] [data...]
    //     SETUSERCFG1:   [0x1a] [total_len] [pm_cmd] [data_len] [data...]

    #parseResponse(payload) {
        if (!payload?.length) return null;
        const status = payload[0] & 0x7f;
        const cmds   = new Map();
        let i = 1;

        while (i < payload.length) {
            const cmd = payload[i++];
            if (cmd === PM5HID.#CMD.SETUSERCFG1) {
                i++;                                              // skip total_len
                const pmCmd   = payload[i++];
                const dataLen = payload[i++];
                cmds.set(`pm:${pmCmd.toString(16)}`, payload.slice(i, i + dataLen));
                i += dataLen;
            } else {
                const dataLen = payload[i++];
                cmds.set(cmd.toString(16), payload.slice(i, i + dataLen));
                i += dataLen;
            }
        }

        return { status, cmds };
    }

    // ── Data extraction ─────────────────────────────────────────────

    #extractMachine(resp) {
        const ver = resp.cmds.get('91') ?? [];
        const ser = resp.cmds.get('94') ?? [];

        return {
            model:           ver.length >= 3 ? ver[2] : 0,
            firmwareVersion: ver.length >= 7 ? String(ver[5] + (ver[6] << 8)) : 'unknown',
            serial:          ser.length >= 9
                ? new TextDecoder('ascii').decode(new Uint8Array(ser.slice(0, 9)))
                : 'unknown',
        };
    }

    #extractWorkout(resp) {
        const { status, cmds } = resp;
        const get = k => cmds.get(k) ?? [];
        const pm  = k => cmds.get(`pm:${k}`) ?? [];
        const u16 = (b, o = 0) => (b[o] ?? 0) + ((b[o + 1] ?? 0) << 8);

        const t = get('a0'); // GETTWORK: hours, minutes, seconds
        return {
            status,
            workTime:     t.length >= 3 ? t[0] * 3600 + t[1] * 60 + t[2] : 0,
            workDistance: u16(get('a1')),          // metres
            pace:         hidPaceSeconds(u16(get('a6'))), // seconds per 500m
            power:        u16(get('b4')),           // watts
            calories:     u16(get('a3')),           // kcal
            cadence:      u16(get('a7')),           // strokes/min
            heartRate:    get('b0')[0] ?? 0,        // bpm
            dragFactor:   pm('c1')[0] ?? 0,
            workoutType:  pm('89')[0] ?? 0,
            workoutState: pm('8d')[0] ?? 0,
        };
    }

    // TODO: no CSAFE opcode exists for BLE's strokeCaloricBurnRate (cal/hr) —
    // confirmed against the Concept2 PM CSAFE Communication Definition, whose
    // command tables have no such command despite footnoting it against the
    // BLE additional-stroke-data characteristic. The spec's own Pace
    // Conversions appendix gives a derivation from pace instead
    // (Calories/Hr = ((2.8 / pace^3) * (4.0 * 0.8604)) + 300, pace in
    // sec/meter) — worth wiring up from the existing `pace` reading, but
    // needs confirming against real hardware first.
    #extractStroke(resp) {
        const { cmds } = resp;
        const get = k => cmds.get(k) ?? [];
        const pm  = k => cmds.get(`pm:${k}`) ?? [];
        const u16 = (b, o = 0) => (b[o] ?? 0) + ((b[o + 1] ?? 0) << 8);

        return {
            power:       u16(get('b4')),
            strokeState: pm('bf')[0] ?? 0,
        };
    }

    // ── Machine info query ──────────────────────────────────────────
    //
    // Sets up a one-shot inputreport listener, sends the version+serial
    // query, and resolves when the response arrives. The permanent polling
    // handler is only attached after this resolves, so there is no overlap.

    #queryMachineInfo() {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.#device?.removeEventListener('inputreport', handler);
                reject(new Error('timeout waiting for machine info'));
            }, 5000);

            const handler = (event) => {
                const payload = this.#parseFrame(new Uint8Array(event.data.buffer));
                const resp    = this.#parseResponse(payload);
                if (resp?.cmds.has('91')) {
                    clearTimeout(timeout);
                    this.#device.removeEventListener('inputreport', handler);
                    resolve(this.#extractMachine(resp));
                }
            };

            this.#device.addEventListener('inputreport', handler);
            this.#sendFrame(this.#buildFrame([
                [PM5HID.#CMD.GETVERSION],
                [PM5HID.#CMD.GETSERIAL],
            ])).catch(reject);
        });
    }

    // ── Polling ─────────────────────────────────────────────────────

    #startPolling() {
        this.#pollCounter = 0;
        this.#pollTimer = setInterval(() => this.#poll(), 100);
    }

    #stopPolling() {
        if (this.#pollTimer !== null) {
            clearInterval(this.#pollTimer);
            this.#pollTimer = null;
        }
    }

    async #poll() {
        if (!this.connected()) return;
        this.#pollCounter++;
        await this.#sendFrame(
            this.#pollCounter % 5 === 0 ? this.#workoutFrame : this.#strokeFrame
        );
    }

    async #sendFrame(frame) {
        if (!this.connected()) return;
        try {
            await this.#device.sendReport(PM5HID.REPORT_ID, frame);
        } catch (err) {
            console.error('PM5HID: sendReport failed:', err);
        }
    }

    // ── Input report handler ─────────────────────────────────────────

    #onInputReport(event) {
        if (event.reportId !== PM5HID.REPORT_ID) return;
        const payload = this.#parseFrame(new Uint8Array(event.data.buffer));
        const resp    = this.#parseResponse(payload);
        if (!resp || resp.cmds.size === 0) return; // status-only frame (e.g. reset response)

        if (resp.cmds.has('a0')) {
            this.#dispatch('workout', this.#extractWorkout(resp));
        } else {
            this.#dispatch('stroke', this.#extractStroke(resp));
        }
    }

    // ── Disconnect ───────────────────────────────────────────────────

    #handleDisconnect() {
        this.#stopPolling();
        this.#device = null;
        this.#dispatch('disconnected');
    }

    // ── Event dispatch ───────────────────────────────────────────────

    #dispatch(type, data = null) {
        const event  = new Event(type);
        event.data   = data;
        this.dispatchEvent(event);
    }
}

// ponytail: export shim so test/pm5-hid.test.mjs can import the pure pace
// helper under node; a no-op in the browser (no `module`).
if (typeof module !== 'undefined') {
    module.exports = { hidPaceSeconds };
}

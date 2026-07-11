// A mock data source for PM5Mock: parses our own JSON event export (see the
// `recorder` app's events.js) into the raw [{t, type, data}] list PM5Mock
// replays verbatim via its `events`/`loadEvents` option -- no synthesis,
// since each entry already carries the real dispatched type/data.
//
// Recorded `t` is wall-clock Date.now() at capture time; PM5Mock's replay
// engine schedules from an elapsed-ms-since-start baseline (the same
// coordinate system csv-source.js's samples end up in via `t * 1000`), so
// it's relativized here to start at 0.

const eventsSource = {
    parseJson(text) {
        const events = JSON.parse(text);
        const t0 = events[0]?.t ?? 0;
        return events.map(e => ({ ...e, t: e.t - t0 }));
    },

    async loadFromFile(file) {
        return eventsSource.parseJson(await file.text());
    },
};

// ponytail: export shim so test/ can import parseJson under node; a no-op in
// the browser (no `module`).
if (typeof module !== 'undefined') {
    module.exports = { eventsSource };
}

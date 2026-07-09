# Plan: Split library from example, add a mock PM5 transport

## Context

`pm5-base` is becoming the reusable foundation for many future PM5 apps, distributed as
one repository (library + example), **not** via npm. Two changes are wanted now:

1. **Isolate the library from the example app** so developers can see, at a glance, what
   is reusable protocol code versus demo wiring.
2. **Add a mock PM5 monitor** that emits realtime workout data, so developers can build
   apps without physically rowing/skiing/biking. The eventual faithful source is the
   Concept2 Logbook API (a *separate future project*); for now we replay a real workout
   exported as CSV.

The mock is possible cleanly because both transports already share one interface (public
`connect()/disconnect()/connected()`, lifecycle events `connecting`/`connected`/
`disconnected`, and `MESSAGE_EVENTS`). The mock is simply a **third transport**, which
also makes it a live, hardware-free demo and the reference for how to drive the library.

## Locked decisions (confirmed with user)

- Layout: `lib/` (library) + `example/` (demo). `pm5-fields.js` lives in `lib/` — its
  enum decoders are reusable protocol knowledge.
- Keep plain `<script>` globals — **no build step**. Only `<script src>` paths change.
- Mock emulation: selectable BLE/HID, default BLE.
- Data source now: replay the provided CSV. **No synthetic generator** (YAGNI; add later
  behind the same replay engine). C2 Logbook API is a separate project.
- CSV kept with provenance filename `concept2-result-44214428.csv`.

## Step 0 — make this plan portable (do first)

Copy this plan into the repo and commit it so it is available across machines:
`pm5-base/docs/PLAN-library-split-and-mock.md`. Commit message e.g.
`Add plan: split library from example, add mock transport.` (Confirm commit per repo rules.)

## Current state (for reference)

```
pm5-base/
  index.html
  css/style.css
  js/{pm5-ble.js, pm5-hid.js, pm5-fields.js, app.js}
  test/printables.test.mjs
  CLAUDE.md  README.md  LICENSE  favicon.ico
```
- `pm5-ble.js` → `PM5` (global), `static MESSAGE_EVENTS = ['multiplexed-information']`.
- `pm5-hid.js` → `PM5HID` (global), `static MESSAGE_EVENTS = ['workout','stroke']`.
- `pm5-fields.js` → globals `pm5printables`, `pm5fields`; has a `typeof module` CommonJS
  export shim for the node test.
- `app.js` → transport-agnostic. `TRANSPORTS` map, reads `monitor.constructor.MESSAGE_EVENTS`,
  builds chosen class on Connect, wires lifecycle + `cbMessage`.

## Part 1 — Repo restructure

Target:
```
pm5-base/
  lib/
    pm5-ble.js
    pm5-hid.js
    pm5-fields.js
    pm5-mock.js            (new)
    mock-data/
      concept2-result-44214428.csv   (copied from ~/Downloads)
  example/
    index.html
    app.js
    style.css              (moved from css/style.css)
  test/printables.test.mjs
  docs/PLAN-library-split-and-mock.md
  CLAUDE.md  README.md  LICENSE  favicon.ico
```

Moves (use `git mv` to preserve history):
- `js/pm5-ble.js`, `js/pm5-hid.js`, `js/pm5-fields.js` → `lib/`
- `js/app.js` → `example/app.js`
- `index.html` → `example/index.html`
- `css/style.css` → `example/style.css`

Path updates:
- `example/index.html` `<script src>`: `../lib/pm5-ble.js`, `../lib/pm5-hid.js`,
  `../lib/pm5-mock.js`, `../lib/pm5-fields.js`, `app.js`. Stylesheet: `style.css`.
- `test/printables.test.mjs`: change require path `../js/pm5-fields.js` → `../lib/pm5-fields.js`.
- `favicon.ico` referencing is implicit; leave at root (or move to example/ — cosmetic).

No code logic changes in Part 1 — pure relocation + path fixes.

## Part 2 — `lib/pm5-mock.js` (`PM5Mock`)

A third transport with the **same interface** as `PM5`/`PM5HID`.

### Constructor / options
```js
new PM5Mock({
  samples,        // optional: pre-parsed normalized sample array
  csvUrl,         // optional: URL to a Concept2 CSV; connect() fetches+parses it
  csvText,        // optional: raw CSV string
  emulate = 'ble',// 'ble' | 'hid' — which event shape to emit
  speed  = 1,     // wall-clock multiplier (e.g. 8 = 8x faster)
  loop   = false, // restart at end
});
```
- `this.MESSAGE_EVENTS = emulate === 'hid' ? ['workout','stroke'] : ['multiplexed-information'];`
  (instance field — see app.js note below).

### Interface conformance
- `async connect()`: dispatch `connecting`; ensure samples loaded (fetch/parse `csvUrl`/
  `csvText` if `samples` absent); dispatch `connected` with mock info
  `{ model: 'Mock', firmwareVersion: '0', serial: 'MOCK' }`; start replay. Set connected flag.
- `disconnect()`: clear timer, connected flag false, dispatch `disconnected`.
- `connected()`: boolean.
- Uses `EventTarget` + a `_dispatch(type, data)` helper (mirror the pattern already in
  `pm5-ble.js` `_dispatchLifecycle` and `pm5-hid.js` `#dispatch`).

### Replay engine
- Chained `setTimeout`, honoring real inter-sample gaps: delay =
  `(samples[i].t - samples[i-1].t) / speed` seconds (first sample at its own `t/speed`).
- On each sample, dispatch the emulated event(s) with the mapped data (below).
- On end: if `loop`, reset to start (optionally dispatch a `workout-end`/`workout` final
  frame first); else stop (leave connected — the real ergs do not auto-disconnect).

### CSV parsing — `PM5Mock.parseCsv(text)` (static, pure)
Concept2 CSV header:
`Number,"Time (seconds)","Distance (meters)","Pace (seconds)",Watts,Cal/Hr,"Stroke Rate","Heart Rate"`
Map each row to a normalized sample; **blank cells → `undefined`** (row 1 has blank Stroke
Rate; Heart Rate blank throughout this file):
```js
{ t, distance, pace, watts, calPerHour, strokeRate, heartRate }
```
Tiny hand-rolled parser (rows are simple numeric CSV; no embedded commas in data rows).

### Sample → event mapping (pure methods, e.g. `_toBle(s)` / `_toHid(s)` — keep pure for tests)
Only emit keys present in `lib/pm5-fields.js` `pm5fields`; **omit** keys whose sample value
is `undefined` (so nothing renders for missing HR/SR).

BLE (`multiplexed-information` event `data`):
| sample     | key          | pm5fields printable |
|------------|--------------|---------------------|
| t          | elapsedTime  | secs2hms            |
| distance   | distance     | metres              |
| pace       | currentPace  | secs2hms            |
| watts      | averagePower | watts               |
| strokeRate | strokeRate   | as_is               |
| heartRate  | heartRate    | heartRate (0/255→N/A)|

HID: emit one `workout` per sample; `stroke` optional (same power) — start minimal:
| sample     | workout key  | pm5fields printable |
|------------|--------------|---------------------|
| t          | workTime     | workTime            |
| distance   | workDistance | metres              |
| pace       | pace         | pace500m            |
| watts      | power        | watts               |
| strokeRate | cadence      | spm                 |
| heartRate  | heartRate    | heartRate           |
(Add constant `workoutState: 1` ("Workout Row") for realism; optional.)

### Node test export
Append the same `if (typeof module !== 'undefined') module.exports = { PM5Mock };` shim so
`test/` can require it. `parseCsv`, `_toBle`, `_toHid` are pure (no browser APIs), so the
test never calls `connect()`/timers.

## Part 3 — Example integration

`example/index.html`:
- Add `<option value="mock">Mock</option>` to `#transport`.
- Add `<script src="../lib/pm5-mock.js"></script>` (before `app.js`).

`example/app.js`:
- `TRANSPORTS.mock = { label: 'Mock', build: () => new PM5Mock({ csvUrl: '../lib/mock-data/concept2-result-44214428.csv', emulate: 'ble', speed: 8, loop: true }), supported: () => true };`
- **MESSAGE_EVENTS lookup change**: read instance-first with static fallback so the mock's
  per-instance list wins:
  `const events = monitor.MESSAGE_EVENTS ?? monitor.constructor.MESSAGE_EVENTS;`
  (PM5/PM5HID instances have no instance field → fall back to their static; unchanged behavior.)
- CSV fetch lives inside `PM5Mock.connect()`, so `app.js` stays simple and the mock needs
  the page served over http/localhost (already required for Web Bluetooth/HID).

## Part 4 — Docs

- `CLAUDE.md`: update the layout (`lib/`+`example/`), add `pm5-mock.js` as the third
  transport, describe the replay/CSV design and the instance `MESSAGE_EVENTS` nuance, note
  the C2 Logbook API as the future faithful source, note the synthetic generator was
  deliberately skipped (YAGNI).
- `README.md`: add Mock to the transport list and usage; show `new PM5Mock({...})`;
  document running the demo with Mock (no hardware); note CSV provenance and future API.

## Tests

Extend `test/` (node, no browser/hardware):
- `parseCsv`: parses the shipped CSV → correct row count, first/last sample values, blank
  Stroke Rate (row 1) and Heart Rate → `undefined`.
- `_toBle(sample)` / `_toHid(sample)`: correct keys present, `undefined` fields omitted,
  values passed through; every emitted key exists in `pm5fields`.
- Keep existing `printables.test.mjs` (fix its import path to `../lib/pm5-fields.js`).

Run: `node --test test/` (or `node --test test/<file>.mjs`).

## Verification (end-to-end)

1. `node --test test/` — all pass (printables + mock parse/mapping).
2. Serve and open the example: `cd example && python3 -m http.server 8000`, open
   `http://localhost:8000/`.
3. Select **Mock** → **Connect**: cards appear and update in realtime (8x speed, looping)
   with no hardware — Elapsed Time, Distance, Pace, Power, Stroke Rate climbing per the CSV.
4. Confirm **Bluetooth** and **USB** options still build and (with hardware) still work —
   the `MESSAGE_EVENTS` fallback must not regress them.
5. `node --check` each `lib/*.js` and `example/app.js` (parse sanity).

## Out of scope (future)

- Concept2 Logbook API integration (OAuth) — separate project; will feed the same replay
  engine as another data adapter.
- Synthetic workout generator.
- HID `stroke`-cadence fidelity (per-stroke drive/recovery) — start with `workout` frames.

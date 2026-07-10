# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`pm5-base` is a dependency-free JS library for talking to a Concept2 PM5
rowing/ski/bike performance monitor, plus a demo app that displays every
workout variable it reports in real time. It talks to the same monitor over
**three transports**:

- **Web Bluetooth** (BLE GATT) — wireless.
- **Web HID** (USB) — using the CSAFE protocol.
- **Mock** — replays a recorded workout, no hardware required.

No build step, no package manager, no framework — plain HTML/CSS/JS loaded
directly by the browser. (This supersedes the separate `../pm5-hid` repo,
which was the standalone USB-only version.)

The repo is laid out as **library + example**, since `pm5-base` is meant to be
the reusable foundation for future PM5 apps (distributed as one repo, not via
npm):

```
lib/                  reusable, DOM-free protocol/data code
  pm5-ble.js
  pm5-hid.js
  pm5-mock.js
  pm5-fields.js
  mock-data/
    csv-source.js
    concept2-result-44214428.csv
example/               the demo app (all DOM-touching code)
  index.html
  app.js
  style.css
test/                  node tests for the pure lib/ modules
```

## Running it

Serve the repo root with any static file server and open `example/index.html`
in Chrome or Edge (BLE/HID both need Chromium; Web HID is unsupported in
Firefox/Safari — Mock works in any browser since it touches no hardware APIs):

```
python3 -m http.server 8000
```

Then visit `http://localhost:8000/example/`.

Automated tests are pure-data checks of the `lib/` modules, runnable under
node with no browser or hardware:

```
node --test
```

There is no linter or type checker configured. The BLE/HID transport code
(connect paths, live data) can only be verified by loading the example in a
browser against real hardware — pick a transport, Connect, and watch the cards
populate. Mock can be verified the same way without hardware.

## Architecture

Scripts are loaded via plain `<script>` tags in `example/index.html` (order
matters — no module system):

1. **`lib/pm5-ble.js`** — `PM5`, an `EventTarget` subclass wrapping the Web
   Bluetooth GATT interface. Owns all BLE protocol knowledge: service/
   characteristic UUIDs (Concept2 PM5 Bluetooth Smart spec), connect/disconnect
   lifecycle, and binary parsing of each characteristic's byte layout. Zero DOM
   dependencies. On real hardware every rowing sub-message arrives multiplexed
   on characteristic 0x0080, so all data is dispatched under one event type,
   `multiplexed-information`; `_cbMultiplexedInformation` demuxes by a leading
   type-id byte and reuses the same `_cb*`/`_extract*` methods with a
   `multiplexed=true` flag (that byte shifts every field by one, and each
   characteristic's multiplexed encoding also adds or drops a few fields — see
   Protocol notes).
2. **`lib/pm5-hid.js`** — `PM5HID`, an `EventTarget` subclass wrapping Web HID.
   Owns the CSAFE-over-USB protocol: builds/sends command frames (byte-stuffing,
   XOR checksum), parses responses, and polls at 100 ms (a stroke frame every
   tick, a full workout frame every 5th tick). Dispatches its data as `workout`
   and `stroke` events. Also zero DOM dependencies.
3. **`lib/pm5-mock.js`** — `PM5Mock`, an `EventTarget` subclass replaying a
   normalized sample array as either BLE- or HID-shaped events (`emulate: 'ble'
   | 'hid'`, default `'ble'`). It has **no knowledge of where samples come
   from** — the constructor takes either a pre-loaded `samples` array or an
   async `loadSamples()` — so it stays a pure replay engine (chained
   `setTimeout`, honoring real inter-sample gaps scaled by a `speed`
   multiplier, default `1` = real-time; optional `loop`). `setSpeed(n)` adjusts
   it live, taking effect from the next scheduled sample onward. A normalized
   sample is
   `{ t, distance, pace, watts, calPerHour, strokeRate, heartRate }` (any field
   but `t` may be `undefined`); `_toBleGeneralStatus`/`_toBleAdditionalStatus`/
   `_toHid` map it to the same field keys `pm5fields` already defines for the
   real transports, omitting keys whose value is `undefined` so nothing
   renders for missing HR/stroke-rate readings. For BLE, each replay tick
   dispatches **two** `multiplexed-information` events — one shaped like real
   general-status (`elapsedTime`, `distance`), one like additional-status
   (`elapsedTime`, `currentPace`, `averagePower`, `strokeRate`, `heartRate`) —
   mirroring how real hardware demuxes distinct sub-messages onto that one
   event type rather than bundling every field into a single dispatch (see
   Protocol notes). HID stays a single `workout` dispatch per tick, since
   that's how the real USB protocol actually behaves (one polled frame, many
   chained CSAFE commands, one combined response).
   `MESSAGE_EVENTS` is set **per instance** (not static, unlike `PM5`/`PM5HID`)
   since its shape depends on `emulate` — see the app.js note below.
   - **`lib/mock-data/csv-source.js`** — the first (and currently only) sample
     source: `parseCsv(text)` parses a Concept2 workout CSV export into the
     normalized sample array, and `loadFromUrl(url)` fetches + parses it. A
     future source (e.g. the Concept2 Logbook API, a separate future project)
     would be a sibling module producing the same array shape and passed to
     `PM5Mock` via `loadSamples`; no changes to `pm5-mock.js` needed. A
     synthetic (non-recorded) generator was deliberately skipped — YAGNI, add
     one behind the same `loadSamples` seam if/when needed.
4. **`lib/pm5-fields.js`** — pure data/formatting layer, no DOM or transport
   code. `pm5printables` holds formatter functions (units, enums-to-labels, time
   formatting). `pm5fields` maps each data key (from any transport) to a
   `{ label, printable }` pair. This is the **union** of the transports'
   fields: BLE's full set plus HID's unique keys (`status`, `workTime`,
   `workDistance`, `pace`, `power`, `calories`, `cadence`). Mock reuses BLE/HID
   keys entirely — it adds none of its own. Keys the transports share
   (`workoutType`, `workoutState`, `strokeState`, `dragFactor`, `heartRate`)
   have a single entry. **`heartRate` is the one reconciled formatter**: BLE
   reports no-belt as 255, HID as 0, so the merged formatter treats both as
   `N/A` (pinned by the test). A `typeof module` export shim at the end lets
   the node tests import the maps; it is a no-op in the browser.
5. **`example/app.js`** — the only DOM-touching layer, and it is
   **transport-agnostic**. All three classes expose the same interface — public
   `connect()` / `disconnect()` / `connected()`, lifecycle events
   `connecting` / `connected` (data = monitor info) / `disconnected`, and a
   `MESSAGE_EVENTS` list of their data event types — so app.js has no
   per-transport branching. A `<select id="transport">` chooses Bluetooth, USB,
   or Mock; on Connect it builds the matching class (`TRANSPORTS` map), wires
   the lifecycle listeners, calls `connect()`, and on `connected` subscribes
   `cbMessage` to that transport's `MESSAGE_EVENTS` — read **instance-first,
   falling back to the static list** (`monitor.MESSAGE_EVENTS ??
   monitor.constructor.MESSAGE_EVENTS`), since `PM5Mock` sets it per instance
   while `PM5`/`PM5HID` only have the static. `cbMessage` builds one `.card`
   per event type and one `.field` row per data key (looked up in `pm5fields`,
   created lazily), skipping keys not in the map. Clicking a field row toggles
   `.highlight`. A `<select id="mock-speed">` (hidden unless Mock is selected)
   sets the initial `speed` when building `PM5Mock` and calls its `setSpeed()`
   live on change — the one Mock-specific control, since `setSpeed` isn't part
   of the shared transport interface.

`example/index.html` also holds an instructions panel implemented as a native
`<dialog>` (`#instruction-text`), opened via `showModal()`/`close()` — no custom
modal library.

Styling (`example/style.css`) is a single stylesheet using CSS custom
properties, with a `prefers-color-scheme: dark` override block for dark mode.

### Adding another transport

Implement a class with the shared interface (`connect`/`disconnect`/`connected`,
the three lifecycle events, `MESSAGE_EVENTS`), add its unique keys to
`pm5fields`, add a `<script>` tag and an entry to `TRANSPORTS` (plus an
`<option>`) in `example/index.html`/`example/app.js`. No changes to `cbMessage`
needed.

### Adding another mock data source

Write a sibling module to `lib/mock-data/csv-source.js` that produces the same
normalized sample array (`{ t, distance, pace, watts, calPerHour, strokeRate,
heartRate }`), then pass it to `PM5Mock` via `loadSamples` (or pre-load it and
pass `samples` directly). No changes to `pm5-mock.js` needed. The Concept2
Logbook API (OAuth) is the planned faithful future source — a separate future
project — feeding the same seam.

## Protocol notes worth knowing before touching the transport classes

- **BLE (`pm5-ble.js`)**: byte layouts come from the Concept2 PM5 Bluetooth
  Smart Communications Interface spec (v1.25). Each `_extract*` method's comment
  cross-references the equivalent CSAFE command. Non-multiplexed and multiplexed
  payloads for the same characteristic are **not** byte-identical — some fields
  shift or drop when multiplexed (see the `o`/`p`/`s` offset variables). When
  adding or fixing a field, check both code paths. `force-curve-data` (0x003d)
  is deliberately unhandled — not present on real hardware despite being in the
  spec.
- **HID (`pm5-hid.js`)**: CSAFE over HID report ID `0x02` with a 120-byte
  payload. Frames are bounded by `0xf1` (start) / `0xf2` (stop); bytes in
  `0xf0–0xf3` inside the payload are byte-stuffed, and a single XOR checksum byte
  is appended before stuffing. PM-specific sub-commands are routed via
  `SETUSERCFG1` (0x1a). See the Concept2 PM CSAFE Communication Definition (SDK).
- **Mock (`pm5-mock.js`)**: not a protocol at all — it's a data replay engine.
  The interesting design point is the separation between the replay engine
  (transport-shaped, protocol-agnostic) and the sample source (currently CSV,
  future Logbook API): they only agree on the normalized sample shape. On the
  BLE side it also mirrors the real demux split (general-status vs
  additional-status) rather than bundling every field into one event — worth
  checking again if a third BLE sub-message type (e.g. stroke-data) ever needs
  emulating.
- The transports report overlapping data under **different key names** (e.g.
  BLE `strokeRate` vs HID `cadence`, BLE `currentPace`/`averagePace` vs HID
  `pace`), so most keys coexist without collision. Only the five shared keys
  above are single entries; of those only `heartRate` needed reconciling.
  Mock doesn't introduce any new keys — it just replays BLE- or HID-shaped data
  through `_toBle`/`_toHid`.

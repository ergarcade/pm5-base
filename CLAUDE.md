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
    events-source.js
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

## Setting up a new product repo

Spinning up a new ergarcade product built on this library (repo creation,
submodule, topics, README stub) is a checklist, not something to re-derive —
use the `new-product-repo` skill (`.claude/skills/new-product-repo/SKILL.md`).
It covers only that scaffolding, not the app itself. README.md keeps a short
version of the same steps.

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
   flat, already transport-shaped raw event list — `[{ t, type, data }]`, `t`
   = elapsed ms since replay start — through one chained-`setTimeout` engine
   (`#scheduleNext`), honoring real inter-event gaps scaled by a `speed`
   multiplier (default `1` = real-time; optional `loop`). `setSpeed(n)`
   adjusts it live, taking effect from the next scheduled event onward. It
   has **no knowledge of where that list comes from** — two mutually
   exclusive ways in:
   - **Reduced samples** (`samples`/`loadSamples`, pre-loaded array or async
     loader) — `{ t, distance, pace, watts, calPerHour, strokeRate,
     heartRate }` (any field but `t` may be `undefined`), synthesized into
     the raw event list by `_toRawEvents(samples, emulate)` (`emulate:
     'ble' | 'hid'`, default `'ble'`, since samples carry no transport info
     of their own). `_toBleGeneralStatus`/`_toBleAdditionalStatus`/
     `_toBleAdditionalStrokeData`/`_toHid` map a sample to the same field
     keys `pm5fields` defines for the real transports, omitting keys whose
     value is `undefined` so nothing renders for missing HR/stroke-rate/
     caloric-burn-rate readings. For BLE, each sample synthesizes **three**
     `multiplexed-information` raw events — general-status (`elapsedTime`,
     `distance`), additional-status (`elapsedTime`, `currentPace`,
     `averagePower`, `strokeRate`, `heartRate`), additional-stroke-data
     (`elapsedTime`, `strokeCaloricBurnRate`) — mirroring how real hardware
     demuxes distinct sub-messages onto that one event type rather than
     bundling every field into a single dispatch (see Protocol notes). HID
     synthesizes a single `workout` event per sample, since that's how the
     real USB protocol actually behaves (one polled frame, many chained
     CSAFE commands, one combined response); HID has no caloric-burn-rate
     field, only a cumulative `calories` total, so `calPerHour` goes
     unmapped there.
   - **Raw events** (`events`/`loadEvents`, same pre-loaded-or-async
     shape) — used verbatim, no synthesis, since each entry already carries
     the real dispatched type/data. This is what a full-fidelity recording
     (every field a real transport actually reported, not just the seven
     reduced-sample fields) replays through.

   `MESSAGE_EVENTS` is set **per instance** (not static, unlike `PM5`/
   `PM5HID`) — derived as `[...new Set(rawEvents.map(e => e.type))]` once
   the data is in hand, so it always reflects what's actually going to be
   dispatched rather than being hardcoded from `emulate`. Set synchronously
   in the constructor when `samples`/`events` are given directly (tests rely
   on this), or once `connect()` resolves an async loader — always before
   `connected` is dispatched, which is the only point app.js reads it (see
   the app.js note below).
   - **`lib/mock-data/csv-source.js`** — parses a Concept2 workout CSV
     export into the reduced sample array: `parseCsv(text)`, plus
     `loadFromUrl(url)`/`loadFromFile(file)` wrappers.
   - **`lib/mock-data/events-source.js`** — parses our own JSON event
     export (see `ergarcade/recorder`'s `events.js`) into the raw event
     list: `parseJson(text)` relativizes the recorded wall-clock `t` (each
     event's `Date.now()` at capture) to start at 0, matching the
     elapsed-ms-since-start baseline `_toRawEvents` also produces, plus a
     `loadFromFile(file)` wrapper.
   - A future sample source (e.g. the Concept2 Logbook API, a separate
     future project) would be a sibling module to `csv-source.js` producing
     the same reduced-sample array and passed to `PM5Mock` via
     `loadSamples`; no changes to `pm5-mock.js` needed. A synthetic
     (non-recorded) generator was deliberately skipped — YAGNI, add one
     behind the same `loadSamples`/`loadEvents` seam if/when needed.
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
   `N/A` (pinned by the test). **`pace` is the other one with a wrinkle**:
   the CSAFE spec defines every pace command as seconds/500m unconditionally
   for every machine type (no bike-specific branch in the protocol), but
   Concept2's own BikeErg convention displays pace per 1000m, not 500m — a
   bike covers 500m too fast for that unit to be meaningful. So
   `pm5printables.pace(secs, ergMachineType)` takes an optional second
   argument: given a bike `ergMachineType` (192/193/194/207 — see
   `ergMachineType`'s own enum below), it doubles `secs` and labels the
   result `/1000m` instead of `/500m`. Every other field's printable ignores
   a second argument, so callers can pass it unconditionally
   (`pm5fields[k].printable(v, ergMachineType)`) without special-casing
   pace. `ergMachineType` is BLE-only and only known for events that happen
   to carry it — conveniently, BLE's additional-status bundles it alongside
   `currentPace`/`averagePace` in the very same payload (see
   `_extractAdditionalStatus` in `pm5-ble.js`), so `event.data.ergMachineType`
   is right there with no extra state to track; omit it (HID, or any BLE
   event that doesn't carry it) and `pace` falls back to `/500m`. HID has no
   equivalent query for machine type at all (`CSAFE_PM_GET_ERGMACHINETYPE`,
   0xED, isn't in `pm5-hid.js`'s polled command set), so HID's own `pace`
   field always shows `/500m` — a known gap, not a regression, left as a
   TODO rather than risking an unverified change to HID's command framing
   without real hardware to test against. A `typeof module` export shim at
   the end lets the node tests import the maps; it is a no-op in the
   browser.
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
   per event type (or, with the `#split-metrics` checkbox ticked, one `.card`
   per data key instead — a display-only regrouping via `getOrCreateCard`, not
   a protocol distinction; toggling it clears `#notifications` so the next
   event rebuilds under the new grouping) and one `.field` row per data key
   (looked up in `pm5fields`, created lazily), skipping keys not in the map.
   `setField` passes `event.data.ergMachineType` through to every field's
   `printable` call so pace fields can use it (see `pm5-fields.js` above) —
   harmless for every other field, which just ignores the extra argument.
   Clicking a field row toggles `.highlight`. A `<select id="mock-speed">`
   (hidden unless Mock is selected) sets the initial `speed` when building
   `PM5Mock` and calls its `setSpeed()` live on change — the one Mock-specific
   control, since `setSpeed` isn't part of the shared transport interface.
   `<input type="file" id="mock-file">` (same visibility rule, disabled while
   connected like `#transport`) is the other: `TRANSPORTS.mock.build()` reads
   its selected file and picks `loadEvents` (`.json`, `eventsSource
   .loadFromFile`) or `loadSamples` (anything else, `csvSource.loadFromFile`)
   accordingly, falling back to the shipped demo CSV via `loadSamples` when
   nothing's chosen — so a workout recorded by `ergarcade/recorder` (either
   export format) can be replayed here.

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

For a reduced-sample source: write a sibling module to
`lib/mock-data/csv-source.js` that produces the same normalized sample array
(`{ t, distance, pace, watts, calPerHour, strokeRate, heartRate }`), then
pass it to `PM5Mock` via `loadSamples` (or pre-load it and pass `samples`
directly). No changes to `pm5-mock.js` needed. The Concept2 Logbook API
(OAuth) is the planned faithful future source — a separate future project —
feeding the same seam.

For a full-fidelity source: write a sibling module to
`lib/mock-data/events-source.js` that produces the same raw event array
(`[{ t, type, data }]`, `t` relativized to start at 0), then pass it via
`loadEvents`/`events`. No changes to `pm5-mock.js` needed here either.

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
  (a single flat raw-event list, transport/source-agnostic) and where that
  list comes from: either synthesized from reduced samples (CSV today,
  future Logbook API) via `_toRawEvents`, or read verbatim from a
  full-fidelity JSON recording (`events-source.js`) that already carries
  real type/data. On the BLE synthesis side it also mirrors the real demux
  split (general-status vs additional-status vs additional-stroke-data)
  rather than bundling every field into one event — worth checking again if
  another BLE sub-message type ever needs emulating.
- The transports report overlapping data under **different key names** (e.g.
  BLE `strokeRate` vs HID `cadence`, BLE `currentPace`/`averagePace` vs HID
  `pace`), so most keys coexist without collision. Only the five shared keys
  above are single entries; of those only `heartRate` needed reconciling.
  Mock doesn't introduce any new keys — it just replays BLE- or HID-shaped data
  through `_toBle`/`_toHid`.

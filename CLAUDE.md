# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static, dependency-free web app that connects to a Concept2 PM5
rowing/ski/bike performance monitor and displays every workout variable it
reports in real time. It talks to the same monitor over **two transports**:

- **Web Bluetooth** (BLE GATT) — wireless.
- **Web HID** (USB) — using the CSAFE protocol.

No build step, no package manager, no framework — plain HTML/CSS/JS loaded
directly by the browser. (This supersedes the separate `../pm5-hid` repo,
which was the standalone USB-only version.)

## Running it

Serve the directory with any static file server and open `index.html` in
Chrome or Edge (both transports need Chromium; Web HID is unsupported in
Firefox/Safari):

```
python3 -m http.server 8000
```

There is one automated test — a pure-data check of the merged field module,
runnable under node with no browser or hardware:

```
node --test test/printables.test.mjs
```

There is no linter or type checker configured. The transport code itself
(BLE/HID connect paths, live data) can only be verified by loading the page in
a browser against a real PM5 — pick a transport, Connect, and watch the cards
populate.

## Architecture

Four scripts, loaded via plain `<script>` tags in `index.html` (order matters —
no module system):

1. **`js/pm5-ble.js`** — `PM5`, an `EventTarget` subclass wrapping the Web
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
2. **`js/pm5-hid.js`** — `PM5HID`, an `EventTarget` subclass wrapping Web HID.
   Owns the CSAFE-over-USB protocol: builds/sends command frames (byte-stuffing,
   XOR checksum), parses responses, and polls at 100 ms (a stroke frame every
   tick, a full workout frame every 5th tick). Dispatches its data as `workout`
   and `stroke` events. Also zero DOM dependencies.
3. **`js/pm5-fields.js`** — pure data/formatting layer, no DOM or transport
   code. `pm5printables` holds formatter functions (units, enums-to-labels, time
   formatting). `pm5fields` maps each data key (from either transport) to a
   `{ label, printable }` pair. This is the **union** of the two transports'
   fields: BLE's full set plus HID's unique keys (`status`, `workTime`,
   `workDistance`, `pace`, `power`, `calories`, `cadence`). Keys the two
   transports share (`workoutType`, `workoutState`, `strokeState`, `dragFactor`,
   `heartRate`) have a single entry. **`heartRate` is the one reconciled
   formatter**: BLE reports no-belt as 255, HID as 0, so the merged formatter
   treats both as `N/A` (pinned by the test). A `typeof module` export shim at
   the end lets the node test import the maps; it is a no-op in the browser.
4. **`js/app.js`** — the only DOM-touching layer, and it is
   **transport-agnostic**. Both classes expose the same interface — public
   `connect()` / `disconnect()` / `connected()`, lifecycle events
   `connecting` / `connected` (data = monitor info) / `disconnected`, and a
   static `MESSAGE_EVENTS` list of their data event types — so app.js has no
   per-transport branching. A `<select id="transport">` chooses Bluetooth or
   USB; on Connect it builds the matching class (`TRANSPORTS` map), wires the
   lifecycle listeners, calls `connect()`, and on `connected` subscribes
   `cbMessage` to that transport's `MESSAGE_EVENTS`. `cbMessage` builds one
   `.card` per event type and one `.field` row per data key (looked up in
   `pm5fields`, created lazily), skipping keys not in the map. Clicking a field
   row toggles `.highlight`.

`index.html` also holds an instructions panel implemented as a native
`<dialog>` (`#instruction-text`), opened via `showModal()`/`close()` — no custom
modal library.

Styling (`css/style.css`) is a single stylesheet using CSS custom properties,
with a `prefers-color-scheme: dark` override block for dark mode.

### Adding a third transport

Implement a class with the shared interface (`connect`/`disconnect`/`connected`,
the three lifecycle events, static `MESSAGE_EVENTS`), add its unique keys to
`pm5fields`, add a `<script>` tag and an entry to `TRANSPORTS` (plus an
`<option>`) in `index.html`/`app.js`. No changes to `cbMessage` needed.

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
- The two transports report overlapping data under **different key names** (e.g.
  BLE `strokeRate` vs HID `cadence`, BLE `currentPace`/`averagePace` vs HID
  `pace`), so most keys coexist without collision. Only the five shared keys
  above are single entries; of those only `heartRate` needed reconciling.

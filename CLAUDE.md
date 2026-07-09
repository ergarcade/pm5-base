# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static, dependency-free web app that connects to a Concept2 PM5 rowing/ski/bike
performance monitor over Web Bluetooth and displays all workout variables it
broadcasts in real time. No build step, no package manager, no framework — plain
HTML/CSS/JS loaded directly by the browser.

## Running it

Serve the directory with any static file server and open `index.html` in a
Web-Bluetooth-capable browser (Chrome on desktop):

```
python3 -m http.server 8000
```

There is no build, lint, or test command configured in this repo (no
`package.json`). Verify changes by loading the page in a browser and, where
Bluetooth hardware isn't available, exercising the DOM/CSS by hand (e.g. via
Playwright) since there's no automated test suite.

## Architecture

Three scripts, loaded via plain `<script>` tags in `index.html` (order matters —
no module system):

1. **`js/pm5.js`** — `PM5`, a standalone `EventTarget` subclass wrapping the Web
   Bluetooth GATT interface. Owns all protocol knowledge: service/characteristic
   UUIDs (from the Concept2 PM5 Bluetooth Smart spec), connect/disconnect
   lifecycle, and binary parsing of each characteristic's byte layout into typed
   JS objects. Has zero DOM dependencies — it only takes four callbacks
   (`cb_connecting`, `cb_connected`, `cb_disconnected`, `cb_message`) and dispatches
   native `Event`s (`event.type`, `event.data`, `event.source`, `event.raw`).
   Event types mirror the PM5 rowing service characteristics (`general-status`,
   `stroke-data`, `multiplexed-information`, etc.) — see the README for the
   `new PM5(...)` usage shape. Characteristics can be delivered individually or
   multiplexed onto one characteristic (0x0080); `_cbMultiplexedInformation`
   demuxes by leading byte and reuses the same per-characteristic extractor
   methods with a `multiplexed=true` offset flag, since multiplexed payloads drop
   one field that's redundant across the whole batch.
2. **`js/pm5-printables.js`** — pure data/formatting layer, no DOM or Bluetooth
   code. `pm5printables` holds formatter functions (units, enums-to-labels,
   time formatting). `pm5fields` maps each `PM5` data key (e.g. `elapsedTime`,
   `strokeRate`) to a `{ label, printable }` pair used to render it.
3. **`js/app.js`** — the only DOM-touching layer. Wires the Connect button to
   `PM5.doConnect`/`doDisconnect`, and in `cbMessage` dynamically builds one
   `.card` per event type and one `.field` row per data key inside it (looked up
   by id, created lazily on first sight) using the `pm5fields` label/printable
   pair. Clicking a field row toggles a `.highlight` class.

`index.html` also holds an instructions panel implemented as a native `<dialog>`
(`#instruction-text`), opened via `showModal()`/`close()` from `app.js` — no
custom modal/animation library, relying on the platform's built-in focus
trapping and Escape-to-close.

Styling (`css/style.css`) is a single stylesheet using CSS custom properties for
theming, with a `prefers-color-scheme: dark` override block for dark mode — there
is no separate dark-mode stylesheet or class toggle.

## Protocol notes worth knowing before touching `pm5.js`

- Byte layouts and field semantics come from the Concept2 PM5 Bluetooth Smart
  Communications Interface spec (v1.25). Each `_extract*` method's leading
  comment cross-references the equivalent CSAFE command where one exists.
- Non-multiplexed and multiplexed payloads for the same characteristic are not
  byte-identical — some fields shift position or drop entirely when multiplexed
  (see the `o`/`p`/`s` offset variables in each `_extract*` method). When adding
  or fixing a field, check both code paths.
- `force-curve-data` (characteristic `0x003d`) is deliberately unhandled — the
  comment in `_characteristicHandlers` notes it isn't present on real hardware
  despite being in the spec.

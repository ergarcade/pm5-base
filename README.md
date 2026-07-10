This is a library plus demo app for connecting to a [Concept2 PM5] monitor and
reporting all variables made available on its interface. It supports **three
transports** for the same monitor:

* **Bluetooth** (Web Bluetooth) — wireless.
* **USB** (Web HID) — using the CSAFE protocol.
* **Mock** — replays a recorded workout, no hardware required.

## Requirements

* Chrome or Edge for Bluetooth/USB (both need Chromium; Web HID is not
  supported in Firefox or Safari). See [Web Bluetooth support]. Mock works in
  any modern browser.
* A [PM5] attached to a [Concept2 ergometer] (not needed for Mock).

## Usage

* Serve the repo root with a static file server and open `example/index.html`:
  ```
  python3 -m http.server 8000
  ```
  then visit `http://localhost:8000/example/`.
* Pick **Bluetooth**, **USB**, or **Mock** from the dropdown.
* **Bluetooth:** on the PM5, **More Options** → **Turn Wireless ON**.
  **USB:** connect the PM5 to your computer.
  **Mock:** nothing to set up — it replays a recorded workout on its own.
* Click the **Connect** button. For Bluetooth/USB, select the PM5 from the
  browser's picker.
* Give it a sec.
* Click boxes to highlight them.
* For Bluetooth/USB: set up a workout on the PM5, start rowing / skiing /
  biking, and watch the numbers change. For Mock, the numbers start climbing
  immediately (real-time by default, looping) — a speed dropdown (1x–16x)
  appears next to Connect and can be changed live while replaying.

Tested on Chrome on macOS. [Source on GitHub].

## Repo layout

```
lib/            reusable, DOM-free library (protocol + data)
example/        the demo app (all DOM-touching code)
test/           node tests for the lib/ modules
```

`lib/` has no dependency on `example/` — it's meant to be reused by other PM5
apps in this repo family.

## Transport classes

All three transports are standalone ES2020+ classes (`extends EventTarget`)
exposing the **same interface**, so the app is transport-agnostic:

* `PM5` (`lib/pm5-ble.js`) — Web Bluetooth GATT.
* `PM5HID` (`lib/pm5-hid.js`) — Web HID / USB, CSAFE protocol.
* `PM5Mock` (`lib/pm5-mock.js`) — replays a normalized sample array as BLE- or
  HID-shaped events; no hardware.

```js
const monitor = new PM5();        // or new PM5HID(), or new PM5Mock({...})

monitor.addEventListener('connecting',   () => { });
monitor.addEventListener('connected',    e  => console.log(e.data)); // monitor info
monitor.addEventListener('disconnected', () => { });

await monitor.connect();          // BLE/HID prompt the browser's device picker
for (const type of monitor.MESSAGE_EVENTS ?? monitor.constructor.MESSAGE_EVENTS)
    monitor.addEventListener(type, e => console.log(e.type, e.data));

monitor.disconnect();
monitor.connected();              // → boolean
```

All async operations use `async/await`. Events are dispatched as native `Event`
objects with `event.type` and `event.data` (BLE data events also carry
`event.source` and `event.raw`). `MESSAGE_EVENTS` lists the data event types a
transport emits — BLE multiplexes everything onto `multiplexed-information`;
HID emits `workout` and `stroke`; Mock emits whichever of those two shapes its
`emulate` option picked. `PM5`/`PM5HID` expose `MESSAGE_EVENTS` as a static;
`PM5Mock` sets it per instance (since it depends on `emulate`), so callers
should check the instance first and fall back to the static, as above.

### Mock: replaying workout data

```js
const monitor = new PM5Mock({
    loadSamples: () => csvSource.loadFromUrl('../lib/mock-data/concept2-result-44214428.csv'),
    emulate: 'ble',   // or 'hid'
    speed: 1,         // wall-clock multiplier (default 1 = real-time)
    loop: true,       // restart at the end
});

monitor.setSpeed(8);  // adjust live, takes effect from the next sample onward
```

`PM5Mock` doesn't know or care where samples come from — pass a pre-loaded
`samples` array, or an async `loadSamples()`. The only source shipped today is
`lib/mock-data/csv-source.js`, which parses a real Concept2 workout CSV export
(`lib/mock-data/concept2-result-44214428.csv`) into the normalized sample shape
`PM5Mock` replays. A faithful live source — the Concept2 Logbook API — is a
planned separate future project that would plug into the same `loadSamples`
seam with no changes to `pm5-mock.js`.

In the example app, a speed dropdown (1x–16x, next to Connect) only appears
when Mock is selected and calls `setSpeed()` live.

## Tests

The pure `lib/` modules (field/formatter maps, CSV parsing, sample mapping)
have node tests (no browser or hardware):

```
node --test
```

[Concept2 PM5]: https://www.concept2.com/indoor-rowers/performance-monitors
[Web Bluetooth support]: https://caniuse.com/#feat=web-bluetooth
[PM5]: https://www.concept2.com/indoor-rowers/performance-monitors
[Concept2 ergometer]: https://www.concept2.com
[Source on GitHub]: https://github.com/ergarcade/pm5-base

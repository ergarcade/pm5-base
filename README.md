This application connects to a [Concept2 PM5] monitor and reports all variables
made available on its interface. It supports **two transports** for the same
monitor:

* **Bluetooth** (Web Bluetooth) — wireless.
* **USB** (Web HID) — using the CSAFE protocol.

## Requirements

* Chrome or Edge (both transports need Chromium; Web HID is not supported in
  Firefox or Safari). See [Web Bluetooth support].
* A [PM5] attached to a [Concept2 ergometer].

## Usage

* Pick **Bluetooth** or **USB** from the dropdown.
* **Bluetooth:** on the PM5, **More Options** → **Turn Wireless ON**.
  **USB:** connect the PM5 to your computer.
* Click the **Connect** button and select the PM5 from the browser's picker.
* Give it a sec.
* Click boxes to highlight them.
* Set up a workout on the PM5. Start rowing / skiing / biking. Watch numbers
  change. Get excited.

Tested on Chrome on macOS. [Source on GitHub].

## Transport classes

Both transports are standalone ES2020+ classes (`extends EventTarget`) exposing
the **same interface**, so the app is transport-agnostic:

* `PM5` (`js/pm5-ble.js`) — Web Bluetooth GATT.
* `PM5HID` (`js/pm5-hid.js`) — Web HID / USB, CSAFE protocol.

```js
const monitor = new PM5();        // or new PM5HID()

monitor.addEventListener('connecting',   () => { });
monitor.addEventListener('connected',    e  => console.log(e.data)); // monitor info
monitor.addEventListener('disconnected', () => { });

await monitor.connect();          // prompts the browser's device picker
for (const type of PM5.MESSAGE_EVENTS)  // ['multiplexed-information'] / ['workout','stroke']
    monitor.addEventListener(type, e => console.log(e.type, e.data));

monitor.disconnect();
monitor.connected();              // → boolean
```

All async operations use `async/await`. Events are dispatched as native `Event`
objects with `event.type` and `event.data` (BLE data events also carry
`event.source` and `event.raw`). Each class's `MESSAGE_EVENTS` static lists the
data event types it emits — BLE multiplexes everything onto
`multiplexed-information`; HID emits `workout` and `stroke`.

## Tests

The pure field/formatter module has a small node test (no browser or hardware):

```
node --test test/printables.test.mjs
```

[Concept2 PM5]: https://www.concept2.com/indoor-rowers/performance-monitors
[Web Bluetooth support]: https://caniuse.com/#feat=web-bluetooth
[PM5]: https://www.concept2.com/indoor-rowers/performance-monitors
[Concept2 ergometer]: https://www.concept2.com
[Source on GitHub]: https://github.com/ergarcade/pm5-base

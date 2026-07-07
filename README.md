This application connects to a [Concept2 PM5] monitor over Bluetooth and reports
all variables made available on it's Bluetooth interface.

## Requirements

* [Web Bluetooth supported browser]
* [PM5] attached to a [Concept2 ergometer]

## Usage

* PM5: **More Options** -> **Turn Wireless ON**
* Click the **Connect** button above.
* Give it a sec.
* Click boxes to higlight them.
* Setup workout on PM5. Start rowing / skiing / biking. Watch numbers change.
  Get excited.

Tested on Chrome on Mac OS X. [Source on GitHub].

## pm5.js

`PM5` is a standalone ES2020+ class (`extends EventTarget`) wrapping the Web Bluetooth GATT interface to the PM5.

```js
const m = new PM5(
    () => { /* connecting */ },
    () => { /* connected  */ },
    () => { /* disconnected */ },
    (event) => { /* event.type, event.data */ }
);
```

All async operations use `async/await`. Events are dispatched as native `Event` objects with `event.type`, `event.data`, `event.source`, and `event.raw` properties. Supported event types mirror the PM5 rowing service characteristics (`general-status`, `additional-status`, `stroke-data`, `multiplexed-information`, etc.).

[Concept2 PM5]: https://www.concept2.com/indoor-rowers/performance-monitors
[Web Bluetooth supported browser]: https://caniuse.com/#feat=web-bluetooth
[PM5]: https://www.concept2.com/indoor-rowers/performance-monitors
[Concept2 ergometer]: https://www.concept2.com
[Source on GitHub]: https://github.com/ergarcade/pm5-base

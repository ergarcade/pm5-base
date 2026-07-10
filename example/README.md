# example

A reference app built on the [pm5-base](../README.md) library, showing every
workout variable a Concept2 PM5 reports in real time. It supports the same
three transports as the library: **Bluetooth**, **USB**, and **Mock** (no
hardware required).

## Requirements

* Chrome or Edge for Bluetooth/USB (both need Chromium; Web HID is not
  supported in Firefox or Safari). See [Web Bluetooth support].
* A [PM5] attached to a [Concept2 ergometer] — not needed for Mock.

## Running it

Serve the **repo root** (not this directory) with a static file server, since
`example/` loads library files from `../lib/`:

```
python3 -m http.server 8000
```

then visit `http://localhost:8000/example/`.

## Usage

* Pick **Bluetooth**, **USB**, or **Mock** from the dropdown.
* **Bluetooth:** on the PM5, **More Options** → **Turn Wireless ON**.
  **USB:** connect the PM5 to your computer.
  **Mock:** nothing to set up — it replays a recorded workout on its own.
* Click the **Connect** button. For Bluetooth/USB, select the PM5 from the
  browser's picker.
* Give it a sec.
* Click any field to highlight it.
* For Bluetooth/USB: set up a workout on the PM5, start rowing / skiing /
  biking, and watch the numbers change. For Mock, the numbers start climbing
  immediately (real-time by default, looping) — a speed dropdown (1x–16x)
  appears next to Connect and can be changed live while replaying.

Tested on Chrome on macOS. [Source on GitHub].

For how the library classes used here (`PM5`, `PM5HID`, `PM5Mock`,
`pm5fields`) work, see the [main README](../README.md).

[Web Bluetooth support]: https://caniuse.com/#feat=web-bluetooth
[PM5]: https://www.concept2.com/indoor-rowers/performance-monitors
[Concept2 ergometer]: https://www.concept2.com
[Source on GitHub]: https://github.com/ergarcade/pm5-base

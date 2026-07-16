# pm5-base

A dependency-free JS library for talking to a [Concept2 PM5] rowing/ski/bike
performance monitor from the browser, over three interchangeable transports:

* **`PM5`** — Web Bluetooth (BLE GATT), wireless.
* **`PM5HID`** — Web HID (USB), CSAFE protocol.
* **`PM5Mock`** — replays a recorded workout; no hardware, for developing and
  demoing without a PM5 in the room.

No build step, no package manager, no framework — plain classes loaded via
`<script>` tags, meant to be dropped straight into your own app.

A full reference implementation lives in [`example/`](example/) — see
[`example/README.md`](example/README.md) to run it.

## Getting it into your project

This isn't published to npm. Copy the files you need out of `lib/` into your
own project and load them as plain `<script>` tags, in this order:

```html
<script src="pm5-ble.js"></script>   <!-- PM5, if you want Bluetooth -->
<script src="pm5-hid.js"></script>   <!-- PM5HID, if you want USB -->
<script src="pm5-mock.js"></script>  <!-- PM5Mock, if you want the no-hardware mock -->
<script src="pm5-fields.js"></script> <!-- pm5fields/pm5printables, needed by all of the above -->
<script src="your-app.js"></script>
```

Only take what you need — e.g. a USB-only app can skip `pm5-ble.js` and
`pm5-mock.js`. `pm5-fields.js` has no dependency on the others and is required
by any of them (it's how you turn a raw data key into a label and a formatted
value — see below).

## The shared interface

`PM5`, `PM5HID`, and `PM5Mock` all expose the same shape, so your app code
doesn't need to branch on which transport it's using:

```js
const monitor = new PM5();   // or new PM5HID(), or new PM5Mock({ ... })

monitor.addEventListener('connecting',   () => { /* picker about to open */ });
monitor.addEventListener('connected',    e  => console.log(e.data)); // monitor info
monitor.addEventListener('disconnected', () => { /* link dropped */ });

// connect() must be called from a user gesture (click handler) for BLE/HID,
// since it opens the browser's device picker.
await monitor.connect();

// MESSAGE_EVENTS lists the data event types this transport emits. PM5/PM5HID
// expose it as a static; PM5Mock sets it per instance, derived from whatever
// it's actually replaying, so check the instance first:
const events = monitor.MESSAGE_EVENTS ?? monitor.constructor.MESSAGE_EVENTS;
for (const type of events) {
    monitor.addEventListener(type, event => console.log(event.type, event.data));
}

monitor.disconnect();
monitor.connected();   // → boolean
```

All async operations use `async`/`await`. Events are dispatched as native
`Event` objects with `event.type` and `event.data`; BLE data events also carry
`event.source` and `event.raw` (the underlying `DataView`).

## Transports

### `PM5` — Bluetooth (`lib/pm5-ble.js`)

Requires a [Web Bluetooth]-capable browser (Chrome/Edge) and the PM5's
wireless turned on (**More Options** → **Turn Wireless ON**). Emits all data
under one event type, `multiplexed-information` — real hardware multiplexes
every rowing sub-message onto a single characteristic.

```js
const monitor = new PM5();
monitor.addEventListener('multiplexed-information', e => console.log(e.data));
await monitor.connect(); // prompts the Bluetooth device picker
```

**Known issue: reconnecting after a disconnect can hang.** On some
laptops/OS Bluetooth stacks (reported on Windows, also seen on macOS),
connecting over Web Bluetooth causes the OS to register the PM5 as a
bonded/paired device — a generic "Bluetooth device" entry shows up in your
OS's Bluetooth settings that wasn't there before. If that bond/link isn't
fully released, the next `connect()` attempt's `device.gatt.connect()` can
hang indefinitely rather than failing — a known upstream Chromium behavior,
see [GoogleChrome/samples#668][gatt-connect-hang]. `pm5-ble.js` bounds this
with a 15s timeout so the UI recovers with an actionable error instead of
sticking on "Connecting" forever; the underlying fix is to open your OS
Bluetooth settings, remove/forget that stray device entry, then reconnect
from the app.

[gatt-connect-hang]: https://github.com/GoogleChrome/samples/issues/668

### `PM5HID` — USB (`lib/pm5-hid.js`)

Requires Chrome or Edge (Web HID isn't supported in Firefox/Safari) and the
PM5 connected by USB. Polls the device at 100ms and emits two event types:
`workout` (full frame, every 5th tick) and `stroke` (lighter, every tick).

```js
const monitor = new PM5HID();
monitor.addEventListener('workout', e => console.log(e.data));
monitor.addEventListener('stroke',  e => console.log(e.data));
await monitor.connect(); // prompts the HID device picker
```

### `PM5Mock` — no hardware (`lib/pm5-mock.js`)

Replays a recorded workout as either BLE- or HID-shaped events, so you can
build and demo against real-looking live data without a PM5. See
[Developing without hardware](#developing-without-hardware-pm5mock) below.

## Reading the data

Every event's `event.data` is a plain object keyed by field name (e.g.
`elapsedTime`, `distance`, `heartRate`). `pm5fields` (from `pm5-fields.js`)
maps each key to a human label and a formatter function; look a key up before
trusting it's one you care about, since transports emit fields your app may
not display:

```js
monitor.addEventListener(type, event => {
    for (const [key, value] of Object.entries(event.data)) {
        if (!(key in pm5fields)) continue;
        console.log(pm5fields[key].label, '=', pm5fields[key].printable(value));
    }
});
```

`pm5fields` is the union of every transport's fields — BLE and HID use
different key names for overlapping data (e.g. BLE `strokeRate` vs HID
`cadence`), so most keys coexist without collision. A handful of keys
(`workoutType`, `workoutState`, `strokeState`, `dragFactor`, `heartRate`) are
shared verbatim across transports.

## Developing without hardware: `PM5Mock`

`PM5Mock` replays either of two shapes, and has no knowledge of where either
comes from:

- **Reduced samples** (`samples`/`loadSamples`) — `{ t, distance, pace,
  watts, calPerHour, strokeRate, heartRate }`, synthesized into BLE- or
  HID-shaped events per the `emulate` option since samples carry no
  type/transport info of their own. The shipped source is
  `lib/mock-data/csv-source.js`, which parses a real Concept2 workout CSV
  export (`lib/mock-data/concept2-result-44214428.csv`, or any Concept2
  Logbook CSV via `parseCsv`/`loadFromFile`/`loadFromUrl`) into that shape.
- **Raw events** (`events`/`loadEvents`) — `[{ t, type, data }]`, replayed
  verbatim with no synthesis, since each entry already carries the real
  dispatched type/data (higher fidelity than the reduced samples — every
  field the original transport reported, not just the seven above).
  `lib/mock-data/events-source.js`'s `parseJson`/`loadFromFile` reads this
  shape from a JSON export (see `ergarcade/recorder`'s Export Events).
  `emulate` is irrelevant here — `MESSAGE_EVENTS` is derived from whatever
  types the file actually contains.

```js
const monitor = new PM5Mock({
    loadSamples: () => csvSource.loadFromUrl('mock-data/concept2-result-44214428.csv'),
    // or: loadEvents: () => eventsSource.loadFromFile(uploadedFile),
    emulate: 'ble',   // or 'hid' — which event shape to synthesize (samples only)
    speed: 1,         // wall-clock multiplier (default 1 = real-time)
    loop: true,       // restart at the end
});

monitor.setSpeed(8);  // adjust live; takes effect from the next sample onward
```

A future sample source (e.g. the Concept2 Logbook API) would be a sibling
module to `csv-source.js` producing the same reduced-sample shape — no
changes to `pm5-mock.js` needed either way.

## Shared header UI: `ui/info-modal.js`

Every app built on `pm5-base` uses the same header convention: app name top
left, a small "i" button next to it opening a `<dialog>` that describes the
app and how Mock works, transport controls top right. `ui/info-modal.js` and
`ui/info-modal.css` are the reusable half of that — DOM-touching, unlike the
rest of `lib/`, so they live in their own directory. Load both, keep your
dialog's content in your own `index.html`, and wire it up:

```html
<script src="pm5-base/ui/info-modal.js"></script>
<link rel="stylesheet" href="pm5-base/ui/info-modal.css">
```

```html
<header>
    <h1>Your App</h1>       <!-- the "i" button is inserted right after this -->
    <div id="controls">...</div>
</header>

<dialog id="info-modal">
    <button data-close aria-label="Close">&times;</button>
    <p>What your app does, and how Mock works.</p>
</dialog>
```

```js
initInfoModal(); // defaults: titleSelector 'header h1', dialogSelector '#info-modal'
```

See `example/index.html`/`app.js` for the reference wiring.

## Keeping the screen awake: `ui/wake-lock.js`

Apps running unattended on an arcade display shouldn't get dimmed or
screensaved mid-workout. `initWakeLockIndicator(monitor)` requests a [Screen
Wake Lock] while `monitor` is connected and releases it on disconnect,
reacquiring automatically if the tab was briefly hidden (the browser
force-releases the lock whenever the tab isn't visible) and it's still
connected when it comes back — and inserts a 🔒/🔓 status icon right after
the info button (`#info-toggle`, from `ui/info-modal.js` — load that first)
with a native tooltip explaining the current state:

```html
<script src="pm5-base/ui/info-modal.js"></script>
<script src="pm5-base/ui/wake-lock.js"></script>
<link rel="stylesheet" href="pm5-base/ui/info-modal.css">
<link rel="stylesheet" href="pm5-base/ui/wake-lock.css">
```

Call `createWakeLockIndicator()` once at startup (no `monitor` yet) so the
icon shows its default 🔓 state immediately on page load, before the user
has connected anything:

```js
document.addEventListener('DOMContentLoaded', () => {
    createWakeLockIndicator();
    // ...
});
```

Then wire it to each `monitor` instance — safe to call again with a new
instance (e.g. your app rebuilds `monitor` on every Connect click after a
Disconnect): `initWakeLockIndicator`/`createWakeLockIndicator` reuse the
existing icon rather than inserting another one.

```js
monitor.addEventListener('connected', cbConnected);
monitor.addEventListener('disconnected', cbDisconnected);
initWakeLockIndicator(monitor);
```

No-ops in browsers without the API (e.g. Firefox) rather than throwing — the
icon just stays 🔓. If you want the lock behavior without the icon, call the
lower-level `initWakeLock(monitor)` directly instead (no `#info-toggle`
dependency). See `example/index.html`/`app.js` for the reference wiring.

[Screen Wake Lock]: https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API

## Setting up a new ergarcade product repo

For a one-off script, copying files out of `lib/` (above) is fine. For a full
product repo meant to receive ongoing updates, use a git submodule instead.
Use the `new-product-repo` Claude Code skill (lives in the
[`ergarcade/internal-tools`](https://github.com/ergarcade/internal-tools)
repo, not here) rather than re-deriving this — short version:

1. Create the repo, named after the product (not `pm5-<name>` — that prefix is
   legacy from the pre-submodule `pm5-overlay`/`pm5-detail`/`pm5-dump` repos,
   which are being phased out). Defaults to private; make it public later with
   `gh repo edit --visibility public` once it's ready.
2. Add this repo as a submodule tracking `master`.
3. Set topics for discoverability — `concept2`, `pm5`, and the product name.
4. Write a README stub documenting the submodule clone/update steps
   (`git clone --recurse-submodules ...` or `git submodule update --init` to
   get it, `git submodule update --remote pm5-base` to pull in library
   updates later).
5. Commit and push.

`ergarcade/recorder` and `ergarcade/virtual-monitor` are worked examples.
This only covers the repo scaffolding — the app itself is a separate
conversation once the repo exists.

## Reference: the CSAFE spec

`lib/pm5-hid.js` (and `lib/pm5-ble.js`'s cross-reference comments) implement
commands from Concept2's own protocol document, [Concept2 PM CSAFE
Communication Definition][csafe-spec] (PDF, © Concept2 — publicly downloadable
for third-party developers, not redistributed here).

It's 173 pages, so re-fetching and re-reading it from scratch each time it's
needed is wasteful. Instead, download it once and convert it to
`docs/csafe-spec.txt` for local reference — both `docs/csafe-spec.pdf` and
`docs/csafe-spec.txt` are git-ignored (not committed, since this repo is
public) but persist on disk for reuse in later sessions:

```
curl -sL -o docs/csafe-spec.pdf "https://cms.concept2.com/sites/default/files/2026-03/Concept2%20PM%20CSAFE%20Communication%20Definition.pdf"
pip install --user pypdf
python3 -c "
from pypdf import PdfReader
r = PdfReader('docs/csafe-spec.pdf')
with open('docs/csafe-spec.txt', 'w') as f:
    for i, page in enumerate(r.pages):
        f.write(f'\n\n===== Page {i+1} =====\n\n')
        f.write(page.extract_text() or '')
"
```

[csafe-spec]: https://cms.concept2.com/sites/default/files/2026-03/Concept2%20PM%20CSAFE%20Communication%20Definition.pdf

## Tests

The pure `lib/` modules (field/formatter maps, CSV/JSON parsing, sample
mapping, and `PM5Mock`'s replay engine itself, driven end-to-end with real
timers) have node tests, no browser or hardware required. `ui/wake-lock.js`'s
connect/disconnect/visibilitychange wiring is also tested this way, against a
stubbed `navigator`/`document` — `ui/info-modal.js` is the one DOM-*rendering*
exception, untested since it needs a real browser:

```
node --test
```

[Concept2 PM5]: https://www.concept2.com/indoor-rowers/performance-monitors
[Web Bluetooth]: https://caniuse.com/#feat=web-bluetooth

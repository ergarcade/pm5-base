// Keeps the screen awake for as long as a PM5 is connected (Screen Wake
// Lock API), so an app running unattended on an arcade display doesn't get
// dimmed/screensaved mid-workout, plus a status icon next to the info
// button showing whether the lock is currently held. initWakeLock() itself
// is DOM/browser-API-touching but not DOM-*rendering*, so its logic is
// factored to be testable under node with a stubbed navigator/document (see
// test/wake-lock.test.mjs); createWakeLockIndicator()/initWakeLockIndicator()
// below layer the actual icon on top and are untested DOM-rendering glue,
// like info-modal.js.
function initWakeLock(monitor, { nav = navigator, doc = document, onChange } = {}) {
    let wakeLock = null;

    const acquire = async () => {
        if (!nav.wakeLock) { onChange?.(false); return; } // unsupported (e.g. Firefox) -- no-op
        try {
            wakeLock = await nav.wakeLock.request('screen');
            onChange?.(true);
        } catch (err) {
            console.log(err); // e.g. tab hidden at request time
            onChange?.(false);
        }
    };

    const release = () => {
        wakeLock?.release();
        wakeLock = null;
        onChange?.(false);
    };

    monitor.addEventListener('connected', acquire);
    monitor.addEventListener('disconnected', release);

    // The browser force-releases the lock whenever the tab is hidden; if
    // we're still connected when it becomes visible again, reacquire it.
    doc.addEventListener('visibilitychange', () => {
        if (doc.visibilityState === 'visible' && monitor.connected()) acquire();
    });
}

// Creates the status icon (locked/unlocked emoji) right after #info-toggle,
// with a native `title` tooltip -- no custom tooltip widget needed. Reuses
// the existing icon if one is already there (a caller may rebuild `monitor`
// -- e.g. on every Connect click -- and re-wire it; that must not insert a
// second icon each time), so it's safe to call more than once. Returns the
// setter so a caller can drive it (e.g. from initWakeLock's `onChange`).
// Call it once on its own at startup to show the default "inactive" state
// immediately on page load, before any monitor exists.
function createWakeLockIndicator({ doc = document } = {}) {
    let icon = doc.querySelector('.wake-lock-indicator');
    if (!icon) {
        icon = doc.createElement('span');
        icon.className = 'wake-lock-indicator';
        (doc.querySelector('#info-toggle') ?? doc.querySelector('header h1'))
            .insertAdjacentElement('afterend', icon);
    }

    const setActive = (active) => {
        icon.textContent = active ? '\u{1F512}' : '\u{1F513}'; // 🔒 / 🔓
        icon.title = active
            ? 'Screen wake lock active — screensaver disabled while connected'
            : 'Screen wake lock inactive';
    };
    setActive(false);
    return setActive;
}

// Convenience: creates/reuses the indicator (see createWakeLockIndicator)
// and wires it to `monitor` via initWakeLock. Purely visual on top of
// initWakeLock() above, so it's untested DOM-*rendering* glue, same category
// as info-modal.js (see wake-lock.css for the layout it depends on).
function initWakeLockIndicator(monitor, opts = {}) {
    const setActive = createWakeLockIndicator(opts);
    initWakeLock(monitor, { ...opts, onChange: setActive });
}

// ponytail: export shim so test/ can import the pure wiring function under
// node; a no-op in the browser (no `module`).
if (typeof module !== 'undefined') {
    module.exports = { initWakeLock, createWakeLockIndicator, initWakeLockIndicator };
}

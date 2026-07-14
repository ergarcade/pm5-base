// Pure wiring checks for initWakeLock's connect/disconnect/visibilitychange
// logic, against a stubbed navigator.wakeLock + document. No real DOM.
//   node --test test/wake-lock.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { initWakeLock, createWakeLockIndicator } = createRequire(import.meta.url)('../ui/wake-lock.js');

// EventTarget is a node global; a real PM5/PM5HID/PM5Mock is one too.
class FakeMonitor extends EventTarget {
    #connected = false;
    connected() { return this.#connected; }
    setConnected(v) { this.#connected = v; }
}

function fakeNav(supported = true) {
    if (!supported) return {};
    const lock = { released: false, release() { this.released = true; } };
    return {
        wakeLock: {
            requests: 0,
            lock,
            request() { this.requests++; return Promise.resolve(this.lock); },
        },
    };
}

function fakeDoc() {
    const target = new EventTarget();
    return {
        visibilityState: 'visible',
        addEventListener: target.addEventListener.bind(target),
        dispatchEvent: target.dispatchEvent.bind(target),
        setVisibility(v) { this.visibilityState = v; this.dispatchEvent(new Event('visibilitychange')); },
    };
}

// Minimal fake DOM (no jsdom) -- just enough surface for
// createWakeLockIndicator: an #info-toggle to insert after, plus
// querySelector/createElement/insertAdjacentElement.
function fakeDomWithInfoToggle() {
    const inserted = [];
    const makeElement = () => ({
        className: '', textContent: '', title: '',
        insertAdjacentElement(_pos, el) { inserted.push(el); },
    });
    const infoToggle = makeElement();
    return {
        createElement: () => makeElement(),
        querySelector(sel) {
            if (sel === '#info-toggle') return infoToggle;
            if (sel === '.wake-lock-indicator') return inserted.find(e => e.className === 'wake-lock-indicator') ?? null;
            return null;
        },
        insertedCount: () => inserted.filter(e => e.className === 'wake-lock-indicator').length,
    };
}

test('requests a screen lock on connected', async () => {
    const monitor = new FakeMonitor();
    const nav = fakeNav();
    initWakeLock(monitor, { nav, doc: fakeDoc() });

    monitor.setConnected(true);
    monitor.dispatchEvent(new Event('connected'));
    await Promise.resolve(); // let the request() promise settle

    assert.equal(nav.wakeLock.requests, 1);
});

test('releases the lock on disconnected', async () => {
    const monitor = new FakeMonitor();
    const nav = fakeNav();
    initWakeLock(monitor, { nav, doc: fakeDoc() });

    monitor.setConnected(true);
    monitor.dispatchEvent(new Event('connected'));
    await Promise.resolve();

    monitor.setConnected(false);
    monitor.dispatchEvent(new Event('disconnected'));

    assert.equal(nav.wakeLock.lock.released, true);
});

test('reacquires on visibilitychange if still connected', async () => {
    const monitor = new FakeMonitor();
    const nav = fakeNav();
    const doc = fakeDoc();
    initWakeLock(monitor, { nav, doc });

    monitor.setConnected(true);
    monitor.dispatchEvent(new Event('connected'));
    await Promise.resolve();

    doc.setVisibility('hidden');
    doc.setVisibility('visible');
    await Promise.resolve();

    assert.equal(nav.wakeLock.requests, 2);
});

test('does not reacquire on visibilitychange if not connected', async () => {
    const monitor = new FakeMonitor();
    const nav = fakeNav();
    const doc = fakeDoc();
    initWakeLock(monitor, { nav, doc });

    doc.setVisibility('hidden');
    doc.setVisibility('visible');
    await Promise.resolve();

    assert.equal(nav.wakeLock.requests, 0);
});

test('no-ops without throwing when wakeLock is unsupported', async () => {
    const monitor = new FakeMonitor();
    initWakeLock(monitor, { nav: fakeNav(false), doc: fakeDoc() });

    monitor.setConnected(true);
    assert.doesNotThrow(() => monitor.dispatchEvent(new Event('connected')));
});

test('onChange reports true after acquiring, false after releasing', async () => {
    const monitor = new FakeMonitor();
    const nav = fakeNav();
    const changes = [];
    initWakeLock(monitor, { nav, doc: fakeDoc(), onChange: (active) => changes.push(active) });

    monitor.setConnected(true);
    monitor.dispatchEvent(new Event('connected'));
    await Promise.resolve();

    monitor.setConnected(false);
    monitor.dispatchEvent(new Event('disconnected'));

    assert.deepEqual(changes, [true, false]);
});

test('onChange reports false when wakeLock is unsupported', async () => {
    const monitor = new FakeMonitor();
    const changes = [];
    initWakeLock(monitor, { nav: fakeNav(false), doc: fakeDoc(), onChange: (active) => changes.push(active) });

    monitor.setConnected(true);
    monitor.dispatchEvent(new Event('connected'));
    await Promise.resolve();

    assert.deepEqual(changes, [false]);
});

// Regression: initWakeLockIndicator used to be called fresh on every
// Connect click (a new `monitor` each time) and unconditionally created a
// new icon, so reconnecting repeatedly left extra stray icons in the DOM.
test('createWakeLockIndicator reuses the existing icon across repeated calls', () => {
    const doc = fakeDomWithInfoToggle();

    const setActive1 = createWakeLockIndicator({ doc });
    const setActive2 = createWakeLockIndicator({ doc });

    assert.equal(doc.insertedCount(), 1);

    setActive2(true);
    assert.equal(doc.querySelector('.wake-lock-indicator').textContent, '\u{1F512}');
    setActive1(false);
    assert.equal(doc.querySelector('.wake-lock-indicator').textContent, '\u{1F513}');
});

test('createWakeLockIndicator defaults to the inactive icon immediately', () => {
    const doc = fakeDomWithInfoToggle();
    createWakeLockIndicator({ doc });
    assert.equal(doc.querySelector('.wake-lock-indicator').textContent, '\u{1F513}');
});

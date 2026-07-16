const formatCardTitle = type =>
    type.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const el = sel => document.querySelector(sel);

// Transport id -> how to build it and whether the browser supports it.
// Both classes share the same EventTarget-native API (connect/disconnect/
// connected + connecting/connected/disconnected events + static
// MESSAGE_EVENTS), so everything below is transport-agnostic.
const TRANSPORTS = {
    bluetooth: { label: 'Bluetooth', build: () => new PM5(),    supported: () => !!navigator.bluetooth },
    usb:       { label: 'USB',       build: () => new PM5HID(), supported: () => !!navigator.hid },
    mock:      {
        label: 'Mock',
        build: () => {
            const file = el('#mock-file').files[0];
            const source = !file
                ? { loadSamples: () => csvSource.loadFromUrl('../lib/mock-data/concept2-result-44214428.csv') }
                : file.name.endsWith('.json')
                ? { loadEvents: () => eventsSource.loadFromFile(file) }
                : { loadSamples: () => csvSource.loadFromFile(file) };
            return new PM5Mock({ ...source, emulate: 'ble', speed: Number(el('#mock-speed').value), loop: true });
        },
        supported: () => true,
    },
};

// Labels for the fields each transport reports in its `connected` event.
const INFO_LABELS = {
    model: 'Model', firmwareVersion: 'FW', serial: 'SN',
    firmwareRevision: 'FW', hardwareRevision: 'HW',
    manufacturerName: 'MNF', serialNumber: 'SN',
};

let monitor = null;

const setMonitorInfo = (data) => {
    el('#monitor-information').textContent = Object.entries(data ?? {})
        .filter(([, v]) => v)
        .map(([k, v]) => `${INFO_LABELS[k] ?? k}: ${v}`)
        .join(' | ');
};

const cbConnecting = () => {
    el('#connect').innerText = 'Connecting';
    el('#connect').disabled = true;
    el('#transport').disabled = true;
    el('#mock-file').disabled = true;
    el('#monitor-information').textContent = 'Please wait...';
};

const cbConnected = (event) => {
    el('#connect').innerText = 'Disconnect';
    el('#connect').disabled = false;
    setMonitorInfo(event.data);

    // The GATT/HID link is up now, so it's safe to subscribe to this
    // transport's data events (BLE starts characteristic notifications here).
    // Instance-first: PM5Mock's event shape depends on its `emulate` option,
    // so it sets MESSAGE_EVENTS per-instance; PM5/PM5HID have no instance
    // field and fall back to their static list, unchanged.
    const events = monitor.MESSAGE_EVENTS ?? monitor.constructor.MESSAGE_EVENTS;
    for (const type of events) {
        monitor.addEventListener(type, cbMessage);
    }
};

const cbDisconnected = () => {
    el('#connect').innerText = 'Connect';
    el('#connect').disabled = false;
    el('#transport').disabled = false;
    el('#mock-file').disabled = false;
    el('#monitor-information').textContent = '';
    monitor = null;
};

const getOrCreateCard = (id, title) => {
    let div = document.getElementById(id);
    if (!div) {
        div = document.createElement('div');
        div.id = id;
        div.className = 'card';

        const t = document.createElement('h3');
        t.className = 'card-title';
        t.textContent = title;
        div.appendChild(t);

        el('#notifications').appendChild(div);
    }
    return div;
};

// `ergMachineType` is only relevant to the pace fields' printable (bike vs
// rower/ski pace unit); every other field's printable ignores the extra
// arg. It's undefined unless this event happens to carry it itself --
// BLE's additional-status bundles ergMachineType alongside currentPace/
// averagePace in the same payload, so it's simplest to just read it off
// the same event rather than tracking it as separate running state.
const setField = (div, k, v, ergMachineType) => {
    let s = div.querySelector(`.field-value.${k}`);
    if (!s) {
        const p = document.createElement('div');
        p.className = 'field';

        const desc = document.createElement('span');
        desc.className = 'field-label';
        desc.textContent = pm5fields[k].label;

        s = document.createElement('span');
        s.className = `field-value ${k}`;

        p.appendChild(desc);
        p.appendChild(s);
        div.appendChild(p);

        p.addEventListener('click', () => p.classList.toggle('highlight'));
    }
    s.textContent = pm5fields[k].printable(v, ergMachineType);
};

// Two card layouts: grouped by the transport's event type (matches how the
// data actually arrives on the wire), or split so each metric gets its own
// card (a demo/debugging aid, not a protocol distinction).
const cbMessage = (event) => {
    if (el('#split-metrics').checked) {
        for (const [k, v] of Object.entries(event.data)) {
            if (!(k in pm5fields)) continue;
            setField(getOrCreateCard(`metric-${k}`, pm5fields[k].label), k, v, event.data.ergMachineType);
        }
        return;
    }

    const div = getOrCreateCard(event.type, formatCardTitle(event.type));
    for (const [k, v] of Object.entries(event.data)) {
        if (k in pm5fields) setField(div, k, v, event.data.ergMachineType);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const transportSel = el('#transport');
    const speedSel = el('#mock-speed');
    const fileSel = el('#mock-file');

    // Flag unsupported transports and default to the first supported one.
    let firstSupported = null;
    for (const [id, t] of Object.entries(TRANSPORTS)) {
        const opt = transportSel.querySelector(`option[value="${id}"]`);
        if (!opt) continue;
        if (t.supported()) {
            firstSupported ??= id;
        } else {
            opt.disabled = true;
            opt.textContent += ' (unsupported)';
        }
    }
    if (firstSupported) transportSel.value = firstSupported;

    // The speed control and file picker only apply to Mock.
    const syncMockControlsVisibility = () => {
        const isMock = transportSel.value === 'mock';
        speedSel.hidden = !isMock;
        fileSel.hidden = !isMock;
    };
    syncMockControlsVisibility();
    transportSel.addEventListener('change', syncMockControlsVisibility);

    // Live speed changes take effect immediately if Mock is connected.
    speedSel.addEventListener('change', () => monitor?.setSpeed?.(Number(speedSel.value)));

    // Switching card layout mid-session would otherwise leave stale cards
    // from the old layout alongside the new ones; clear and let the next
    // data event rebuild from scratch.
    el('#split-metrics').addEventListener('change', () => el('#notifications').replaceChildren());

    el('#connect').addEventListener('click', () => {
        if (monitor?.connected()) {
            monitor.disconnect();
            return;
        }

        const t = TRANSPORTS[transportSel.value];
        if (!t.supported()) {
            alert(`${t.label} is not supported by this browser.`);
            return;
        }

        // Clear any cards from a previous session's transport.
        el('#notifications').replaceChildren();

        monitor = t.build();
        monitor.addEventListener('connecting', cbConnecting);
        monitor.addEventListener('connected', cbConnected);
        monitor.addEventListener('disconnected', cbDisconnected);
        initWakeLockIndicator(monitor);

        monitor.connect()
            .then(() => { if (!monitor?.connected()) cbDisconnected(); })  // picker cancelled
            .catch((error) => {
                console.log(error);
                cbDisconnected();
                el('#monitor-information').textContent = error.message;
            });
    });

    initInfoModal();
    createWakeLockIndicator(); // shows the default (inactive) icon before any monitor exists
});

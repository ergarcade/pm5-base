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
        build: () => new PM5Mock({
            loadSamples: () => csvSource.loadFromUrl('../lib/mock-data/concept2-result-44214428.csv'),
            emulate: 'ble',
            speed: Number(el('#mock-speed').value),
            loop: true,
        }),
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
    el('#monitor-information').textContent = '';
    monitor = null;
};

const cbMessage = (event) => {
    let div = document.getElementById(event.type);
    if (!div) {
        div = document.createElement('div');
        div.id = event.type;
        div.className = 'card';

        const title = document.createElement('h3');
        title.className = 'card-title';
        title.textContent = formatCardTitle(event.type);
        div.appendChild(title);

        el('#notifications').appendChild(div);
    }

    for (const [k, v] of Object.entries(event.data)) {
        if (!(k in pm5fields)) continue;

        let s = document.querySelector(`#${event.type} .field-value.${k}`);
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
        s.textContent = pm5fields[k].printable(v);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const transportSel = el('#transport');
    const speedSel = el('#mock-speed');

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

    // The speed control only applies to Mock.
    const syncSpeedVisibility = () => { speedSel.hidden = transportSel.value !== 'mock'; };
    syncSpeedVisibility();
    transportSel.addEventListener('change', syncSpeedVisibility);

    // Live speed changes take effect immediately if Mock is connected.
    speedSel.addEventListener('change', () => monitor?.setSpeed?.(Number(speedSel.value)));

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

        monitor.connect()
            .then(() => { if (!monitor?.connected()) cbDisconnected(); })  // picker cancelled
            .catch((error) => { console.log(error); cbDisconnected(); });
    });

    const instructionDialog = el('#instruction-text');
    el('#toggle-instructions').addEventListener('click', () => instructionDialog.showModal());
    el('#close-instructions').addEventListener('click', () => instructionDialog.close());
    instructionDialog.addEventListener('click', (e) => {
        if (e.target === instructionDialog) instructionDialog.close();
    });
});

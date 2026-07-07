const toggleClass = (el, className) => el.classList.toggle(className);

let m;

const cbConnecting = () => {
    document.querySelector('#connect').innerText = 'Connecting';
    document.querySelector('#connect').disabled = true;
    document.querySelector('#monitor-information').textContent = 'Please wait...';
};

const cbConnected = async () => {
    document.querySelector('#connect').innerText = 'Disconnect';
    document.querySelector('#connect').disabled = false;

    try {
        const { firmwareRevision, hardwareRevision, manufacturerName, serialNumber } =
            await m.getMonitorInformation();
        document.querySelector('#monitor-information').textContent =
            `FW: ${firmwareRevision} | HW: ${hardwareRevision} | MNF: ${manufacturerName} | SN: ${serialNumber}`;
    } catch (error) {
        document.querySelector('#monitor-information').textContent = error;
    }
};

const cbDisconnected = () => {
    document.querySelector('#connect').innerText = 'Connect';
    document.querySelector('#connect').disabled = false;
    document.querySelector('#monitor-information').textContent = '';
};

const cbMessage = (m) => {
    let div = document.getElementById(m.type);
    if (!div) {
        div = document.createElement('div');
        div.id = m.type;
        document.querySelector('#notifications').appendChild(div);
    }

    for (const [k, v] of Object.entries(m.data)) {
        let s = document.querySelector(`#${m.type} span.${k}`);
        if (!s) {
            const p    = document.createElement('div');
            const desc = document.createElement('span');
            desc.className = 'element';
            desc.textContent = pm5fields[k].label;

            s = document.createElement('span');
            s.className = `value ${k}`;

            p.appendChild(desc);
            p.appendChild(s);
            div.appendChild(p);

            p.addEventListener('click', () => p.classList.toggle('highlight'));
        }
        s.textContent = pm5fields[k].printable(v);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    m = new PM5(cbConnecting, cbConnected, cbDisconnected, cbMessage);

    const connectBtn = document.querySelector('#connect');
    connectBtn.addEventListener('click', () => {
        if (!navigator.bluetooth) {
            alert('Web Bluetooth is not supported! You need a browser and ' +
                'platform that supports Web Bluetooth to use this application.');
        }

        if (m.connected()) {
            m.doDisconnect();
        } else {
            m.doConnect();
        }
    });

    const toggleBtn = document.querySelector('#toggle-instructions');
    toggleBtn.addEventListener('click', () => {
        const instructionText = document.querySelector('#instruction-text');
        const visible = !instructionText.classList.toggle('hidden');
        toggleBtn.innerText = visible ? 'Hide instructions' : 'Show instructions';
    });
});

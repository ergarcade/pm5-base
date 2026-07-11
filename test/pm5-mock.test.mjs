// Pure-data checks for the mock transport's CSV parsing and sample mapping.
// No hardware, no DOM, no timers.
//   node --test test/pm5-mock.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PM5Mock }   = require('../lib/pm5-mock.js');
const { csvSource } = require('../lib/mock-data/csv-source.js');
const { pm5fields } = require('../lib/pm5-fields.js');
const csvText       = readFileSync(new URL('../lib/mock-data/concept2-result-44214428.csv', import.meta.url), 'utf8');

test('parseCsv parses the shipped CSV', () => {
    const samples = csvSource.parseCsv(csvText);
    assert.equal(samples.length, 689);

    assert.deepEqual(samples[0], {
        t: 0.7, distance: 2.4, pace: 163.3, watts: 80,
        calPerHour: 576, strokeRate: undefined, heartRate: undefined,
    });

    const last = samples[samples.length - 1];
    assert.equal(last.t, 1798.6);
    assert.equal(last.distance, 7584.1);
    assert.equal(last.strokeRate, 26);
    assert.equal(last.heartRate, undefined);
});

test('_toBleGeneralStatus carries only elapsedTime/distance', () => {
    const data = PM5Mock._toBleGeneralStatus({ t: 10, distance: 20, pace: 150, watts: 100, strokeRate: 24, heartRate: 142 });
    assert.deepEqual(data, { elapsedTime: 10, distance: 20 });
    for (const k of Object.keys(data)) assert.ok(k in pm5fields, `missing key ${k}`);
});

test('_toBleAdditionalStatus omits undefined fields and only emits known pm5fields keys', () => {
    const withHr    = PM5Mock._toBleAdditionalStatus({ t: 10, distance: 20, pace: 150, watts: 100, strokeRate: 24, heartRate: 142 });
    const withoutHr = PM5Mock._toBleAdditionalStatus({ t: 0.7, distance: 2.4, pace: 163.3, watts: 80, strokeRate: undefined, heartRate: undefined });

    assert.deepEqual(withHr, {
        elapsedTime: 10, currentPace: 150,
        averagePower: 100, strokeRate: 24, heartRate: 142,
    });
    assert.deepEqual(withoutHr, {
        elapsedTime: 0.7, currentPace: 163.3, averagePower: 80,
    });
    for (const k of Object.keys(withHr)) assert.ok(k in pm5fields, `missing key ${k}`);
});

test('_toBleGeneralStatus and _toBleAdditionalStatus never overlap except elapsedTime', () => {
    const sample = { t: 10, distance: 20, pace: 150, watts: 100, strokeRate: 24, heartRate: 142 };
    const general    = Object.keys(PM5Mock._toBleGeneralStatus(sample));
    const additional = Object.keys(PM5Mock._toBleAdditionalStatus(sample));
    const overlap = general.filter(k => additional.includes(k));
    assert.deepEqual(overlap, ['elapsedTime']);
});

test('_toBleAdditionalStrokeData omits undefined fields and only emits known pm5fields keys', () => {
    const withRate    = PM5Mock._toBleAdditionalStrokeData({ t: 10, calPerHour: 576 });
    const withoutRate = PM5Mock._toBleAdditionalStrokeData({ t: 0.7, calPerHour: undefined });

    assert.deepEqual(withRate, { elapsedTime: 10, strokeCaloricBurnRate: 576 });
    assert.deepEqual(withoutRate, { elapsedTime: 0.7 });
    for (const k of Object.keys(withRate)) assert.ok(k in pm5fields, `missing key ${k}`);
});

test('_toHid omits undefined fields and only emits known pm5fields keys', () => {
    const withHr    = PM5Mock._toHid({ t: 10, distance: 20, pace: 150, watts: 100, strokeRate: 24, heartRate: 142 });
    const withoutHr = PM5Mock._toHid({ t: 0.7, distance: 2.4, pace: 163.3, watts: 80, strokeRate: undefined, heartRate: undefined });

    assert.deepEqual(withHr, {
        workoutState: 1, workTime: 10, workDistance: 20,
        pace: 150, power: 100, cadence: 24, heartRate: 142,
    });
    assert.deepEqual(withoutHr, {
        workoutState: 1, workTime: 0.7, workDistance: 2.4, pace: 163.3, power: 80,
    });
    for (const k of Object.keys(withHr)) assert.ok(k in pm5fields, `missing key ${k}`);
});

test('_toRawEvents flattens samples into ble-shaped raw events with t in ms', () => {
    const samples = [
        { t: 1, distance: 5, pace: 150, watts: 100, calPerHour: 600, strokeRate: 24, heartRate: 140 },
        { t: 2, distance: 10, pace: 148, watts: 105, calPerHour: 610, strokeRate: 25, heartRate: 142 },
    ];
    const events = PM5Mock._toRawEvents(samples, 'ble');

    assert.equal(events.length, 6); // 3 sub-messages per sample
    for (const e of events) assert.equal(e.type, 'multiplexed-information');
    assert.deepEqual(events.map(e => e.t), [1000, 1000, 1000, 2000, 2000, 2000]);
    assert.deepEqual(events[0].data, PM5Mock._toBleGeneralStatus(samples[0]));
    assert.deepEqual(events[1].data, PM5Mock._toBleAdditionalStatus(samples[0]));
    assert.deepEqual(events[2].data, PM5Mock._toBleAdditionalStrokeData(samples[0]));
});

test('_toRawEvents flattens samples into hid-shaped raw events, one per sample', () => {
    const samples = [{ t: 1, distance: 5, pace: 150, watts: 100, strokeRate: 24, heartRate: 140 }];
    const events = PM5Mock._toRawEvents(samples, 'hid');

    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'workout');
    assert.equal(events[0].t, 1000);
    assert.deepEqual(events[0].data, PM5Mock._toHid(samples[0]));
});

test('PM5Mock replays samples end-to-end (regression: samples/loadSamples path after the raw-event refactor)', async () => {
    const samples = [
        { t: 1, distance: 5, pace: 150, watts: 100, calPerHour: 600, strokeRate: 24, heartRate: 140 },
        { t: 2, distance: 10, pace: 148, watts: 105, calPerHour: 610, strokeRate: 25, heartRate: 142 },
    ];
    const monitor = new PM5Mock({ samples, emulate: 'ble', speed: 1000, loop: false });
    assert.deepEqual(monitor.MESSAGE_EVENTS, ['multiplexed-information']);

    const received = [];
    for (const type of monitor.MESSAGE_EVENTS) monitor.addEventListener(type, e => received.push(e));

    await monitor.connect();
    await new Promise(resolve => setTimeout(resolve, 100));

    assert.equal(received.length, 6);
});

test('PM5Mock replays raw `events` verbatim, deriving MESSAGE_EVENTS from what they actually contain', async () => {
    const events = [
        { t: 0, type: 'workout', data: { workTime: 1, workDistance: 5 } },
        { t: 5, type: 'stroke', data: { strokeRate: 24 } },
        { t: 10, type: 'workout', data: { workTime: 2, workDistance: 10 } },
    ];
    const monitor = new PM5Mock({ events, speed: 1000, loop: false });
    assert.deepEqual(monitor.MESSAGE_EVENTS.sort(), ['stroke', 'workout']);

    const received = [];
    for (const type of monitor.MESSAGE_EVENTS) monitor.addEventListener(type, e => received.push(e));

    await monitor.connect();
    await new Promise(resolve => setTimeout(resolve, 50));

    assert.equal(received.length, 3);
    assert.deepEqual(received[0].data, events[0].data);
    assert.equal(received[0].type, 'workout');
    assert.deepEqual(received[1].data, events[1].data);
    assert.equal(received[1].type, 'stroke');
});

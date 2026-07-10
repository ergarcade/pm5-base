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

test('_toBle omits undefined fields and only emits known pm5fields keys', () => {
    const withHr    = PM5Mock._toBle({ t: 10, distance: 20, pace: 150, watts: 100, strokeRate: 24, heartRate: 142 });
    const withoutHr = PM5Mock._toBle({ t: 0.7, distance: 2.4, pace: 163.3, watts: 80, strokeRate: undefined, heartRate: undefined });

    assert.deepEqual(withHr, {
        elapsedTime: 10, distance: 20, currentPace: 150,
        averagePower: 100, strokeRate: 24, heartRate: 142,
    });
    assert.deepEqual(withoutHr, {
        elapsedTime: 0.7, distance: 2.4, currentPace: 163.3, averagePower: 80,
    });
    for (const k of Object.keys(withHr)) assert.ok(k in pm5fields, `missing key ${k}`);
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

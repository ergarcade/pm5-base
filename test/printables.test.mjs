// Pure-data checks for the merged fields module. No hardware, no DOM.
//   node --test test/printables.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { pm5printables, pm5fields } = createRequire(import.meta.url)('../lib/pm5-fields.js');

test('heartRate merges both no-belt sentinels (BLE 255, HID 0)', () => {
    assert.equal(pm5printables.heartRate(0), 'N/A');
    assert.equal(pm5printables.heartRate(255), 'N/A');
    assert.equal(pm5printables.heartRate(142), '142 bpm');
});

test('shared enum tables resolve for both transports', () => {
    assert.equal(pm5printables.workoutType(0), 'Just row, no splits');
    assert.equal(pm5printables.workoutState(1), 'Workout Row');
    assert.equal(pm5printables.strokeState(2), 'Driving');
    assert.equal(pm5printables.workoutType(999), 'unknown');
});

test('HID-unique formatters present', () => {
    assert.equal(pm5printables.deviceStatus(5), 'In Use');
    assert.equal(pm5printables.pace(125), '2:05/500m');
    assert.equal(pm5printables.pace(0), '--:--');
    assert.equal(pm5printables.spm(24), '24 spm');
});

test('pace defaults to /500m when no machine type is given (HID, or a BLE event without ergMachineType)', () => {
    assert.equal(pm5printables.pace(125), '2:05/500m');
    assert.equal(pm5printables.pace(125, undefined), '2:05/500m');
});

test('pace defaults to /500m for a non-bike ergMachineType (e.g. rower, ski)', () => {
    assert.equal(pm5printables.pace(125, 0), '2:05/500m');   // Static D (rower)
    assert.equal(pm5printables.pace(125, 128), '2:05/500m'); // Static Ski
});

test('pace doubles the raw value and switches to /1000m for every bike ergMachineType', () => {
    for (const bike of [192, 193, 194, 207]) {
        assert.equal(pm5printables.pace(125, bike), '4:10/1000m');
    }
});

test('pace still shows the empty-reading sentinel on a bike', () => {
    assert.equal(pm5printables.pace(0, 192), '--:--');
});

test('both transports\' keys are all present in the merged map', () => {
    // BLE
    for (const k of ['elapsedTime', 'strokePower', 'averagePace', 'heartRate'])
        assert.ok(k in pm5fields, `missing BLE key ${k}`);
    // HID
    for (const k of ['status', 'workTime', 'workDistance', 'pace', 'power', 'calories', 'cadence'])
        assert.ok(k in pm5fields, `missing HID key ${k}`);
});

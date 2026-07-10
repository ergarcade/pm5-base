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
    assert.equal(pm5printables.pace500m(125), '2:05/500m');
    assert.equal(pm5printables.pace500m(0), '--:--');
    assert.equal(pm5printables.spm(24), '24 spm');
});

test('both transports\' keys are all present in the merged map', () => {
    // BLE
    for (const k of ['elapsedTime', 'strokePower', 'averagePace', 'heartRate'])
        assert.ok(k in pm5fields, `missing BLE key ${k}`);
    // HID
    for (const k of ['status', 'workTime', 'workDistance', 'pace', 'power', 'calories', 'cadence'])
        assert.ok(k in pm5fields, `missing HID key ${k}`);
});

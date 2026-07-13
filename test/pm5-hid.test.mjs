// Pure-data checks for the HID pace conversion. No hardware, no DOM.
//   node --test test/pm5-hid.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { hidPaceSeconds } = createRequire(import.meta.url)('../lib/pm5-hid.js');

test('hidPaceSeconds passes the raw CSAFE_GETPACE_CMD value through unscaled (1 sec/500m lsb)', () => {
    assert.equal(hidPaceSeconds(0), 0);
    assert.equal(hidPaceSeconds(237), 237); // ~3:57/500m, seen in a real recording
    assert.equal(hidPaceSeconds(90), 90);   // world-record-ish pace, plausible whole-second value
});

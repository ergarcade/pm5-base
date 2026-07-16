// Pure test of the gatt.connect() timeout guard. No Bluetooth/DOM needed.
//   node --test test/pm5-ble.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { withTimeout } = createRequire(import.meta.url)('../lib/pm5-ble.js');

test('withTimeout resolves with the inner promise value when it settles first', async () => {
    const result = await withTimeout(Promise.resolve('connected'), 1000, 'too slow');
    assert.equal(result, 'connected');
});

test('withTimeout rejects with the given message if the inner promise never settles', async () => {
    const neverSettles = new Promise(() => {});
    await assert.rejects(
        () => withTimeout(neverSettles, 10, 'connection timed out'),
        { message: 'connection timed out' }
    );
});

test('withTimeout propagates the inner promise rejection when it rejects first', async () => {
    await assert.rejects(
        () => withTimeout(Promise.reject(new Error('device error')), 1000, 'too slow'),
        { message: 'device error' }
    );
});

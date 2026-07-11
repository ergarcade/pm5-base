// Pure-data checks for the JSON mock data source. No hardware, no DOM.
//   node --test test/events-source.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { eventsSource } = createRequire(import.meta.url)('../lib/mock-data/events-source.js');

test('parseJson relativizes t so the first event starts at 0', () => {
    const events = eventsSource.parseJson(JSON.stringify([
        { t: 1700000000000, type: 'multiplexed-information', data: { elapsedTime: 1 } },
        { t: 1700000001000, type: 'multiplexed-information', data: { elapsedTime: 2 } },
    ]));
    assert.deepEqual(events.map(e => e.t), [0, 1000]);
    assert.equal(events[0].type, 'multiplexed-information');
    assert.deepEqual(events[1].data, { elapsedTime: 2 });
});

test('parseJson passes type/data through untouched', () => {
    const events = eventsSource.parseJson(JSON.stringify([
        { t: 5, type: 'workout', data: { workTime: 1, workDistance: 5 } },
    ]));
    assert.deepEqual(events[0].data, { workTime: 1, workDistance: 5 });
    assert.equal(events[0].type, 'workout');
});

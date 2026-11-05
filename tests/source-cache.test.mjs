import test from 'node:test';
import assert from 'node:assert/strict';
import { AsyncLruCache, LatestTaskQueue, SupersededTaskError } from '../src/source-cache.ts';

function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

test('source cache bounds retained entries, refreshes recency, and shares pending and settled requests', async () => {
  const cache = new AsyncLruCache(2), first = deferred();
  const a = cache.getOrLoad('a', () => first.promise);
  assert.equal(cache.getOrLoad('a', () => assert.fail('duplicate load')), a);
  await cache.getOrLoad('b', () => 'B');
  assert.equal(cache.getOrLoad('a', () => assert.fail('pending reload')), a);
  await cache.getOrLoad('c', () => 'C');
  assert.equal(cache.size, 2);
  first.resolve('A');
  assert.equal(await a, 'A');
  assert.equal(await cache.getOrLoad('a', () => assert.fail('settled reload')), 'A');
  assert.equal(await cache.getOrLoad('b', () => 'B reloaded'), 'B reloaded');
  assert.equal(cache.size, 2);
});

test('an evicted pending failure cannot remove a newer request for the same source', async () => {
  const cache = new AsyncLruCache(1), old = deferred(), replacement = deferred();
  const previous = cache.getOrLoad('source', () => old.promise);
  const failed = assert.rejects(previous, /old network failure/);
  await cache.getOrLoad('other', () => 'other');
  const current = cache.getOrLoad('source', () => replacement.promise);
  old.reject(new Error('old network failure'));
  await failed;
  assert.equal(cache.getOrLoad('source', () => assert.fail('new request was deleted')), current);
  replacement.resolve('new source');
  assert.equal(await current, 'new source');
});

test('an evicted successful request neither replaces new data nor cancels its original caller', async () => {
  const cache = new AsyncLruCache(1), old = deferred();
  const previous = cache.getOrLoad('source', () => old.promise);
  await cache.getOrLoad('other', () => 'other');
  const current = cache.getOrLoad('source', () => 'new revision');
  old.resolve('old revision');
  assert.equal(await previous, 'old revision');
  assert.equal(await cache.getOrLoad('source', () => assert.fail('replacement lost')), 'new revision');
  assert.equal(await current, 'new revision');
});

test('failed or synchronously throwing loads are removed and can be retried', async () => {
  const cache = new AsyncLruCache(2);
  await assert.rejects(cache.getOrLoad('source', () => { throw new Error('denied'); }), /denied/);
  assert.equal(cache.size, 0);
  assert.equal(await cache.getOrLoad('source', () => 'available'), 'available');
  for (const capacity of [0, -1, 1.5, NaN, Infinity]) assert.throws(() => new AsyncLruCache(capacity), /positive integer/);
});

test('search queue bounds work to active and latest, explicitly rejects superseded callers, and returns both retained results', async () => {
  const queue = new LatestTaskQueue(), gate = deferred(), events = [];
  const first = queue.run(async () => { events.push('first'); await gate.promise; return 1; });
  const second = queue.run(() => assert.fail('obsolete search should never run'));
  const skipped = assert.rejects(second, SupersededTaskError);
  const third = queue.run(() => { events.push('third'); return 3; });
  await Promise.resolve();
  assert.deepEqual(events, ['first']);
  gate.resolve();
  assert.equal(await first, 1);
  await skipped;
  assert.equal(await third, 3);
  assert.deepEqual(events, ['first', 'third']);
});

test('a failed active search cannot block the latest queued request or future searches', async () => {
  const queue = new LatestTaskQueue(), gate = deferred();
  const first = queue.run(() => gate.promise);
  const failed = assert.rejects(first, /missing index/);
  const next = queue.run(() => 'latest');
  gate.reject(new Error('missing index'));
  await failed;
  assert.equal(await next, 'latest');
  assert.equal(await queue.run(() => 'future'), 'future');
});

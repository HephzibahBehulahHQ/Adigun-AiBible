import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as tick } from 'node:timers/promises';
import { emptyHistoricalStudy } from '../src/historical/model.ts';
import { loadHistoricalStudy, saveHistoricalStudy } from '../src/historical/storage.ts';

function fixture(initial) {
  let stored = initial === undefined ? undefined : structuredClone(initial), active;
  const queue = [], options = { holdWrite: false, failWrite: false, failOpen: false }, openedNames = [];
  const db = { objectStoreNames: { contains: () => true }, close() {}, createObjectStore() {},
    transaction(_name, mode) {
      const tx = { mode, aborted: false, pending: undefined, request: undefined, objectStore: () => ({
        get() { const request = {}; tx.request = request; queue.push(tx); queueMicrotask(pump); return request; },
        put(value) { tx.pending = structuredClone(value); if (options.failWrite) queueMicrotask(() => { tx.onerror?.(); tx.abort(); }); }
      }), abort() { if (tx.aborted) return; tx.aborted = true; queueMicrotask(() => { tx.onabort?.(); if (active === tx) { active = undefined; pump(); } }); } }; return tx;
    }
  };
  function finish() { const tx = active; if (!tx || tx.aborted) return; if (tx.pending !== undefined) stored = structuredClone(tx.pending); tx.oncomplete?.(); active = undefined; pump(); }
  function pump() { if (active || !queue.length) return; const tx = active = queue.shift(); queueMicrotask(() => { tx.request.result = stored === undefined ? undefined : structuredClone(stored); tx.request.onsuccess?.(); if (!tx.aborted && !(options.holdWrite && tx.mode === 'readwrite')) queueMicrotask(finish); }); }
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, writable: true, value: { open(name) { openedNames.push(name); const request = {}; queueMicrotask(() => { if (options.failOpen) request.onerror?.(); else { request.result = db; request.onsuccess?.(); } }); return request; } } });
  return { options, finish, openedNames, stored: () => stored, dispose: () => { db.onversionchange?.(); delete globalThis.indexedDB; } };
}
const locator = { workId: 'didache', editionId: 'didache-lightfoot', sourceRevision: 'wikisource-14637905', chapter: 1, unit: 1 };
const note = { id: 'test-note', locator, text: 'Private historical observation', updatedAt: '2026-11-05T10:00:00.000Z' };

test('historical notebook saves resolve only after their scoped transaction commits', async () => {
  const db = fixture();
  try {
    assert.deepEqual(await loadHistoricalStudy(), emptyHistoricalStudy()); assert.deepEqual(db.openedNames, ['adigun-aibible-historical-study']);
    db.options.holdWrite = true; let resolved = false;
    const saving = saveHistoricalStudy({ ...emptyHistoricalStudy(), notes: [note] }, 0).then(value => { resolved = true; return value; });
    await tick(); assert.equal(resolved, false); assert.equal(db.stored(), undefined);
    db.finish(); assert.equal((await saving).revision, 1); assert.equal((await loadHistoricalStudy()).notes[0].text, note.text);
  } finally { db.dispose(); }
});
test('failed writes and concurrent tabs cannot erase private historical notes', async () => {
  const previous = { ...emptyHistoricalStudy(), revision: 3, notes: [note], bookmarks: [locator] }, db = fixture(previous);
  try {
    db.options.failWrite = true; await assert.rejects(saveHistoricalStudy(emptyHistoricalStudy(), 3), /not saved/); assert.deepEqual(db.stored(), previous);
    db.options.failWrite = false;
    const results = await Promise.allSettled([saveHistoricalStudy(previous, 3), saveHistoricalStudy(emptyHistoricalStudy(), 3)]);
    assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].status, 'rejected'); assert.match(results[1].reason.message, /Another tab/);
    assert.equal((await loadHistoricalStudy()).notes[0].id, note.id);
  } finally { db.dispose(); }
});
test('corrupt historical storage is preserved and unavailable storage remains retryable', async () => {
  const previous = { ...emptyHistoricalStudy(), schemaVersion: 99, notes: [note] }, db = fixture(previous);
  try { await assert.rejects(loadHistoricalStudy(), /invalid/); await assert.rejects(saveHistoricalStudy(emptyHistoricalStudy(), 0), /invalid/); assert.deepEqual(db.stored(), previous); }
  finally { db.dispose(); }
  const retry = fixture();
  try { retry.options.failOpen = true; await assert.rejects(loadHistoricalStudy(), /could not be opened/); retry.options.failOpen = false; assert.deepEqual(await loadHistoricalStudy(), emptyHistoricalStudy()); }
  finally { retry.dispose(); }
});

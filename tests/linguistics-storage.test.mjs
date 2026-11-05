import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as tick } from 'node:timers/promises';
import { readFile } from 'node:fs/promises';
import { emptyLinguistics, newExperiment } from '../src/linguistics/model.ts';
import { loadLinguistics, saveLinguistics } from '../src/linguistics/storage.ts';

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
const manifest = JSON.parse(await readFile(new URL('../data/manifest.json', import.meta.url), 'utf8'));
const lexicon = JSON.parse(await readFile(new URL('../data/linguistics/hebrew.json', import.meta.url), 'utf8'));
const passage = { reference: { bookId: 'GEN', editionId: 'eng-web', chapter: 1, verse: 1, endVerse: 1 }, sourceSha256: manifest.edition.sha256, editionName: manifest.edition.name, bookName: 'Genesis' };
const experiment = { ...newExperiment(lexicon.entries[0], lexicon, passage), notes: 'Keep my private translation notes' };

test('translation exercise persistence resolves only after the transaction commits', async () => {
  const db = fixture();
  try {
    assert.deepEqual(await loadLinguistics(), emptyLinguistics()); assert.deepEqual(db.openedNames, ['adigun-aibible-linguistics']);
    db.options.holdWrite = true; let resolved = false;
    const saving = saveLinguistics({ ...emptyLinguistics(), experiments: [experiment] }, 0).then(value => { resolved = true; return value; });
    await tick(); assert.equal(resolved, false); assert.equal(db.stored(), undefined);
    db.finish(); assert.equal((await saving).revision, 1); assert.equal((await loadLinguistics()).experiments[0].notes, experiment.notes);
  } finally { db.dispose(); }
});
test('failed writes and stale concurrent experiments cannot erase persisted translation exercise work', async () => {
  const previous = { ...emptyLinguistics(), revision: 3, experiments: [experiment] }, db = fixture(previous);
  try {
    db.options.failWrite = true; await assert.rejects(saveLinguistics(emptyLinguistics(), 3), /not saved/); assert.deepEqual(db.stored(), previous);
    db.options.failWrite = false;
    const results = await Promise.allSettled([saveLinguistics(previous, 3), saveLinguistics(emptyLinguistics(), 3)]);
    assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].status, 'rejected'); assert.match(results[1].reason.message, /Another tab/);
    assert.equal((await loadLinguistics()).experiments[0].id, experiment.id);
  } finally { db.dispose(); }
});
test('corrupted translation exercise records are retained instead of being reset to an empty workspace', async () => {
  const previous = { ...emptyLinguistics(), schemaVersion: 99, experiments: [experiment] }, db = fixture(previous);
  try { await assert.rejects(loadLinguistics(), /invalid/); await assert.rejects(saveLinguistics(emptyLinguistics(), 0), /invalid/); assert.deepEqual(db.stored(), previous); }
  finally { db.dispose(); }
});
test('translation exercise storage can retry after an opening failure', async () => {
  const db = fixture();
  try { db.options.failOpen = true; await assert.rejects(loadLinguistics(), /Could not open/); db.options.failOpen = false; assert.deepEqual(await loadLinguistics(), emptyLinguistics()); }
  finally { db.dispose(); }
});

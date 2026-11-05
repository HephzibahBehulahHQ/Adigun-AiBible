import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as tick } from 'node:timers/promises';
import { emptyCorrections } from '../src/speakers/model.ts';
import { loadCorrections, saveCorrections } from '../src/speakers/storage.ts';
// Minimal transaction fixture: writes commit atomically; queued readwrite transactions see the prior commit.
function fixture(initial) {
  let stored = initial === undefined ? undefined : structuredClone(initial); const queue = []; let active; const options = { holdWrite: false, failWrite: false, failRead: false, failOpen: false };
  const openedNames = [];
  const db = {
    objectStoreNames: { contains: () => true }, close() {}, createObjectStore() {},
    transaction(_name, mode) {
      const tx = { mode, aborted: false, pending: undefined, request: undefined, objectStore: () => ({
        get() { const request = {}; tx.request = request; queue.push(tx); queueMicrotask(pump); return request; },
        put(value) { tx.pending = structuredClone(value); if (options.failWrite) queueMicrotask(() => { tx.onerror?.(); tx.abort(); }); }
      }), abort() { if (tx.aborted) return; tx.aborted = true; queueMicrotask(() => { tx.onabort?.(); if (active === tx) { active = undefined; pump(); } }); } };
      return tx;
    }
  };
  function finish() { const tx = active; if (!tx || tx.aborted) return; if (tx.pending !== undefined) stored = structuredClone(tx.pending); tx.oncomplete?.(); active = undefined; pump(); }
  function pump() { if (active || !queue.length) return; const tx = active = queue.shift(); queueMicrotask(() => { if (options.failRead) { tx.onerror?.(); tx.abort(); return; } tx.request.result = stored === undefined ? undefined : structuredClone(stored); tx.request.onsuccess?.(); if (!tx.aborted && !(options.holdWrite && tx.mode === 'readwrite')) queueMicrotask(finish); }); }
  const api = { open(name) { openedNames.push(name); const request = {}; queueMicrotask(() => { if (options.failOpen) request.onerror?.(); else { request.result = db; request.onsuccess?.(); } }); return request; } };
  Object.defineProperty(globalThis, 'indexedDB', { value: api, configurable: true, writable: true });
  return { options, finish, openedNames, stored: () => stored, dispose: () => { db.onversionchange?.(); delete globalThis.indexedDB; } };
}
const annotation = { schemaVersion: 1, id: 'test-only-correction', reference: { editionId: 'eng-bsb', bookId: 'JHN', chapter: 3, verse: 3 }, editionSha256: 'a'.repeat(64), sourceTextHash: 'b'.repeat(64), offsetUnit: 'unicode-codepoint', start: 15, end: 101, speakerId: 'Test-only attribution', audience: [], speechKind: 'direct', uncertainty: 'disputed', evidenceIds: ['eng-bsb:JHN:3:3'] };
const base = { id: annotation.id, annotation, createdAt: '2026-11-05T12:00:00.000Z', reason: 'A private synthetic storage fixture.', status: 'draft' };

test('corrections use a separate database and resolve only after the full write transaction', async () => {
  const db = fixture();
  try {
    assert.deepEqual(await loadCorrections(), emptyCorrections());
    assert.deepEqual(db.openedNames, ['adigun-aibible-speaker-corrections']);
    db.options.holdWrite = true; let resolved = false;
    const saving = saveCorrections({ ...emptyCorrections(), proposals: [base] }, 0).then(result => { resolved = true; return result; });
    await tick(); assert.equal(resolved, false); assert.equal(db.stored(), undefined);
    db.finish(); const saved = await saving; assert.equal(saved.revision, 1); assert.equal((await loadCorrections()).proposals[0].reason, base.reason);
  } finally { db.dispose(); }
});

test('failed correction writes preserve committed proposals and never report a save', async () => {
  const previous = { ...emptyCorrections(), revision: 2, proposals: [base] }, db = fixture(previous);
  try {
    db.options.failWrite = true; await assert.rejects(saveCorrections({ ...previous, proposals: [] }, 2), /not saved/); assert.deepEqual(db.stored(), previous);
    db.options.failWrite = false; assert.equal((await saveCorrections({ ...previous, proposals: [] }, 2)).revision, 3);
  } finally { db.dispose(); }
});

test('simultaneous correction tabs cannot overwrite newer committed proposals', async () => {
  const db = fixture();
  try {
    const results = await Promise.allSettled([saveCorrections({ ...emptyCorrections(), proposals: [base] }, 0), saveCorrections(emptyCorrections(), 0)]);
    assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].status, 'rejected'); assert.match(results[1].reason.message, /Another tab/);
    assert.equal((await loadCorrections()).proposals[0].id, base.id);
    await assert.rejects(saveCorrections(emptyCorrections(), 0), /Another tab/);
  } finally { db.dispose(); }
});

test('malformed or unavailable corrections remain intact instead of being replaced by empty data', async () => {
  const corrupt = { ...emptyCorrections(), schemaVersion: 99, proposals: [base] }, db = fixture(corrupt);
  try {
    await assert.rejects(loadCorrections(), /Unsupported/); await assert.rejects(saveCorrections(emptyCorrections(), 0), /Unsupported/); assert.deepEqual(db.stored(), corrupt);
    db.options.failRead = true; await assert.rejects(loadCorrections(), /could not be read/); assert.deepEqual(db.stored(), corrupt);
  } finally { db.dispose(); }
});

test('an unavailable correction database can be retried after permission recovery', async () => {
  const db = fixture();
  try { db.options.failOpen = true; await assert.rejects(loadCorrections(), /Could not open/); db.options.failOpen = false; assert.deepEqual(await loadCorrections(), emptyCorrections()); }
  finally { db.dispose(); }
});

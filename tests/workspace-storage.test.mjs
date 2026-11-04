import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as tick } from 'node:timers/promises';
import { emptyWorkspace } from '../src/workspace/model.ts';
import { loadWorkspace, saveWorkspace, WorkspaceConflictError } from '../src/workspace/storage.ts';
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
const base = { id: 'fixture-prayer', createdAt: '2026-11-04T10:00:00.000Z', updatedAt: '2026-11-04T10:00:00.000Z', title: 'Private fixture', text: 'Retain this entry.', category: '', tags: [], refs: [], reflection: '', outcome: '', followUp: '', history: [] };

test('workspace uses its own database and resolves saves only after the complete transaction', async () => {
  const db = fixture();
  try { assert.deepEqual(await loadWorkspace(), emptyWorkspace()); assert.deepEqual(db.openedNames, ['adigun-aibible-workspace']); db.options.holdWrite = true; let resolved = false;
    const saving = saveWorkspace({ ...emptyWorkspace(), prayers: [base] }, 0).then(result => { resolved = true; return result; }); await tick(); assert.equal(resolved, false); assert.equal(db.stored(), undefined);
    db.finish(); const saved = await saving; assert.equal(saved.revision, 1); assert.equal((await loadWorkspace()).prayers[0].text, base.text);
  } finally { db.dispose(); }
});

test('failed transactions leave prior writing intact and never resolve as successful saves', async () => {
  const previous = { ...emptyWorkspace(), revision: 2, prayers: [base] }; const db = fixture(previous);
  try { db.options.failWrite = true; await assert.rejects(saveWorkspace({ ...previous, prayers: [] }, 2), /not saved/); assert.deepEqual(db.stored(), previous);
    db.options.failWrite = false; const saved = await saveWorkspace({ ...previous, prayers: [] }, 2); assert.equal(saved.revision, 3);
  } finally { db.dispose(); }
});

test('stale and simultaneous tab revisions cannot silently overwrite committed records', async () => {
  const db = fixture();
  try { const results = await Promise.allSettled([saveWorkspace({ ...emptyWorkspace(), prayers: [base] }, 0), saveWorkspace(emptyWorkspace(), 0)]);
    assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].status, 'rejected'); assert.ok(results[1].reason instanceof WorkspaceConflictError);
    assert.equal((await loadWorkspace()).prayers[0].id, base.id); await assert.rejects(saveWorkspace(emptyWorkspace(), 0), /Another tab/);
  } finally { db.dispose(); }
});

test('corrupt or unsupported stored data is not converted to an empty workspace on read or write', async () => {
  const corrupt = { ...emptyWorkspace(), schemaVersion: 99, prayers: [base] }; const db = fixture(corrupt);
  try { await assert.rejects(loadWorkspace(), /Unsupported/); await assert.rejects(saveWorkspace(emptyWorkspace(), 0), /Unsupported/); assert.deepEqual(db.stored(), corrupt); }
  finally { db.dispose(); }
});

test('an opening failure is retryable instead of permanently caching a rejected promise', async () => {
  const db = fixture();
  try { db.options.failOpen = true; await assert.rejects(loadWorkspace(), /Could not open/); db.options.failOpen = false; assert.deepEqual(await loadWorkspace(), emptyWorkspace()); }
  finally { db.dispose(); }
});

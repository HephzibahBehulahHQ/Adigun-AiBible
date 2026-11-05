import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as tick } from 'node:timers/promises';
import { emptyMinistry, newMinistryOutline } from '../src/ministry/model.ts';
import { loadMinistry, saveMinistry } from '../src/ministry/storage.ts';

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
const outline = { ...newMinistryOutline(), title: 'Keep this private outline', facilitatorNotes: 'Private preparation' };

test('ministry saves only resolve after their scoped transaction commits', async () => {
  const db = fixture();
  try {
    assert.deepEqual(await loadMinistry(), emptyMinistry()); assert.deepEqual(db.openedNames, ['adigun-aibible-ministry']);
    db.options.holdWrite = true; let resolved = false;
    const saving = saveMinistry({ ...emptyMinistry(), outlines: [outline] }, 0).then(value => { resolved = true; return value; });
    await tick(); assert.equal(resolved, false); assert.equal(db.stored(), undefined);
    db.finish(); assert.equal((await saving).revision, 1); assert.equal((await loadMinistry()).outlines[0].facilitatorNotes, 'Private preparation');
  } finally { db.dispose(); }
});
test('failed writes and stale concurrent tabs cannot erase saved ministry drafts', async () => {
  const previous = { ...emptyMinistry(), revision: 3, outlines: [outline] }, db = fixture(previous);
  try {
    db.options.failWrite = true; await assert.rejects(saveMinistry(emptyMinistry(), 3), /not saved/); assert.deepEqual(db.stored(), previous);
    db.options.failWrite = false;
    const results = await Promise.allSettled([saveMinistry(previous, 3), saveMinistry(emptyMinistry(), 3)]);
    assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].status, 'rejected'); assert.match(results[1].reason.message, /Another tab/);
    assert.equal((await loadMinistry()).outlines[0].id, outline.id);
  } finally { db.dispose(); }
});
test('corrupted stored records are preserved rather than silently replaced with an empty workspace', async () => {
  const previous = { ...emptyMinistry(), schemaVersion: 99, outlines: [outline] }, db = fixture(previous);
  try { await assert.rejects(loadMinistry(), /Unsupported/); await assert.rejects(saveMinistry(emptyMinistry(), 0), /Unsupported/); assert.deepEqual(db.stored(), previous); }
  finally { db.dispose(); }
});
test('opening failure is retryable', async () => {
  const db = fixture();
  try { db.options.failOpen = true; await assert.rejects(loadMinistry(), /Could not open/); db.options.failOpen = false; assert.deepEqual(await loadMinistry(), emptyMinistry()); }
  finally { db.dispose(); }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as tick } from 'node:timers/promises';
import { addLayout, emptyLayouts } from '../src/layouts/model.ts';
import { DamagedLayoutsError, LayoutCancelledError, LayoutConflictError, loadLayouts, resetDamagedLayouts, saveLayouts } from '../src/layouts/storage.ts';

// A small transaction fixture serializes read/write operations and exposes committed data only.
function fixture(initial) {
  let stored = initial === undefined ? undefined : structuredClone(initial), active;
  const queue = [], openedNames = [], options = { holdWrite: false, failWrite: false, failRead: false, failOpen: false };
  const db = {
    objectStoreNames: { contains: () => true }, close() {}, createObjectStore() {},
    transaction(_name, mode) {
      const tx = {
        mode, aborted: false, pending: undefined, request: undefined,
        objectStore: () => ({
          get() { const request = {}; tx.request = request; queue.push(tx); queueMicrotask(pump); return request; },
          put(value) { tx.pending = structuredClone(value); if (options.failWrite) queueMicrotask(() => { tx.onerror?.(); tx.abort(); }); },
        }),
        abort() { if (tx.aborted) return; tx.aborted = true; queueMicrotask(() => { tx.onabort?.(); if (active === tx) { active = undefined; pump(); } }); },
      };
      return tx;
    },
  };
  function finish() {
    const tx = active; if (!tx || tx.aborted) return;
    if (tx.pending !== undefined) stored = structuredClone(tx.pending);
    tx.oncomplete?.(); active = undefined; pump();
  }
  function pump() {
    if (active || !queue.length) return;
    const tx = active = queue.shift();
    queueMicrotask(() => {
      if (tx.aborted) return;
      if (options.failRead) { tx.onerror?.(); tx.abort(); return; }
      tx.request.result = stored === undefined ? undefined : structuredClone(stored); tx.request.onsuccess?.();
      if (!tx.aborted && !(options.holdWrite && tx.mode === 'readwrite')) queueMicrotask(finish);
    });
  }
  const api = {
    open(name) {
      openedNames.push(name); const request = {};
      queueMicrotask(() => { if (options.failOpen) request.onerror?.(); else { request.result = db; request.onsuccess?.(); } });
      return request;
    },
  };
  Object.defineProperty(globalThis, 'indexedDB', { value: api, configurable: true, writable: true });
  return { options, finish, openedNames, stored: () => structuredClone(stored), replace: value => { stored = structuredClone(value); }, dispose: () => { db.onversionchange?.(); delete globalThis.indexedDB; } };
}
const layoutState = name => addLayout(emptyLayouts(), name, { theme: 'night', fontSize: 21, lineHeight: 1.8, focus: true, inspector: 'context', inspectorVisible: false }, name, '2026-11-04T14:00:00.000Z');

test('layout saves use their own database and do not report success before transaction commit', async () => {
  const db = fixture();
  try {
    assert.deepEqual(await loadLayouts(), emptyLayouts());
    assert.deepEqual(db.openedNames, ['adigun-aibible-layouts']);
    db.options.holdWrite = true; let resolved = false;
    const promise = saveLayouts(layoutState('Morning'), 0).then(value => { resolved = true; return value; });
    await tick(); assert.equal(resolved, false); assert.equal(db.stored(), undefined);
    db.finish(); const result = await promise;
    assert.equal(result.revision, 1); assert.equal((await loadLayouts()).layouts[0].name, 'Morning');
  } finally { db.dispose(); }
});

test('failed layout writes preserve the old record and stay retryable', async () => {
  const previous = { ...layoutState('Morning'), revision: 4 }, db = fixture(previous);
  try {
    db.options.failWrite = true;
    await assert.rejects(saveLayouts({ ...previous, layouts: [] }, 4), /not saved/);
    assert.deepEqual(db.stored(), previous);
    db.options.failWrite = false;
    assert.equal((await saveLayouts({ ...previous, layouts: [] }, 4)).revision, 5);
  } finally { db.dispose(); }
});

test('simultaneous and stale windows cannot overwrite a newer saved layout', async () => {
  const db = fixture();
  try {
    const results = await Promise.allSettled([saveLayouts(layoutState('Morning'), 0), saveLayouts(layoutState('Evening'), 0)]);
    assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].status, 'rejected');
    assert.ok(results[1].reason instanceof LayoutConflictError);
    assert.equal((await loadLayouts()).layouts[0].name, 'Morning');
    await assert.rejects(saveLayouts(emptyLayouts(), 0), LayoutConflictError);
    assert.equal(db.stored().layouts[0].name, 'Morning');
  } finally { db.dispose(); }
});

test('damaged records stay untouched on read and save and can be downloaded without data loss', async () => {
  const broken = { ...layoutState('Morning'), schemaVersion: 99 }, db = fixture(broken);
  try {
    const error = await loadLayouts().catch(value => value);
    assert.ok(error instanceof DamagedLayoutsError);
    assert.deepEqual(JSON.parse(error.backup).raw, broken);
    await assert.rejects(saveLayouts(emptyLayouts(), 0), DamagedLayoutsError);
    assert.deepEqual(db.stored(), broken);
  } finally { db.dispose(); }
});

test('explicit damaged-layout reset requires the same damaged record and preserves a concurrent repair', async () => {
  const broken = { schemaVersion: 99, data: 'retain exactly' }, db = fixture(broken);
  try {
    const error = await loadLayouts().catch(value => value);
    db.replace({ ...broken, data: 'changed elsewhere' });
    await assert.rejects(resetDamagedLayouts(error.backup), /changed in another window/);
    assert.equal(db.stored().data, 'changed elsewhere');
    const repaired = { ...layoutState('Repaired'), revision: 7 }; db.replace(repaired);
    await assert.rejects(resetDamagedLayouts(error.backup), /repaired/);
    assert.deepEqual(db.stored(), repaired);
    db.replace(broken);
    const result = await resetDamagedLayouts(error.backup);
    assert.equal(result.layouts.length, 0); assert.ok(result.revision > 7);
    assert.deepEqual(await loadLayouts(), result);
  } finally { db.dispose(); }
});

test('cancelled or abandoned layout actions cannot commit a delayed write', async () => {
  const previous = { ...layoutState('Morning'), revision: 1 }, db = fixture(previous);
  try {
    const controller = new AbortController(); db.options.holdWrite = true;
    const promise = saveLayouts({ ...previous, layouts: [] }, 1, { signal: controller.signal });
    await tick(); controller.abort();
    await assert.rejects(promise, LayoutCancelledError); assert.deepEqual(db.stored(), previous);
    await assert.rejects(saveLayouts(emptyLayouts(), 1, { isCurrent: () => false }), LayoutCancelledError);
    assert.deepEqual(db.stored(), previous);
  } finally { db.dispose(); }
});

test('storage opening and reading failures surface errors without empty successful reads', async () => {
  const db = fixture(layoutState('Morning'));
  try {
    db.options.failOpen = true; await assert.rejects(loadLayouts(), /could not be opened/);
    db.options.failOpen = false; assert.equal((await loadLayouts()).layouts[0].name, 'Morning');
    db.options.failRead = true; await assert.rejects(loadLayouts(), /could not be read/);
    db.options.failRead = false; assert.equal((await loadLayouts()).layouts[0].name, 'Morning');
  } finally { db.dispose(); }
});

test('unsupported layout data and invalid revisions are refused before writing', async () => {
  const previous = layoutState('Morning'), db = fixture(previous);
  try {
    await assert.rejects(saveLayouts({ ...previous, layouts: [{ ...previous.layouts[0], snapshot: { ...previous.layouts[0].snapshot, locale: 'en' } }] }, 0), /unsupported fields/);
    for (const revision of [-1, 1.5, Number.MAX_SAFE_INTEGER]) await assert.rejects(saveLayouts(previous, revision), /revision/);
    await assert.rejects(resetDamagedLayouts(null), /compared safely/);
    assert.deepEqual(db.stored(), previous);
  } finally { db.dispose(); }
});

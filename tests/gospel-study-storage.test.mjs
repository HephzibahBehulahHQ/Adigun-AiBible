import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as tick } from 'node:timers/promises';
import { defaultGospelSelection, resolvePaneReference } from '../src/gospels/model.ts';
import { emptyGospelStudy } from '../src/gospels/study-model.ts';
import { loadGospelStudy, saveGospelStudy } from '../src/gospels/study-storage.ts';

// Transaction fixture only: serial reads/writes observe committed records, never pending puts.
function fixture(initial) {
  let stored = initial === undefined ? undefined : structuredClone(initial), active;
  const queue = [], opened = [], options = { holdRead: false, holdWrite: false, failWrite: false, failRead: false, failOpen: false, throwOpen: false, throwTransaction: false, throwPut: false };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  const db = {
    objectStoreNames: { contains: name => name === 'workspace' }, close() {}, createObjectStore() {},
    transaction(name, mode) {
      assert.equal(name, 'workspace');
      if (options.throwTransaction) throw new DOMException('Fixture denied transaction', 'SecurityError');
      const tx = { mode, aborted: false, pending: undefined, request: undefined,
        objectStore(name) {
          assert.equal(name, 'workspace');
          return {
            get(key) { assert.equal(key, 'private'); const request = {}; tx.request = request; queue.push(tx); queueMicrotask(pump); return request; },
            put(value, key) {
              assert.equal(key, 'private');
              if (options.throwPut) throw new DOMException('Fixture quota exhausted', 'QuotaExceededError');
              tx.pending = structuredClone(value);
              if (options.failWrite) queueMicrotask(() => { tx.onerror?.(); tx.abort(); });
            },
          };
        },
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
      if (options.failRead) { tx.onerror?.(); tx.abort(); return; }
      tx.request.result = stored === undefined ? undefined : structuredClone(stored); tx.request.onsuccess?.();
      if (!tx.aborted && !(tx.mode === 'readwrite' ? options.holdWrite : options.holdRead)) queueMicrotask(finish);
    });
  }
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, writable: true, value: {
    open(name, version) {
      opened.push({ name, version });
      if (options.throwOpen) throw new DOMException('Fixture denied database', 'SecurityError');
      const request = {};
      queueMicrotask(() => { if (options.failOpen) request.onerror?.(); else { request.result = db; request.onsuccess?.(); } });
      return request;
    },
  } });
  return {
    options, opened, finish, stored: () => structuredClone(stored), abort: () => active?.abort(),
    dispose: () => { db.onversionchange?.(); if (previous) Object.defineProperty(globalThis, 'indexedDB', previous); else delete globalThis.indexedDB; },
  };
}
function state(note = 'Private notebook fixture') {
  const selection = defaultGospelSelection('eng-web');
  return { ...emptyGospelStudy(), rows: [{
    id: 'test-only-study', title: 'Private test study', note, selection,
    passages: selection.panes.map(pane => ({ reference: resolvePaneReference(selection, pane), sourceSha256: 'a'.repeat(64), editionName: 'Test source', bookName: pane.bookId })),
    createdAt: '2026-11-05T16:00:00.000Z', updatedAt: '2026-11-05T16:00:00.000Z',
  }] };
}

test('Gospel notebook reads and writes resolve only at transaction completion in their own database', async () => {
  const db = fixture();
  try {
    db.options.holdRead = true; let read = false;
    const loading = loadGospelStudy().then(value => { read = true; return value; });
    await tick(); assert.equal(read, false); db.finish(); assert.deepEqual(await loading, emptyGospelStudy());
    db.options.holdRead = false;
    assert.deepEqual(db.opened, [{ name: 'adigun-aibible-gospel-notebook', version: 1 }]);
    db.options.holdWrite = true; let written = false;
    const source = state(), before = structuredClone(source), saving = saveGospelStudy(source, 0).then(value => { written = true; return value; });
    await tick(); assert.equal(written, false); assert.equal(db.stored(), undefined);
    source.rows[0].note = 'Mutation after saving began';
    db.finish(); const saved = await saving;
    assert.equal(saved.revision, 1); assert.equal(saved.rows[0].note, before.rows[0].note);
    assert.deepEqual(await loadGospelStudy(), { ...before, revision: 1 });
  } finally { db.dispose(); }
});

test('transaction aborts and asynchronous quota failures preserve previous committed studies', async () => {
  const previous = { ...state(), revision: 3 }, db = fixture(previous);
  try {
    db.options.holdWrite = true;
    const aborted = assert.rejects(saveGospelStudy(emptyGospelStudy(), 3), /not saved/);
    await tick(); db.abort(); await aborted; assert.deepEqual(db.stored(), previous);
    db.options.holdWrite = false; db.options.failWrite = true;
    await assert.rejects(saveGospelStudy(emptyGospelStudy(), 3), /not saved/);
    assert.deepEqual(db.stored(), previous);
    db.options.failWrite = false; db.options.throwPut = true;
    await assert.rejects(saveGospelStudy(emptyGospelStudy(), 3), /not saved/);
    assert.deepEqual(db.stored(), previous);
  } finally { db.dispose(); }
});

test('simultaneous tabs cannot overwrite a newer Gospel notebook revision', async () => {
  const db = fixture({ ...state('Original'), revision: 4 });
  try {
    const results = await Promise.allSettled([saveGospelStudy(state('First tab'), 4), saveGospelStudy(state('Second tab'), 4)]);
    assert.equal(results[0].status, 'fulfilled'); assert.equal(results[0].value.revision, 5);
    assert.equal(results[1].status, 'rejected'); assert.match(results[1].reason.message, /Another tab/);
    assert.equal((await loadGospelStudy()).rows[0].note, 'First tab');
    assert.equal((await saveGospelStudy(state('Recovered after reload'), 5)).revision, 6);
    assert.equal((await loadGospelStudy()).rows[0].note, 'Recovered after reload');
  } finally { db.dispose(); }
});

test('corrupted saved state and read failures never become an empty successful notebook', async () => {
  const corrupted = { ...state(), schemaVersion: 99 }, db = fixture(corrupted);
  try {
    await assert.rejects(loadGospelStudy(), /Unsupported/);
    await assert.rejects(saveGospelStudy(emptyGospelStudy(), 0), /Unsupported/);
    assert.deepEqual(db.stored(), corrupted);
    db.options.failRead = true;
    await assert.rejects(loadGospelStudy(), /Could not read/);
    await assert.rejects(saveGospelStudy(state(), 0), /not saved/);
    assert.deepEqual(db.stored(), corrupted);
  } finally { db.dispose(); }
});

test('denied opening and transaction creation are retryable without destroying saved data', async () => {
  const previous = { ...state(), revision: 1 }, db = fixture(previous);
  try {
    db.options.throwOpen = true; await assert.rejects(loadGospelStudy(), /Could not open/);
    db.options.throwOpen = false; db.options.failOpen = true; await assert.rejects(loadGospelStudy(), /Could not open/);
    db.options.failOpen = false; assert.deepEqual(await loadGospelStudy(), previous);
    db.options.throwTransaction = true;
    await assert.rejects(loadGospelStudy(), /Could not read/);
    await assert.rejects(saveGospelStudy(emptyGospelStudy(), 1), /not saved/);
    assert.deepEqual(db.stored(), previous);
    db.options.throwTransaction = false; assert.deepEqual(await loadGospelStudy(), previous);
  } finally { db.dispose(); }
});

test('invalid revisions and invalid proposed data fail before a storage request', async () => {
  const db = fixture();
  try {
    for (const revision of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER - 1]) await assert.rejects(saveGospelStudy(state(), revision), /revision/);
    await assert.rejects(saveGospelStudy({ ...state(), revision: NaN }, 0), /revision/);
    const invalid = state(); invalid.rows[0].passages[0].reference.endVerse--;
    await assert.rejects(saveGospelStudy(invalid, 0), /match their selected panes/);
    assert.deepEqual(db.opened, []); assert.equal(db.stored(), undefined);
  } finally { db.dispose(); }
});

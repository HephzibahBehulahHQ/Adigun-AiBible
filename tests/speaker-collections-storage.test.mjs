import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as tick } from 'node:timers/promises';
import { emptySpeechCollections } from '../src/speakers/collection-model.ts';
import { loadSpeechCollections, saveSpeechCollections } from '../src/speakers/collection-storage.ts';

// Transaction fixture only: queued transactions see committed data, not pending puts.
function fixture(initial) {
  let stored = initial === undefined ? undefined : structuredClone(initial), active, closes = 0;
  const queue = [], opened = [], options = { holdRead: false, holdWrite: false, failWrite: false, failRead: false, failOpen: false, blockOpen: false, throwOpen: false, throwTransaction: false, throwPut: false };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  const db = {
    objectStoreNames: { contains: name => name === 'workspace' }, close() { closes++; }, createObjectStore() {},
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
      queueMicrotask(() => {
        if (options.failOpen) request.onerror?.();
        else { if (options.blockOpen) request.onblocked?.(); request.result = db; request.onsuccess?.(); }
      });
      return request;
    },
  } });
  return {
    options, opened, finish, stored: () => structuredClone(stored), abort: () => active?.abort(), closes: () => closes,
    dispose: () => { db.onversionchange?.(); if (previous) Object.defineProperty(globalThis, 'indexedDB', previous); else delete globalThis.indexedDB; },
  };
}

function state(title = 'Private collection fixture') {
  return { ...emptySpeechCollections(), collections: [{
    id: 'test-only-collection', title, createdAt: '2026-11-05T18:30:00.000Z', updatedAt: '2026-11-05T18:30:00.000Z',
    entries: [{
      id: 'eng-bsb:JHN:3:3:1-12', reference: { bookId: 'JHN', chapter: 3, verse: 3, editionId: 'eng-bsb' },
      editionSha256: 'a'.repeat(64), sourceTextHash: 'b'.repeat(64), editionName: 'Isolated source fixture', bookName: 'John', language: 'en', sourceUrl: 'https://example.test/fixture', marker: 'wj', offsetUnit: 'unicode-codepoint', start: 1, end: 12,
    }],
  }] };
}

test('speech collection reads and saves resolve only when their isolated database transaction completes', async () => {
  const db = fixture();
  try {
    db.options.holdRead = true; let read = false;
    const loading = loadSpeechCollections().then(value => { read = true; return value; });
    await tick(); assert.equal(read, false); db.finish(); assert.deepEqual(await loading, emptySpeechCollections());
    db.options.holdRead = false;
    assert.deepEqual(db.opened, [{ name: 'adigun-aibible-speech-collections', version: 1 }]);
    db.options.holdWrite = true; let written = false;
    const source = state(), before = structuredClone(source), saving = saveSpeechCollections(source, 0).then(value => { written = true; return value; });
    await tick(); assert.equal(written, false); assert.equal(db.stored(), undefined);
    source.collections[0].title = 'Later mutation'; source.collections[0].entries[0].bookName = 'Later mutation';
    db.finish(); const saved = await saving;
    assert.deepEqual(saved, { ...before, revision: 1 });
    assert.deepEqual(await loadSpeechCollections(), saved);
  } finally { db.dispose(); }
});

test('aborted and quota-failed speech collection transactions retain the previous committed state', async () => {
  const previous = { ...state(), revision: 3 }, db = fixture(previous);
  try {
    db.options.holdWrite = true;
    const aborted = assert.rejects(saveSpeechCollections(emptySpeechCollections(), 3), /not saved/);
    await tick(); db.abort(); await aborted; assert.deepEqual(db.stored(), previous);
    db.options.holdWrite = false; db.options.failWrite = true;
    await assert.rejects(saveSpeechCollections(emptySpeechCollections(), 3), /not saved/);
    assert.deepEqual(db.stored(), previous);
    db.options.failWrite = false; db.options.throwPut = true;
    await assert.rejects(saveSpeechCollections(emptySpeechCollections(), 3), /not saved/);
    assert.deepEqual(db.stored(), previous);
  } finally { db.dispose(); }
});

test('concurrent speech collection writers cannot silently overwrite a newer revision', async () => {
  const db = fixture({ ...state('Original'), revision: 4 });
  try {
    const results = await Promise.allSettled([saveSpeechCollections(state('First tab'), 4), saveSpeechCollections(state('Second tab'), 4)]);
    assert.equal(results[0].status, 'fulfilled'); assert.equal(results[0].value.revision, 5);
    assert.equal(results[1].status, 'rejected'); assert.match(results[1].reason.message, /Another tab/);
    assert.equal((await loadSpeechCollections()).collections[0].title, 'First tab');
    assert.equal((await saveSpeechCollections(state('Recovered after reload'), 5)).revision, 6);
    assert.equal((await loadSpeechCollections()).collections[0].title, 'Recovered after reload');
  } finally { db.dispose(); }
});

test('invalid stored collections and failed reads are never treated as a successful empty workspace', async () => {
  const corrupted = { ...state(), schemaVersion: 99 }, db = fixture(corrupted);
  try {
    await assert.rejects(loadSpeechCollections(), /Unsupported/);
    await assert.rejects(saveSpeechCollections(emptySpeechCollections(), 0), /Unsupported/);
    assert.deepEqual(db.stored(), corrupted);
    db.options.failRead = true;
    await assert.rejects(loadSpeechCollections(), /Could not read/);
    await assert.rejects(saveSpeechCollections(state(), 0), /not saved/);
    assert.deepEqual(db.stored(), corrupted);
  } finally { db.dispose(); }
});

test('speech storage denial and blocked opening remain retryable and late blocked success closes its connection', async () => {
  const previous = { ...state(), revision: 1 }, db = fixture(previous);
  try {
    db.options.throwOpen = true; await assert.rejects(loadSpeechCollections(), /Could not open/);
    db.options.throwOpen = false; db.options.failOpen = true; await assert.rejects(loadSpeechCollections(), /Could not open/);
    db.options.failOpen = false; db.options.blockOpen = true; await assert.rejects(loadSpeechCollections(), /Close another/);
    assert.equal(db.closes(), 1);
    db.options.blockOpen = false; assert.deepEqual(await loadSpeechCollections(), previous);
    db.options.throwTransaction = true;
    await assert.rejects(loadSpeechCollections(), /Could not read/);
    await assert.rejects(saveSpeechCollections(emptySpeechCollections(), 1), /not saved/);
    assert.deepEqual(db.stored(), previous);
    db.options.throwTransaction = false; assert.deepEqual(await loadSpeechCollections(), previous);
  } finally { db.dispose(); }
});

test('invalid proposed collections and revisions are rejected before requesting any database', async () => {
  const db = fixture();
  try {
    for (const revision of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER - 1]) await assert.rejects(saveSpeechCollections(state(), revision), /revision/);
    await assert.rejects(saveSpeechCollections({ ...state(), revision: NaN }, 0), /revision/);
    const invalid = state(); invalid.collections[0].entries[0].reference.endVerse = 4;
    await assert.rejects(saveSpeechCollections(invalid, 0), /unknown/);
    assert.deepEqual(db.opened, []); assert.equal(db.stored(), undefined);
  } finally { db.dispose(); }
});

test('missing private database capability reports unavailable storage', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  try {
    delete globalThis.indexedDB;
    await assert.rejects(loadSpeechCollections(), /unavailable/);
    await assert.rejects(saveSpeechCollections(state(), 0), /unavailable/);
  } finally { if (previous) Object.defineProperty(globalThis, 'indexedDB', previous); }
});

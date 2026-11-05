import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as tick } from 'node:timers/promises';
import { readFile } from 'node:fs/promises';
import { blindChallenge } from '../src/interpretation/challenges.ts';
import { emptyInterpretationNotebook, newBlindReflection, revealReflection, reviseReflection } from '../src/interpretation/model.ts';
import { loadInterpretationNotebook, saveInterpretationNotebook } from '../src/interpretation/storage.ts';

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
const created = newBlindReflection(blindChallenge, manifest.edition, blindChallenge.sources.map(source => source.id), '2026-11-05T10:00:00.000Z');
const saved = reviseReflection(undefined, { ...created, before: 'Private reasoning before knowing who wrote it.' }, '2026-11-05T10:01:00.000Z');
const notebook = (reflection = saved) => ({ ...emptyInterpretationNotebook(), reflections: [reflection] });

test('private interpretation saves resolve only after an IndexedDB transaction commits', async () => {
  const db = fixture();
  try {
    assert.deepEqual(await loadInterpretationNotebook(), emptyInterpretationNotebook());
    assert.deepEqual(db.openedNames, ['adigun-aibible-blind-interpretation']);
    db.options.holdWrite = true; let resolved = false;
    const saving = saveInterpretationNotebook(notebook(), 0).then(value => { resolved = true; return value; });
    await tick(); assert.equal(resolved, false); assert.equal(db.stored(), undefined);
    db.finish(); assert.equal((await saving).revision, 1); assert.equal((await loadInterpretationNotebook()).reflections[0].before, saved.before);
  } finally { db.dispose(); }
});
test('failed writes and concurrent stale saves preserve the winning notebook', async () => {
  const previous = { ...notebook(), revision: 3 }, db = fixture(previous);
  try {
    db.options.failWrite = true; await assert.rejects(saveInterpretationNotebook(emptyInterpretationNotebook(), 3), /not saved/); assert.deepEqual(db.stored(), previous);
    db.options.failWrite = false;
    const results = await Promise.allSettled([saveInterpretationNotebook(previous, 3), saveInterpretationNotebook(emptyInterpretationNotebook(), 3)]);
    assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].status, 'rejected'); assert.match(results[1].reason.message, /Another tab/);
    assert.equal((await loadInterpretationNotebook()).reflections[0].before, saved.before);
  } finally { db.dispose(); }
});
test('storage itself prevents rewriting before-reveal notes or restoring a record to an earlier blind state', async () => {
  const revealed = reviseReflection(saved, revealReflection(saved, '2026-11-05T10:02:00.000Z'), '2026-11-05T10:02:00.000Z');
  const previous = { ...notebook(revealed), revision: 2 }, db = fixture(previous);
  try {
    await assert.rejects(saveInterpretationNotebook(notebook(saved), 2), /cannot rewind/);
    await assert.rejects(saveInterpretationNotebook(notebook({ ...revealed, before: 'Retrospectively rewritten' }), 2), /preserved/);
    assert.deepEqual(db.stored(), previous);
    const updated = reviseReflection(revealed, { ...revealed, after: 'A later private thought.' }, '2026-11-05T10:03:00.000Z');
    await saveInterpretationNotebook(notebook(updated), 2);
    assert.equal((await loadInterpretationNotebook()).reflections[0].before, saved.before);
  } finally { db.dispose(); }
});
test('corrupt records, malformed imports and invalid revisions do not overwrite saved data', async () => {
  const previous = { ...notebook(), schemaVersion: 8 }, db = fixture(previous);
  try { await assert.rejects(loadInterpretationNotebook(), /invalid/); await assert.rejects(saveInterpretationNotebook(emptyInterpretationNotebook(), 0), /invalid/); await assert.rejects(saveInterpretationNotebook(notebook(), -1), /revision is invalid/); assert.deepEqual(db.stored(), previous); }
  finally { db.dispose(); }
});
test('denied opening can be retried, and explicit notebook deletion removes only this stored notebook', async () => {
  const db = fixture(notebook());
  try {
    db.options.failOpen = true; await assert.rejects(loadInterpretationNotebook(), /could not be opened/);
    db.options.failOpen = false; assert.equal((await loadInterpretationNotebook()).reflections.length, 1);
    await saveInterpretationNotebook(emptyInterpretationNotebook(), 0);
    assert.equal((await loadInterpretationNotebook()).reflections.length, 0);
    assert.ok(db.openedNames.every(name => name === 'adigun-aibible-blind-interpretation'));
  } finally { db.dispose(); }
});

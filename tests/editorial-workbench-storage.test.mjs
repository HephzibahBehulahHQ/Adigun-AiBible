import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as tick } from 'node:timers/promises';
import { readFile } from 'node:fs/promises';
import { hashSourceText } from '../src/editorial.ts';
import { emptyWorkbench, newEditorialDraft } from '../src/editorial-workbench/model.ts';
import { loadWorkbench, saveWorkbench } from '../src/editorial-workbench/storage.ts';

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
const book = JSON.parse(await readFile(new URL('../data/books/GEN.json', import.meta.url), 'utf8'));
const text = book.chapters[0].verses[0].text;
const snapshot = { corpus: 'bible', editionId: 'eng-web', editionSha256: manifest.edition.sha256, referenceSystemId: 'eng-web:publisher-numbering', workId: 'GEN', workName: 'Genesis', chapter: 1, start: 1, end: 1, editionName: manifest.edition.name, sourceUrl: manifest.edition.sourceUrl, licenseUrl: manifest.edition.licenseUrl, attribution: manifest.edition.name, conditions: [], notice: '', units: [{ number: 1, text, sha256: await hashSourceText(text) }] };
const draft = { ...newEditorialDraft('paraphrase', [snapshot]), privateNotes: 'Keep my private author notes' };

test('editorial persistence resolves only after the transaction commits', async () => {
  const db = fixture();
  try {
    assert.deepEqual(await loadWorkbench(), emptyWorkbench()); assert.deepEqual(db.openedNames, ['adigun-aibible-editorial-workbench']);
    db.options.holdWrite = true; let resolved = false;
    const saving = saveWorkbench({ ...emptyWorkbench(), drafts: [draft] }, 0).then(value => { resolved = true; return value; });
    await tick(); assert.equal(resolved, false); assert.equal(db.stored(), undefined);
    db.finish(); assert.equal((await saving).revision, 1); assert.equal((await loadWorkbench()).drafts[0].privateNotes, draft.privateNotes);
  } finally { db.dispose(); }
});
test('failed writes and stale concurrent drafts cannot erase persisted editorial work', async () => {
  const previous = { ...emptyWorkbench(), revision: 3, drafts: [draft] }, db = fixture(previous);
  try {
    db.options.failWrite = true; await assert.rejects(saveWorkbench(emptyWorkbench(), 3), /not saved/); assert.deepEqual(db.stored(), previous);
    db.options.failWrite = false;
    const results = await Promise.allSettled([saveWorkbench(previous, 3), saveWorkbench(emptyWorkbench(), 3)]);
    assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].status, 'rejected'); assert.match(results[1].reason.message, /Another tab/);
    assert.equal((await loadWorkbench()).drafts[0].id, draft.id);
  } finally { db.dispose(); }
});
test('corrupted editorial records are retained instead of being reset to an empty workspace', async () => {
  const previous = { ...emptyWorkbench(), schemaVersion: 99, drafts: [draft] }, db = fixture(previous);
  try { await assert.rejects(loadWorkbench(), /invalid/); await assert.rejects(saveWorkbench(emptyWorkbench(), 0), /invalid/); assert.deepEqual(db.stored(), previous); }
  finally { db.dispose(); }
});
test('editorial storage can retry after an opening failure', async () => {
  const db = fixture();
  try { db.options.failOpen = true; await assert.rejects(loadWorkbench(), /Could not open/); db.options.failOpen = false; assert.deepEqual(await loadWorkbench(), emptyWorkbench()); }
  finally { db.dispose(); }
});

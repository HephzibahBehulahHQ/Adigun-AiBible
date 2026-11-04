import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as tick } from 'node:timers/promises';
import {
  emptyFamilyArchive, familyBackupSize, familyFingerprint, filterFamilyItems, parseCaptions,
  prepareFamilyAttachment, validateFamilyItem, validateFamilyState, verifyFamilyState,
} from '../src/family/model.ts';
import { familyBackup, mergeFamilyArchive, previewFamilyBackup, summarizeFamilyImport } from '../src/family/backup.ts';
import { FamilyConflictError, loadFamilyArchive, saveFamilyArchive } from '../src/family/storage.ts';

// All memories, names, recordings and documents here are isolated synthetic fixtures.
const instant = '2026-11-04T10:00:00.000Z';
const item = (patch = {}) => ({
  schemaVersion: 1, id: 'fixture-memory', title: 'Synthetic family memory', person: 'Àyọ̀ fixture',
  occurredOn: '2024-02-29', category: 'memory', collection: 'Fixture collection', topics: ['gratitude'],
  body: 'Private fixture writing with Yorùbá diacritics.', transcript: '', captionsVtt: '',
  passages: [{ reference: { bookId: 'JHN', chapter: 3, verse: 16, editionId: 'eng-web' }, label: 'John 3:16 · World English Bible', sourceSha256: 'a'.repeat(64) }],
  consent: { basis: 'permission', grantedBy: 'Fixture owner', confirmedAt: instant, note: 'Synthetic test permission only.' },
  stewardNote: 'Synthetic recovery instructions.', visibility: 'private', createdAt: instant, updatedAt: instant,
  ...patch,
});
const archive = (...items) => ({ ...emptyFamilyArchive(), items });
const backupFile = raw => new Blob([JSON.stringify(raw)], { type: 'application/json' });

test('family backup restores original bytes, diacritics, named source links and consent without copying Scripture', async () => {
  const original = new Blob(['Original fixture bytes: Àyọ̀\n\u0001'], { type: 'application/octet-stream' });
  const attachment = await prepareFamilyAttachment(original, 'family-fixture.txt');
  const source = archive(item({ attachment }));
  const exported = await familyBackup(source, new Date(instant));
  assert.equal(exported.size, familyBackupSize(source.items));
  const raw = JSON.parse(await exported.text());
  assert.equal(raw.items[0].attachment.dataBase64, Buffer.from(await original.arrayBuffer()).toString('base64'));
  assert.equal(raw.items[0].passages[0].reference.editionId, 'eng-web');
  assert.equal('text' in raw.items[0].passages[0], false);
  const preview = await previewFamilyBackup(emptyFamilyArchive(), exported);
  assert.equal(preview.added, 1);
  assert.equal(preview.fileBytes, original.size);
  assert.equal(familyFingerprint(preview.items[0]), familyFingerprint(source.items[0]));
  assert.deepEqual(new Uint8Array(await preview.items[0].attachment.blob.arrayBuffer()), new Uint8Array(await original.arrayBuffer()));
  assert.equal(preview.items[0].attachment.blob.type, 'text/plain');
});

test('a multi-megabyte original survives the complete backup and restore path', async () => {
  const attachment = await prepareFamilyAttachment(new Blob(['x'.repeat(2 * 1024 * 1024)], { type: 'text/plain' }), 'large-fixture.txt');
  const restored = await previewFamilyBackup(emptyFamilyArchive(), await familyBackup(archive(item({ attachment }))));
  assert.equal(restored.items[0].attachment.sha256, attachment.sha256);
  assert.equal(restored.items[0].attachment.blob.size, attachment.size);
});

test('restoring conflicts is explicit, merging retains unrelated items, and previews do not mutate saved records', async () => {
  const current = archive(item(), item({ id: 'other', title: 'Keep another saved item' }));
  const before = structuredClone(current);
  const incoming = [item({ body: 'A changed imported memory' }), item({ id: 'new', title: 'New fixture' })];
  assert.deepEqual(summarizeFamilyImport(current, incoming), { items: incoming, added: 1, identical: 0, conflicts: 1, fileBytes: 0 });
  const keep = mergeFamilyArchive(current, incoming, 'keep-device');
  assert.equal(keep.items.length, 3);
  assert.equal(keep.items.find(value => value.id === 'fixture-memory').body, current.items[0].body);
  const useImport = mergeFamilyArchive(current, incoming, 'use-import');
  assert.equal(useImport.items.find(value => value.id === 'fixture-memory').body, incoming[0].body);
  assert.equal(useImport.items.find(value => value.id === 'other').title, 'Keep another saved item');
  assert.equal(summarizeFamilyImport(current, [item()]).identical, 1);
  assert.deepEqual(current, before);
});

test('malformed, unsupported and duplicate-ID imports leave the current archive untouched', async () => {
  const current = archive(item());
  const before = structuredClone(current);
  await assert.rejects(previewFamilyBackup(current, new Blob(['{'])), /not valid JSON/);
  await assert.rejects(previewFamilyBackup(current, backupFile({ format: 'other-app', schemaVersion: 1, items: [] })), /Other app backups/);
  const raw = JSON.parse(await (await familyBackup(current)).text());
  await assert.rejects(previewFamilyBackup(current, backupFile({ ...raw, schemaVersion: 99 })), /Adigun Family Legacy backup/);
  await assert.rejects(previewFamilyBackup(current, backupFile({ ...raw, items: [raw.items[0], raw.items[0]] })), /duplicate record IDs/);
  await assert.rejects(previewFamilyBackup(current, backupFile({ ...raw, items: [{ ...raw.items[0], visibility: 'public' }] })), /privacy/);
  assert.deepEqual(current, before);
});

test('tampered originals, false file types and corrupt base64 are rejected before restore or save', async () => {
  const attachment = await prepareFamilyAttachment(new Blob(['Original'], { type: 'text/plain' }), 'fixture.txt');
  const source = archive(item({ attachment }));
  const raw = JSON.parse(await (await familyBackup(source)).text());
  raw.items[0].attachment.dataBase64 = Buffer.from('Modified').toString('base64');
  await assert.rejects(previewFamilyBackup(emptyFamilyArchive(), backupFile(raw)), /integrity check/);
  raw.items[0].attachment.dataBase64 = '!'.repeat(raw.items[0].attachment.dataBase64.length);
  await assert.rejects(previewFamilyBackup(emptyFamilyArchive(), backupFile(raw)), /size or encoding/);
  await assert.rejects(verifyFamilyState(archive(item({ attachment: { ...attachment, sha256: '0'.repeat(64) } }))), /integrity check/);
  await assert.rejects(prepareFamilyAttachment(new Blob(['<script>fixture</script>']), 'fixture.png'), /does not match/);
  await assert.rejects(prepareFamilyAttachment(new Blob(['fixture']), '../fixture.txt'), /plain filename/);
  await assert.rejects(prepareFamilyAttachment(new Blob(['fixture']), 'fixture.html'), /Supported originals/);
});

test('records require genuine content, consent metadata and explicit valid source identity', () => {
  assert.throws(() => validateFamilyItem(item({ body: '', transcript: '' })), /Add writing/);
  assert.throws(() => validateFamilyItem(item({ consent: { ...item().consent, grantedBy: '' } })), /authorized/);
  assert.throws(() => validateFamilyItem(item({ occurredOn: '2026-02-29' })), /valid recording or event date/);
  assert.throws(() => validateFamilyItem(item({ updatedAt: '2025-01-01T00:00:00.000Z' })), /date metadata/);
  assert.throws(() => validateFamilyItem(item({ passages: [{ reference: { bookId: 'JHN', chapter: 3, verse: 16 }, label: 'John' }] })), /named edition/);
  assert.throws(() => validateFamilyItem(item({ passages: [{ reference: { bookId: 'JHN', chapter: 3, verse: 16, editionId: '../private' }, label: 'John' }] })), /passage link/);
  assert.throws(() => validateFamilyState({ ...archive(item()), revision: -1 }), /inventory/);
});

test('caption parsing retains timed text safely and rejects unusable or invalid time ranges', () => {
  const captions = 'WEBVTT\r\n\r\nsecond\r\n00:02.000 --> 00:03.500\r\n<b>Àyọ̀</b> & text\r\n\r\n00:00.000 --> 00:01.000\r\nEarlier cue';
  assert.deepEqual(parseCaptions(captions), [{ start: 0, end: 1, text: 'Earlier cue' }, { start: 2, end: 3.5, text: 'Àyọ̀ & text' }]);
  for (const text of ['WEBVTT', 'not captions', 'WEBVTT\n\n00:01.000 --> 00:00.000\nInvalid', 'WEBVTT\n\n00:60.000 --> 00:61.000\nInvalid']) assert.throws(() => parseCaptions(text), /caption|timestamp|WebVTT/i);
});

test('family search preserves spelling and respects hidden records, dates, people and source links', () => {
  const visible = item();
  const hidden = item({ id: 'hidden', visibility: 'hidden' });
  const undated = item({ id: 'undated', occurredOn: null, person: 'Other fixture' });
  const records = [visible, hidden, undated];
  assert.deepEqual(filterFamilyItems(records, { query: 'ayo JHN 3:16', from: '2024-01-01', to: '2024-12-31' }).map(value => value.id), ['fixture-memory']);
  assert.equal(filterFamilyItems(records, { showHidden: true, person: 'Àyọ̀ fixture' }).length, 2);
  assert.equal(filterFamilyItems(records, { collection: 'missing' }).length, 0);
  assert.equal(visible.person, 'Àyọ̀ fixture');
});

// Minimal transaction fixture: it models atomic writes and serial readwrite transactions.
// Actual IndexedDB and cross-tab behavior are also exercised by family.browser.spec.ts.
function databaseFixture(initial) {
  let stored = initial === undefined ? undefined : structuredClone(initial);
  const queue = [];
  let active;
  const options = { holdWrite: false, failWrite: false, failRead: false, failOpen: false };
  const names = [];
  const database = {
    objectStoreNames: { contains: () => true }, close() {}, createObjectStore() {},
    transaction(name, mode) {
      assert.equal(name, 'archive');
      const tx = { mode, aborted: false, pending: undefined, request: undefined,
        objectStore: () => ({
          get(key) { assert.equal(key, 'family'); const request = {}; tx.request = request; queue.push(tx); queueMicrotask(pump); return request; },
          put(value, key) { assert.equal(key, 'family'); tx.pending = structuredClone(value); if (options.failWrite) queueMicrotask(() => { tx.onerror?.(); tx.abort(); }); },
        }),
        abort() { if (tx.aborted) return; tx.aborted = true; queueMicrotask(() => { tx.onabort?.(); if (active === tx) { active = undefined; pump(); } }); },
      };
      return tx;
    },
  };
  function finish() { const tx = active; if (!tx || tx.aborted) return; if (tx.pending !== undefined) stored = structuredClone(tx.pending); tx.oncomplete?.(); active = undefined; pump(); }
  function pump() {
    if (active || !queue.length) return;
    const tx = active = queue.shift();
    queueMicrotask(() => {
      if (options.failRead) { tx.onerror?.(); tx.abort(); return; }
      tx.request.result = stored === undefined ? undefined : structuredClone(stored);
      tx.request.onsuccess?.();
      if (!tx.aborted && !(options.holdWrite && tx.mode === 'readwrite')) queueMicrotask(finish);
    });
  }
  const api = { open(name) { names.push(name); const request = {}; queueMicrotask(() => { if (options.failOpen) request.onerror?.(); else { request.result = database; request.onsuccess?.(); } }); return request; } };
  Object.defineProperty(globalThis, 'indexedDB', { value: api, configurable: true, writable: true });
  return { options, finish, names, stored: () => stored, dispose: () => { database.onversionchange?.(); delete globalThis.indexedDB; } };
}

test('archive writes use a separate database and report success only after transaction commit', async () => {
  const db = databaseFixture();
  try {
    assert.deepEqual(await loadFamilyArchive(), emptyFamilyArchive());
    assert.deepEqual(db.names, ['adigun-aibible-family']);
    db.options.holdWrite = true;
    let completed = false;
    const saving = saveFamilyArchive(archive(item()), 0).then(value => { completed = true; return value; });
    await tick();
    assert.equal(completed, false);
    assert.equal(db.stored(), undefined);
    db.finish();
    assert.equal((await saving).revision, 1);
    assert.equal((await loadFamilyArchive()).items[0].body, item().body);
  } finally { db.dispose(); }
});

test('storage failure leaves originals intact and a later successful retry keeps the correct revision', async () => {
  const attachment = await prepareFamilyAttachment(new Blob(['Keep these original bytes'], { type: 'text/plain' }), 'fixture.txt');
  const previous = { ...archive(item({ attachment })), revision: 2 };
  const db = databaseFixture(previous);
  try {
    db.options.failWrite = true;
    await assert.rejects(saveFamilyArchive(emptyFamilyArchive(), 2), /not saved/);
    assert.equal(db.stored().revision, 2);
    assert.equal(await db.stored().items[0].attachment.blob.text(), 'Keep these original bytes');
    db.options.failWrite = false;
    const saved = await saveFamilyArchive(emptyFamilyArchive(), 2);
    assert.equal(saved.revision, 3);
    assert.equal(saved.items.length, 0);
  } finally { db.dispose(); }
});

test('simultaneous tab saves cannot silently overwrite a committed family archive', async () => {
  const db = databaseFixture();
  try {
    const results = await Promise.allSettled([saveFamilyArchive(archive(item()), 0), saveFamilyArchive(archive(item({ id: 'another' })), 0)]);
    assert.equal(results[0].status, 'fulfilled');
    assert.equal(results[1].status, 'rejected');
    assert.ok(results[1].reason instanceof FamilyConflictError);
    assert.deepEqual((await loadFamilyArchive()).items.map(value => value.id), ['fixture-memory']);
    await assert.rejects(saveFamilyArchive(emptyFamilyArchive(), 0), /Another tab/);
  } finally { db.dispose(); }
});

test('corrupt stored state and originals are surfaced without replacing the archive with an empty one', async () => {
  const invalid = { ...archive(item()), schemaVersion: 99 };
  let db = databaseFixture(invalid);
  try {
    await assert.rejects(loadFamilyArchive(), /Unsupported/);
    await assert.rejects(saveFamilyArchive(emptyFamilyArchive(), 0), /Unsupported/);
    assert.deepEqual(db.stored(), invalid);
  } finally { db.dispose(); }
  const attachment = await prepareFamilyAttachment(new Blob(['Fixture original'], { type: 'text/plain' }), 'fixture.txt');
  db = databaseFixture(archive(item({ attachment: { ...attachment, sha256: '0'.repeat(64) } })));
  try { await assert.rejects(loadFamilyArchive(), /integrity check/); assert.equal(db.stored().items.length, 1); }
  finally { db.dispose(); }
});

test('failed opening and failed reads can be retried without discarding saved writing', async () => {
  const previous = archive(item());
  const db = databaseFixture(previous);
  try {
    db.options.failOpen = true;
    await assert.rejects(loadFamilyArchive(), /Could not open/);
    db.options.failOpen = false;
    db.options.failRead = true;
    await assert.rejects(loadFamilyArchive(), /Could not read/);
    db.options.failRead = false;
    assert.equal((await loadFamilyArchive()).items[0].body, previous.items[0].body);
  } finally { db.dispose(); }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { emptyHistoricalStudy, historicalPlainText, locatorKey, searchHistorical, validateHistoricalManifest, validateHistoricalStudy, validateHistoricalWork, verifyHistoricalBytes } from '../src/historical/model.ts';

const root = new URL('../', import.meta.url);
const manifest = validateHistoricalManifest(JSON.parse(await readFile(new URL('data/historical/manifest.json', root), 'utf8')));
const edition = manifest.editions.find(item => item.id === 'didache-lightfoot');
const bytes = await readFile(new URL(edition.path, root));
const work = validateHistoricalWork(JSON.parse(bytes), edition);
const locator = { workId: work.id, editionId: work.editionId, sourceRevision: work.sourceRevision, chapter: 1, unit: 1 };

test('installed historical source has the complete pinned chapter/unit inventory, checksum and reproducible importer', async () => {
  assert.equal(bytes.length, 29358);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), '328c82f7dc9e676b0bfe50b9edda620e905ad7ca549cfc7c5a281726d7fb3159');
  assert.deepEqual(work.chapters.map(chapter => chapter.units.length), [23,7,16,20,6,6,7,11,12,15,21,8,8,5,7,17]);
  assert.deepEqual(await verifyHistoricalBytes(Uint8Array.from(bytes).buffer, edition), work);
  const output = execFileSync('python3', [new URL('scripts/import-historical.py', root).pathname, '--verify'], { encoding: 'utf8' });
  assert.match(output, /16 chapters, 189 numbered source units/);
  const notice = await readFile(new URL(edition.noticePath, root), 'utf8');
  assert.match(notice, /14637905/); assert.match(notice, /CC BY-SA 4.0/); assert.match(notice, /1889/);
  assert.equal(edition.rightsEvidence.length >= 4, true);
});

test('historical source corruption, missing units, unsafe source paths and absent permissions fail closed', async () => {
  const corrupt = Uint8Array.from(bytes); corrupt[corrupt.length - 2] ^= 1;
  await assert.rejects(verifyHistoricalBytes(corrupt.buffer, edition), /checksum/);
  await assert.rejects(verifyHistoricalBytes(Uint8Array.from(bytes.subarray(0, bytes.length - 1)).buffer, edition), /checksum/);
  const missing = structuredClone(work); missing.chapters[15].units.pop();
  assert.throws(() => validateHistoricalWork(missing, edition), /coverage/);
  const duplicate = structuredClone(work); duplicate.chapters[0].units[1].number = 1;
  assert.throws(() => validateHistoricalWork(duplicate, edition), /missing or duplicated/);
  const wrong = structuredClone(work); wrong.sourceRevision = 'different-source';
  assert.throws(() => validateHistoricalWork(wrong, edition), /does not match/);
  assert.throws(() => validateHistoricalWork(work, { ...edition, rights: { ...edition.rights, display: false } }), /permission/);
  for (const patch of [{ path: '../../outside.json' }, { sourceUrl: 'javascript:alert(1)' }, { rights: {} }, { rightsEvidence: [] }]) {
    assert.throws(() => validateHistoricalManifest({ schemaVersion: 1, editions: [{ ...edition, ...patch }] }));
  }
});

test('historical search returns exact source units; export includes every unit and attribution without notebook content', () => {
  const results = searchHistorical(work, '  TWO   WAYS ');
  assert.equal(results.some(result => result.chapter === 1 && result.unit === 1), true);
  for (const result of results) assert.equal(result.text, work.chapters[result.chapter - 1].units[result.unit - 1].text);
  assert.deepEqual(searchHistorical(work, ' '), []);
  const text = historicalPlainText(work, edition);
  for (const chapter of work.chapters) for (const unit of chapter.units) assert.equal(text.includes(`${chapter.number}:${unit.number} ${unit.text}`), true);
  for (const required of [edition.attribution, edition.sourceUrl, edition.sourceRevision, edition.license, edition.licenseUrl, edition.transcriptionStatus]) assert.equal(text.includes(required), true);
  assert.throws(() => historicalPlainText(work, { ...edition, rights: { ...edition.rights, export: false } }), /permission/);
});

test('historical backups carry a distinct application kind and preserve exact edition/revision locators', () => {
  const note = { id: 'example-note', locator, text: 'Private source observation', updatedAt: '2026-11-05T10:00:00.000Z' };
  const backup = { ...emptyHistoricalStudy(), revision: 2, notes: [note], bookmarks: [locator] };
  assert.deepEqual(validateHistoricalStudy(JSON.parse(JSON.stringify(backup))), backup);
  assert.notEqual(locatorKey(locator), locatorKey({ ...locator, sourceRevision: 'new-source' }));
  for (const invalid of [
    { ...backup, kind: 'another-app' }, { ...backup, revision: -1 }, { ...backup, notes: [note, note] },
    { ...backup, bookmarks: [locator, locator] }, { ...backup, notes: [{ ...note, updatedAt: 'not-a-date' }] },
    { ...backup, notes: [{ ...note, locator: { ...locator, chapter: 0 } }] },
    { ...backup, notes: [{ ...note, text: 'x'.repeat(10001) }] }
  ]) assert.throws(() => validateHistoricalStudy(invalid));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { validateEditionRightsRegister, decideEditionOperation } from '../src/edition-rights.ts';
import { parseReference, validateReference } from '../src/domain.ts';

const id = 'eng-douay-rheims1899';
const archiveSha = '7e267290077a9ac9432ac4bd95e53096c77bf9aedc8ba4020503402863f2a7f0';
const read = path => JSON.parse(readFileSync(new URL(`../data/editions/${path}`, import.meta.url), 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

test('Douay-Rheims retains its pinned 73-book source list and exact publisher accounting', () => {
  const edition = read('catalog.json').editions.find(row => row.id === id);
  assert.ok(edition);
  const manifest = read(`${id}/manifest.json`), provenance = read(`${id}/provenance.json`);
  assert.deepEqual(manifest.totals, { books: 73, chapters: 1334, verses: 35811 });
  assert.deepEqual(manifest.edition, edition);
  assert.equal(edition.sha256, archiveSha);
  assert.deepEqual(manifest.books.slice(39, 46).map(book => book.id), ['TOB', 'JDT', 'WIS', 'SIR', 'BAR', '1MA', '2MA']);
  assert.equal(edition.canonProfile.id, 'douay-rheims-73');
  assert.equal(edition.canonProfile.bookCount, 73);
  assert.equal(edition.canonProfile.oldTestamentBookCount, 46);
  assert.match(edition.canonProfile.description, /does not claim one canon for all Christian traditions/);
  assert.deepEqual(provenance.totals, manifest.totals);
  assert.equal(provenance.displayTextMember, 'engDRA_vpl.txt');
  assert.equal(provenance.publisherBracketFormatDifferences.length, 6);
  assert.equal(sha(Buffer.from(JSON.stringify(provenance.publisherBracketFormatDifferences) + '\n')), 'f6c15c67956cc7acaee1294940735c68942d4dd23db5232945067c3d1e12f5cd');
  const sourceNotice = readFileSync(new URL(`../data/editions/${id}/SOURCE_NOTICE.html.txt`, import.meta.url));
  assert.equal(sha(sourceNotice), provenance.generatedFileSha256['SOURCE_NOTICE.html.txt']);
  assert.match(readFileSync(new URL(`../data/editions/${id}/NOTICE.txt`, import.meta.url), 'utf8'), /Public Domain/);
});

test('the 73-book reference resolves to exact English source wording', () => {
  const manifest = read(`${id}/manifest.json`);
  assert.ok(validateReference({ bookId: 'TOB', chapter: 1, verse: 1, editionId: id }, manifest.books, id));
  assert.deepEqual(parseReference('Tobit 1:1', manifest.books), { bookId: 'TOB', chapter: 1, verse: 1 });
  assert.equal(manifest.books[39].name, 'Tobit');
  assert.match(readFileSync(new URL(`../data/editions/${id}/books/TOB.json`, import.meta.url), 'utf8'), /Tobias of the tribe and city of Nephtali/);
});

test('rights and publisher-annotation coverage stay bound to the imported source', () => {
  const edition = read('catalog.json').editions.find(row => row.id === id);
  const rights = validateEditionRightsRegister(read('rights-register.json'));
  const record = rights.editions.find(row => row.editionId === id);
  assert.ok(record);
  for (const operation of ['display', 'offline', 'searchIndex', 'documentExport', 'redistribution']) {
    assert.equal(decideEditionOperation(record, operation, { sourceSha256: archiveSha }).allowed, true, operation);
  }
  assert.equal(record.operations.recordedAudio.state, 'unknown');
  assert.equal(decideEditionOperation(record, 'display', { sourceSha256: '0'.repeat(64) }).allowed, false);

  const coverage = JSON.parse(readFileSync(new URL('../data/speakers/publisher-coverage.json', import.meta.url), 'utf8'));
  const entry = coverage.editions.find(row => row.editionId === id);
  assert.equal(entry.sourceSha256, edition.sha256);
  assert.equal(entry.marker, 'none');
  assert.equal(entry.totalSpans, 0);
  assert.equal(entry.totalVerses, 0);
  assert.ok(entry.books.every(book => book.spans === 0 && book.verses === 0));

  const acquired = read('acquisition-catalog.json').records.find(row => row.providerId === 'engDRA');
  assert.equal(acquired.availability, 'installed');
  assert.equal(acquired.coverage, 'validated-full-bible');
  assert.equal(acquired.installedEditionId, id);
  assert.equal(acquired.installedSourceSha256, archiveSha);
  assert.deepEqual(acquired.installedTotals, { books: 73, chapters: 1334, verses: 35811 });
});

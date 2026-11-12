import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { validateEditionRightsRegister, decideEditionOperation } from '../src/edition-rights.ts';
import { parseReference, validateReference } from '../src/domain.ts';

const id = 'lat-clementine1598';
const read = path => JSON.parse(readFileSync(new URL(`../data/editions/${path}`, import.meta.url), 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

test('Clementine Vulgate retains the pinned 73-book publisher list and exact source accounting', () => {
  const catalog = read('catalog.json'), edition = catalog.editions.find(row => row.id === id);
  assert.ok(edition);
  const manifest = read(`${id}/manifest.json`), provenance = read(`${id}/provenance.json`);
  assert.deepEqual(manifest.totals, { books: 73, chapters: 1334, verses: 35809 });
  assert.deepEqual(manifest.edition, edition);
  assert.equal(edition.sha256, 'bf13a76cc8131fd469a48158c79d9b2adcaad15766ec53852322fb71ca25301b');
  assert.deepEqual(manifest.books.slice(39, 46).map(book => book.id), ['TOB', 'JDT', 'WIS', 'SIR', 'BAR', '1MA', '2MA']);
  assert.equal(edition.canonProfile.id, 'latin-vulgate-73');
  assert.equal(edition.canonProfile.bookCount, 73);
  assert.equal(edition.canonProfile.oldTestamentBookCount, 46);
  assert.match(edition.canonProfile.description, /do not claim one canon for all Christian traditions/);
  assert.equal(provenance.displayTextMember, 'latVUC_vpl.txt');
  assert.deepEqual(provenance.totals, manifest.totals);
  assert.equal(provenance.publisherBracketFormatDifferences.length, 1826);
  assert.equal(sha(Buffer.from(JSON.stringify(provenance.publisherBracketFormatDifferences) + '\n')), '060b65dc2f9e8c9dfb71fed57834f74ecec9de3913a445c34cbef32d9031e556');
  const notice = readFileSync(new URL(`../data/editions/${id}/SOURCE_NOTICE.html.txt`, import.meta.url));
  assert.equal(sha(notice), provenance.generatedFileSha256['SOURCE_NOTICE.html.txt']);
  assert.match(readFileSync(new URL(`../data/editions/${id}/NOTICE.txt`, import.meta.url), 'utf8'), /Public Domain/);
});

test('73-book references and operation rights are bound to the exact Vulgate revision', () => {
  const edition = read('catalog.json').editions.find(row => row.id === id);
  const manifest = read(`${id}/manifest.json`);
  const tob = manifest.books.find(book => book.id === 'TOB');
  assert.ok(validateReference({ bookId: 'TOB', chapter: 1, verse: 1, editionId: id }, manifest.books, id));
  assert.deepEqual(parseReference('Tobit 1:1', manifest.books), { bookId: 'TOB', chapter: 1, verse: 1 });
  assert.equal(tob.name, 'Tobit');
  assert.match(readFileSync(new URL(`../data/editions/${id}/books/TOB.json`, import.meta.url), 'utf8'), /Tobias ex tribu/);
  const rights = validateEditionRightsRegister(read('rights-register.json'));
  const record = rights.editions.find(row => row.editionId === id);
  assert.ok(record);
  for (const operation of ['display', 'offline', 'searchIndex', 'documentExport', 'redistribution']) {
    assert.equal(decideEditionOperation(record, operation, { sourceSha256: edition.sha256 }).allowed, true, operation);
  }
  assert.equal(record.operations.recordedAudio.state, 'unknown');
  assert.equal(decideEditionOperation(record, 'display', { sourceSha256: '0'.repeat(64) }).allowed, false);
});

test('acquisition inventory counts the Vulgate only after the full import was validated', () => {
  const row = read('acquisition-catalog.json').records.find(item => item.providerId === 'latVUC');
  assert.equal(row.availability, 'installed');
  assert.equal(row.coverage, 'validated-full-bible');
  assert.equal(row.installedEditionId, id);
  assert.equal(row.installedSourceSha256, read('catalog.json').editions.find(item => item.id === id).sha256);
  assert.deepEqual(row.installedTotals, { books: 73, chapters: 1334, verses: 35809 });
});

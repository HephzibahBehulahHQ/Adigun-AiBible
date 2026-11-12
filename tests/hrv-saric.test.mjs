import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseReference, validateReference } from '../src/domain.ts';
import { validateEditionRightsRegister, decideEditionOperation } from '../src/edition-rights.ts';

const id = 'hrv-saric';
const read = path => JSON.parse(readFileSync(new URL(`../data/editions/${path}`, import.meta.url), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

test('Croatian Šarić edition preserves its exact 73-book source profile and content pins', () => {
  const catalog = read('catalog.json'), edition = catalog.editions.find(row => row.id === id);
  const manifest = read(`${id}/manifest.json`), provenance = read(`${id}/provenance.json`);
  assert.ok(edition);
  assert.deepEqual(manifest.totals, { books: 73, chapters: 1328, verses: 35448 });
  assert.deepEqual(manifest.edition, edition);
  assert.equal(edition.language, 'hrv');
  assert.equal(edition.translator, 'Ivan Šarić');
  assert.equal(edition.sha256, 'a9fc8665d3c1e5e806b2b33456c96d84cc4866cc6f9d9ab8d36d9e1c1ccb0e2a');
  assert.equal(edition.canonProfile.id, 'hrv-saric-source-order-73');
  assert.equal(edition.canonProfile.bookCount, 73);
  assert.equal(edition.canonProfile.oldTestamentBookCount, 46);
  assert.match(edition.canonProfile.description, /including its ESG ID for Esther/);
  assert.match(edition.conditions.join(' '), /not an independent worldwide legal opinion/);
  assert.deepEqual(manifest.books.slice(38, 46).map(book => book.id), ['TOB', 'JDT', 'ESG', 'WIS', 'SIR', 'BAR', '1MA', '2MA']);
  assert.equal(manifest.books.find(book => book.id === 'ESG').name, 'Esther');
  assert.equal(validateReference({ bookId: 'ESG', chapter: 1, verse: 1, editionId: id }, manifest.books, id), true);
  assert.deepEqual(parseReference('Esther 1:1', manifest.books), { bookId: 'ESG', chapter: 1, verse: 1 });
  const genesis = read(`${id}/books/GEN.json`);
  assert.equal(genesis.chapters[0].verses[0].text, 'U početku stvori Bog nebo i zemlju.');
  for (const book of manifest.books) {
    const data = read(`${id}/books/${book.id}.json`);
    assert.equal(data.chapters.length, book.chapters, book.id);
    for (const chapter of data.chapters) assert.deepEqual(chapter.verses.map(verse => verse.number), [...chapter.verses.map(verse => verse.number)].sort((a, b) => a - b), `${book.id} ${chapter.number}`);
  }
  assert.equal(provenance.archiveSha256, edition.sha256);
  assert.equal(provenance.displayTextMember, 'hrv_vpl.txt');
  assert.equal(provenance.members['hrv_about.htm'], '157d83548e21a20211997975627005102b495ccda9b0a396bfbea39e3b5097c4');
  assert.equal(provenance.publisherBracketFormatDifferences.length, 29);
  assert.equal(provenance.publisherBracketInventorySha256, '976cce505eb62b5c01e2c7ba5c2b3f566552067ef85c30eb0fd21fa3505c5d7c');
  assert.equal(provenance.publisherReferenceOrderExceptions.length, 7);
  assert.equal(provenance.publisherReferenceOrderExceptionInventorySha256, 'faf1e142acaa275ef2662a931e60717bf9525cc93f0d22fda6404ba162abbea3');
  assert.equal(provenance.renderedReferenceOrder, 'ascending numeric verse reference after exact source-order verification');
  const notice = readFileSync(new URL(`../data/editions/${id}/SOURCE_NOTICE.html.txt`, import.meta.url));
  assert.equal(hash(notice), provenance.generatedFileSha256['SOURCE_NOTICE.html.txt']);
});

test('Croatian source rights, acquisition review and publisher inventory remain source-bound', () => {
  const edition = read('catalog.json').editions.find(row => row.id === id);
  const rights = validateEditionRightsRegister(read('rights-register.json'));
  const record = rights.editions.find(row => row.editionId === id);
  assert.ok(record);
  assert.equal(record.sourceSha256, edition.sha256);
  for (const operation of ['display', 'offline', 'searchIndex', 'documentExport', 'redistribution']) {
    assert.equal(decideEditionOperation(record, operation, { sourceSha256: edition.sha256 }).allowed, true, operation);
  }
  assert.equal(record.operations.recordedAudio.state, 'unknown');
  const acquired = read('acquisition-catalog.json').records.find(row => row.providerId === 'hrv');
  assert.equal(acquired.availability, 'installed');
  assert.equal(acquired.coverage, 'validated-full-bible');
  assert.equal(acquired.installedEditionId, id);
  assert.equal(acquired.installedSourceSha256, edition.sha256);
  assert.deepEqual(acquired.installedTotals, { books: 73, chapters: 1328, verses: 35448 });
  assert.equal(acquired.sourceReview.state, 'completed');
  const coverage = read('../speakers/publisher-coverage.json').editions.find(row => row.editionId === id);
  assert.equal(coverage.sourceSha256, edition.sha256);
  assert.equal(coverage.books.length, 73);
  assert.equal(coverage.totalSpans, 0);
});

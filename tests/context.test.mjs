import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { contextKey, loadContextSource, safeSourceUrl, validateContextRecords } from '../src/context/model.ts';
import { contextRecords, contextDebates, contextFor } from '../src/context/records.ts';

const json = path => JSON.parse(readFileSync(new URL(`../data/${path}`, import.meta.url), 'utf8'));
const prefix = id => id === 'eng-web' ? '' : `editions/${id}/`;
const dependencies = {
  getManifest: async id => json(`${prefix(id)}manifest.json`),
  getBook: async (book, id) => json(`${prefix(id)}books/${book}.json`),
};

test('context keeps exact selected-edition wording, verse bounds, notes and source identity', async () => {
  const source = await loadContextSource({ bookId: 'JHN', chapter: 3, verse: 16, endVerse: 18, editionId: 'yor' }, dependencies);
  const original = json('editions/yor/books/JHN.json').chapters[2];
  assert.equal(source.edition.id, 'yor');
  assert.deepEqual(source.verses, original.verses.filter(v => v.number >= 14 && v.number <= 20));
  assert.deepEqual(source.missing, []);
  assert.equal(source.reference.endVerse, 18);
  assert.equal(source.chapterCount, 21);
  assert.ok(contextKey(source.reference).startsWith('yor:JHN:3:16:18'));
});

test('context displays a real BSB numbering omission without substituting WEB', async () => {
  const source = await loadContextSource({ bookId: 'MAT', chapter: 17, verse: 21, editionId: 'eng-bsb' }, dependencies);
  assert.deepEqual(source.missing, [21]);
  assert.equal(source.edition.id, 'eng-bsb');
  const original = json('editions/eng-bsb/books/MAT.json').chapters[16];
  assert.deepEqual(source.verses, original.verses.filter(v => v.number >= 19 && v.number <= 23));
});

test('invalid or mismatched source references fail before invented context is returned', async () => {
  for (const ref of [
    { bookId: 'MAT', chapter: 0, verse: 1 }, { bookId: 'MAT', chapter: 5, verse: 0 },
    { bookId: 'MAT', chapter: 5, verse: 5, endVerse: 2 }, { bookId: 'MAT', chapter: 99, verse: 1 },
    { bookId: 'MAT', chapter: 5, verse: 999 }, { bookId: 'BAD', chapter: 1, verse: 1 },
    { bookId: '<script>', chapter: 1, verse: 1 }, { bookId: 'MAT', chapter: NaN, verse: 1 },
  ]) await assert.rejects(loadContextSource(ref, dependencies));
  await assert.rejects(loadContextSource({ bookId: 'JHN', chapter: 3, verse: 16, editionId: 'yor' }, { ...dependencies, getManifest: async () => json('manifest.json') }), /does not match/);
  await assert.rejects(loadContextSource({ bookId: 'JHN', chapter: 3, verse: 16 }, { ...dependencies, getBook: async () => { throw new Error('offline, missing download'); } }), /offline, missing download/);
});

test('every context citation resolves to nonempty real source positions and all records remain drafts', () => {
  const manifest = json('manifest.json');
  for (const record of contextRecords) {
    const book = manifest.books.find(book => book.id === record.bookId);
    assert.ok(record.fromChapter >= 1 && record.toChapter <= book.chapters, record.id);
    assert.equal(record.aiReviewStatus, 'AI-assisted draft · human review pending');
    for (const citation of [...record.sources, ...record.fields.flatMap(field => field.sources)]) {
      if (citation.url) assert.ok(safeSourceUrl(citation.url));
      if (!citation.reference) continue;
      const ref = citation.reference;
      assert.equal(ref.editionId, 'eng-web');
      const source = json(`books/${ref.bookId}.json`).chapters.find(ch => ch.number === ref.chapter);
      for (let verse = ref.verse; verse <= (ref.endVerse ?? ref.verse); verse++) assert.ok(source.verses.find(v => v.number === verse)?.text.trim(), `${record.id}: ${citation.label}, verse ${verse}`);
    }
    if (record.debateId) assert.ok(contextDebates[record.debateId]);
  }
  assert.equal(contextFor({ bookId: 'MAT', chapter: 5, verse: 3 }).length, 1);
  assert.equal(contextFor({ bookId: 'GEN', chapter: 1, verse: 1 }).length, 0);
});

test('provenance validation rejects invented approvals, unsafe URLs and duplicate records', () => {
  const record = structuredClone(contextRecords[0]);
  assert.throws(() => validateContextRecords([{ ...record, aiReviewStatus: 'human_reviewed' }]), /provenance/);
  assert.throws(() => validateContextRecords([{ ...record, sources: [] }]), /provenance/);
  assert.throws(() => validateContextRecords([{ ...record, sources: [{ label: 'Unsafe', url: 'javascript:alert(1)' }] }]), /provenance/);
  assert.throws(() => validateContextRecords([record, record]), /provenance/);
  assert.throws(() => validateContextRecords([{ ...record, toChapter: 0 }]), /provenance/);
  for (const url of ['javascript:alert(1)', 'http://example.com', 'https://name:password@example.com', 'data:text/html,test']) assert.equal(safeSourceUrl(url), false);
  for (const debate of Object.values(contextDebates)) {
    assert.equal(debate.reviewStatus, 'draft');
    assert.ok(debate.positions.length >= 2);
    for (const position of debate.positions) assert.ok(position.representativeSources.some(source => safeSourceUrl(source.url)));
  }
});

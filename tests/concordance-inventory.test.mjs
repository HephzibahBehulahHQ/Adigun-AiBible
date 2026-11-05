import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { countConcordance, validateConcordanceManifest, validateConcordanceRows } from '../src/concordance/model.ts';

const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
test('every installed Bible edition supplies exactly the declared concordance records, including source numbering gaps', () => {
  const ids = ['eng-web', ...read('data/editions/catalog.json').editions.filter(edition => edition.corpus === 'bible').map(edition => edition.id)];
  for (const id of ids) {
    const prefix = id === 'eng-web' ? 'data' : `data/editions/${id}`;
    const manifest = validateConcordanceManifest(read(`${prefix}/manifest.json`), id);
    const rows = manifest.books.flatMap(book => read(`${prefix}/books/${book.id}.json`).chapters.flatMap(chapter => chapter.verses.map(verse => ({ editionId: id, bookId: book.id, chapter: chapter.number, verse: verse.number, text: verse.text }))));
    assert.equal(validateConcordanceRows(rows, manifest).length, manifest.totals.verses, id);
  }
  assert.equal(ids.includes('eng-clearquran'), false);
});

test('source gaps remain absent while book/testament distributions and blank source records stay exact', async () => {
  const manifest = validateConcordanceManifest({ schemaVersion: 1, edition: { id: 'eng-web', name: 'Test source', language: 'en', sha256: 'a'.repeat(64) }, books: [{ id: 'GEN', name: 'Genesis', chapters: 1, verseCounts: [3], verseRecordCounts: [2] }, { id: 'MAT', name: 'Matthew', chapters: 1, verseCounts: [1] }], totals: { books: 2, chapters: 2, verses: 3 } }, 'eng-web');
  const rows = validateConcordanceRows([{ bookId: 'GEN', chapter: 1, verse: 1, text: 'Love love' }, { bookId: 'GEN', chapter: 1, verse: 3, text: '' }, { bookId: 'MAT', chapter: 1, verse: 1, text: 'Love' }], manifest);
  const source = { manifest, rows, indexSha256: 'b'.repeat(64), contentVersion: 'c'.repeat(24) };
  const query = { text: 'love', mode: 'word', caseSensitive: false, bookId: '', testament: 'old' };
  const old = await countConcordance(source, query);
  assert.equal(old.searchedRecords, 2); assert.equal(old.occurrences, 2); assert.equal(old.matchingVerses, 1); assert.equal(old.distribution.length, 1);
  assert.equal((await countConcordance(source, { ...query, testament: 'new' })).occurrences, 1);
  assert.equal((await countConcordance(source, { ...query, testament: '', bookId: 'MAT' })).searchedRecords, 1);
  assert.equal(rows.some(row => row.bookId === 'GEN' && row.verse === 2), false);
});

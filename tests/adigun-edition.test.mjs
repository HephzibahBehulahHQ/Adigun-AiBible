import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const manifest = read('../data/editions/adigun-edition/manifest.json');
const sourceManifest = read('../data/manifest.json');
const expectedBooks = [
  { id: 'GEN', testament: 'ot', chapters: Array.from({ length: 50 }, (_, index) => index + 1) },
  { id: 'EXO', testament: 'ot', chapters: Array.from({ length: 40 }, (_, index) => index + 1) },
  { id: 'LEV', testament: 'ot', chapters: Array.from({ length: 27 }, (_, index) => index + 1) },
  { id: 'NUM', testament: 'ot', chapters: Array.from({ length: 36 }, (_, index) => index + 1) },
  { id: 'DEU', testament: 'ot', chapters: Array.from({ length: 34 }, (_, index) => index + 1) },
  { id: 'JOS', testament: 'ot', chapters: Array.from({ length: 24 }, (_, index) => index + 1) },
  { id: 'JDG', testament: 'ot', chapters: Array.from({ length: 21 }, (_, index) => index + 1) },
  { id: 'RUT', testament: 'ot', chapters: [1, 2, 3, 4] },
  { id: '1SA', testament: 'ot', chapters: Array.from({ length: 31 }, (_, index) => index + 1) },
  { id: '2SA', testament: 'ot', chapters: Array.from({ length: 24 }, (_, index) => index + 1) },
  { id: '1KI', testament: 'ot', chapters: Array.from({ length: 22 }, (_, index) => index + 1) },
  { id: '2KI', testament: 'ot', chapters: Array.from({ length: 25 }, (_, index) => index + 1) },
  { id: '1CH', testament: 'ot', chapters: Array.from({ length: 29 }, (_, index) => index + 1) },
  { id: '2CH', testament: 'ot', chapters: Array.from({ length: 36 }, (_, index) => index + 1) },
  { id: 'EZR', testament: 'ot', chapters: Array.from({ length: 10 }, (_, index) => index + 1) },
  { id: 'NEH', testament: 'ot', chapters: Array.from({ length: 13 }, (_, index) => index + 1) },
  { id: 'EST', testament: 'ot', chapters: Array.from({ length: 10 }, (_, index) => index + 1) },
  { id: 'JOB', testament: 'ot', chapters: Array.from({ length: 42 }, (_, index) => index + 1) },
  ...sourceManifest.books.slice(39).map(book => ({
    id: book.id, testament: 'nt', chapters: Array.from({ length: book.chapters }, (_, index) => index + 1),
  })),
];

test('reader edition contains only complete, source-aligned Adigun chapters in canonical order', () => {
  assert.equal(manifest.edition.name, 'Adigun Edition');
  assert.equal(manifest.edition.scope, 'portion');
  assert.equal(manifest.edition.revision, expectedBooks.map(({ id, chapters }) =>
    sourceManifest.books.find(book => book.id === id).name+' 1–'+chapters.length).join('; '));
  assert.equal(manifest.edition.canonProfile.oldTestamentBookCount, 18);
  assert.equal(manifest.sourceManifestSha256, sourceManifest.edition.sha256);
  assert.deepEqual(manifest.books.map(row => row.id), expectedBooks.map(book => book.id));
  assert.deepEqual(manifest.totals, { books: 45, chapters: 738, verses: 21898 });
  const installedBooks = [];
  for (const expected of expectedBooks) {
    const source = sourceManifest.books.find(row => row.id === expected.id);
    const book = read(`../data/editions/adigun-edition/books/${expected.id}.json`);
    const pinnedBook = read('../data/books/'+expected.id+'.json');
    const manifestBook = manifest.books.find(row => row.id === expected.id);
    installedBooks.push(book);
    const candidates = expected.chapters.map(number => read(`../content/genz/${expected.testament}/${expected.id}/${String(number).padStart(2, '0')}.json`));
    assert.equal(book.id, expected.id);
    assert.equal(book.chapters.length, expected.chapters.length);
    assert.equal(manifestBook.chapters, expected.chapters.length);
    for (const [index, chapter] of book.chapters.entries()) {
      const candidate = candidates[index];
      const chapterNumber = expected.chapters[index];
      const sourceCount = source.verseCounts[chapterNumber - 1];
      assert.equal(chapter.number, chapterNumber);
      assert.equal(chapter.verses.length, sourceCount);
      assert.deepEqual(chapter.verses, candidate.verses.map(({ number, text }) => ({ number, text })));
      assert.deepEqual(chapter.verses.filter(verse => verse.text === '').map(verse => verse.number),
        pinnedBook.chapters[chapterNumber - 1].verses.filter(verse => verse.text === '').map(verse => verse.number));
    }
  }
  const digest = createHash('sha256').update(JSON.stringify({ sourceHash: sourceManifest.edition.sha256, books: installedBooks })).digest('hex');
  assert.equal(manifest.edition.sha256, digest);
  const catalog = read('../data/editions/catalog.json').editions.find(row => row.id === 'adigun-edition');
  assert.equal(catalog.sha256, digest);
  assert.deepEqual(catalog.totals, manifest.totals);
});

test('the search index covers every authored verse and omits empty source positions', () => {
  const searchIndex = read('../data/editions/adigun-edition/search-index.json');
  const expected = manifest.books.flatMap(({ id }) =>
    read(`../data/editions/adigun-edition/books/${id}.json`).chapters.flatMap(chapter =>
      chapter.verses.filter(verse => verse.text.trim()).map(verse => ({
        bookId: id, chapter: chapter.number, verse: verse.number, text: verse.text, editionId: manifest.edition.id,
      }))));
  assert.deepEqual(searchIndex, expected);
});



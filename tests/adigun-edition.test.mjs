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
  { id: 'MAT', testament: 'nt', chapters: Array.from({ length: 28 }, (_, index) => index + 1) },
];

test('reader edition contains only complete, source-aligned Adigun chapters in canonical order', () => {
  assert.equal(manifest.edition.name, 'Adigun Edition');
  assert.equal(manifest.edition.scope, 'portion');
  assert.equal(manifest.edition.revision, 'Genesis 1–50; Exodus 1–40; Leviticus 1–27; Matthew 1–28');
  assert.equal(manifest.sourceManifestSha256, sourceManifest.edition.sha256);
  assert.deepEqual(manifest.books.map(row => row.id), ['GEN', 'EXO', 'LEV', 'MAT']);
  assert.deepEqual(manifest.totals, { books: 4, chapters: 145, verses: 4676 });
  const installedBooks = [];
  for (const expected of expectedBooks) {
    const source = sourceManifest.books.find(row => row.id === expected.id);
    const book = read(`../data/editions/adigun-edition/books/${expected.id}.json`);
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
      assert.ok(chapter.verses.every(verse => verse.text.trim()));
    }
  }
  const digest = createHash('sha256').update(JSON.stringify({ sourceHash: sourceManifest.edition.sha256, books: installedBooks })).digest('hex');
  assert.equal(manifest.edition.sha256, digest);
  const catalog = read('../data/editions/catalog.json').editions.find(row => row.id === 'adigun-edition');
  assert.equal(catalog.sha256, digest);
  assert.deepEqual(catalog.totals, manifest.totals);
});



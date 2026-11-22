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
  { id: 'PSA', testament: 'ot', chapters: Array.from({ length: 150 }, (_, index) => index + 1) },
  { id: 'PRO', testament: 'ot', chapters: Array.from({ length: 31 }, (_, index) => index + 1) },
  { id: 'ECC', testament: 'ot', chapters: Array.from({ length: 12 }, (_, index) => index + 1) },
  { id: 'SNG', testament: 'ot', chapters: Array.from({ length: 8 }, (_, index) => index + 1) },
  { id: 'ISA', testament: 'ot', chapters: Array.from({ length: 66 }, (_, index) => index + 1) },
  { id: 'MAT', testament: 'nt', chapters: Array.from({ length: 28 }, (_, index) => index + 1) },
];

test('reader edition contains only complete, source-aligned Adigun chapters in canonical order', () => {
  assert.equal(manifest.edition.name, 'Adigun Edition');
  assert.equal(manifest.edition.scope, 'portion');
  assert.equal(manifest.edition.revision, 'Genesis 1–50; Exodus 1–40; Leviticus 1–27; Numbers 1–36; Deuteronomy 1–34; Joshua 1–24; Judges 1–21; Ruth 1–4; 1 Samuel 1–31; 2 Samuel 1–24; 1 Kings 1–22; 2 Kings 1–25; 1 Chronicles 1–29; 2 Chronicles 1–36; Ezra 1–10; Nehemiah 1–13; Esther 1–10; Job 1–42; Psalms 1–150; Proverbs 1–31; Ecclesiastes 1–12; Song of Solomon 1–8; Isaiah 1–66; Matthew 1–28');
  assert.equal(manifest.sourceManifestSha256, sourceManifest.edition.sha256);
  assert.deepEqual(manifest.books.map(row => row.id), ['GEN', 'EXO', 'LEV', 'NUM', 'DEU', 'JOS', 'JDG', 'RUT', '1SA', '2SA', '1KI', '2KI', '1CH', '2CH', 'EZR', 'NEH', 'EST', 'JOB', 'PSA', 'PRO', 'ECC', 'SNG', 'ISA', 'MAT']);
  assert.deepEqual(manifest.totals, { books: 24, chapters: 773, verses: 20018 });
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



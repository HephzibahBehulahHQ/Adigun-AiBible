import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const manifest = read('../data/editions/adigun-edition/manifest.json');
const sourceManifest = read('../data/manifest.json');
const book = read('../data/editions/adigun-edition/books/GEN.json');

test('reader edition contains only complete, source-aligned Adigun Genesis chapters in book order', () => {
  const source = sourceManifest.books.find(row => row.id === 'GEN');
  const candidates = Array.from({ length: 24 }, (_, index) => read(`../content/genz/ot/GEN/${String(index + 1).padStart(2, '0')}.json`));
  assert.equal(manifest.edition.name, 'Adigun Edition');
  assert.equal(manifest.edition.scope, 'portion');
  assert.equal(manifest.edition.revision, 'Genesis 1–24');
  assert.equal(manifest.sourceManifestSha256, sourceManifest.edition.sha256);
  assert.deepEqual(manifest.books.map(row => row.id), ['GEN']);
  assert.deepEqual(manifest.totals, { books: 1, chapters: 24, verses: 659 });
  assert.equal(book.id, 'GEN');
  assert.equal(book.chapters.length, 24);
  for (const [index, chapter] of book.chapters.entries()) {
    const candidate = candidates[index];
    const sourceCount = source.verseCounts[index];
    assert.equal(chapter.number, index + 1);
    assert.equal(chapter.verses.length, sourceCount);
    assert.deepEqual(chapter.verses, candidate.verses.map(({ number, text }) => ({ number, text })));
    assert.ok(chapter.verses.every(verse => verse.text.trim()));
  }
  const digest = createHash('sha256').update(JSON.stringify({ sourceHash: sourceManifest.edition.sha256, books: [book] })).digest('hex');
  assert.equal(manifest.edition.sha256, digest);
  const catalog = read('../data/editions/catalog.json').editions.find(row => row.id === 'adigun-edition');
  assert.equal(catalog.sha256, digest);
  assert.deepEqual(catalog.totals, manifest.totals);
});

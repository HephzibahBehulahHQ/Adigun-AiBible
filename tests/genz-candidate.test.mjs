import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const sourceManifest = read('../data/manifest.json');
const sourceBooks = new Map(['GEN'].map(bookId => [bookId, read(`../data/books/${bookId}.json`)]));
const chapters = { GEN: Array.from({ length: 24 }, (_, index) => index + 1) };

for (const [bookId, bookChapters] of Object.entries(chapters)) {
 for (const chapterNumber of bookChapters) {
  test(`Adigun Edition ${bookId} ${chapterNumber} is complete and source-aligned`, () => {
    const path = `../content/genz/ot/${bookId}/${String(chapterNumber).padStart(2, '0')}.json`;
    const candidate = read(path), sourceBook = sourceBooks.get(bookId);
    const source = sourceBook.chapters.find(chapter => chapter.number === chapterNumber);
    assert.ok(source);
    assert.equal(candidate.editionId, 'adigun-genz');
    assert.equal(candidate.sourceEditionId, 'eng-web');
    assert.equal(candidate.sourceManifestSha256, sourceManifest.edition.sha256);
    assert.equal(candidate.bookId, bookId);
    assert.equal(candidate.chapterNumber, chapterNumber);
    assert.equal(candidate.verses.length, source.verses.length);
    assert.deepEqual(candidate.verses.map(verse => verse.number), source.verses.map(verse => verse.number));
    assert.deepEqual(candidate.verses.map(verse => verse.sourceRef), source.verses.map(verse => `eng-web:${bookId}:${chapterNumber}:${verse.number}`));
    assert.ok(candidate.verses.every(verse => typeof verse.text === 'string' && verse.text.trim().length > 0));
    if (chapterNumber === 1) {
      assert.deepEqual(candidate.verses.slice(0, 3).map(verse => verse.text), [
        'Lowkey, before anything even existed, God started the whole thing from scratch—the skies, the earth, literally everything.',
        "Back then, the earth was just empty vibes—no shape, straight pitch-black darkness covering the deep water, and God's Spirit was just hovering over the waves.",
        'Then God said, "Bet, let there be light," and instantly, light pulled up.',
      ]);
    }
  });
 }
}

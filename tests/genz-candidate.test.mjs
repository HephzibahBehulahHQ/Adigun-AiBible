import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const sourceManifest = read('../data/manifest.json');
const sourceBook = read('../data/books/GEN.json');
const chapters = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];

for (const chapterNumber of chapters) {
  test(`Adigun Edition Genesis ${chapterNumber} is complete and source-aligned`, () => {
    const path = `../content/genz/ot/GEN/${String(chapterNumber).padStart(2, '0')}.json`;
    const candidate = read(path);
    const source = sourceBook.chapters.find(chapter => chapter.number === chapterNumber);
    assert.ok(source);
    assert.equal(candidate.editionId, 'adigun-genz');
    assert.equal(candidate.sourceEditionId, 'eng-web');
    assert.equal(candidate.sourceManifestSha256, sourceManifest.edition.sha256);
    assert.equal(candidate.bookId, 'GEN');
    assert.equal(candidate.chapterNumber, chapterNumber);
    assert.equal(candidate.verses.length, source.verses.length);
    assert.deepEqual(candidate.verses.map(verse => verse.number), source.verses.map(verse => verse.number));
    assert.deepEqual(candidate.verses.map(verse => verse.sourceRef), source.verses.map(verse => `eng-web:GEN:${chapterNumber}:${verse.number}`));
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

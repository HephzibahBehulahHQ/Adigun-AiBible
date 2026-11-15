import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const emoji = /[\p{Extended_Pictographic}\p{Regional_Indicator}]/u;
const sourceManifest = read('../data/manifest.json');
const sourceBooks = new Map(['GEN'].map(bookId => [bookId, read(`../data/books/${bookId}.json`)]));
const chapters = { GEN: Array.from({ length: 39 }, (_, index) => index + 1) };

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
    if (chapterNumber <= 2 || chapterNumber >= 25) assert.ok(candidate.verses.every(verse => emoji.test(verse.text)), 'each installed Adigun verse includes an emoji');
    if (chapterNumber === 1) {
      assert.deepEqual(candidate.verses.slice(0, 3).map(verse => verse.text), [
        'Before anything was even on the map, God made the heavens and the earth. The whole universe? God set it up from scratch. 🌌',
        "Earth was unformed and empty—nothing laid out, just darkness covering the deep. God's Spirit hovered over the waters. Creation was still at the loading screen. 🌊",
        'God said, ‘Let there be light.’ And light pulled up—immediately. 💡',
      ]);
    }
    if (chapterNumber === 2) {
      assert.deepEqual(candidate.verses.slice(0, 3).map(verse => verse.text), [
        'The heavens, the earth, and everything in them were finished. Creation was complete. ✅',
        "By day seven, God had finished the work He'd been doing. So He took a rest from all that creating. 🛌",
        "God blessed day seven and set it apart, because that's when He rested from all the work of creating. Day seven was different. 🌿",
      ]);
    }
  });
 }
}

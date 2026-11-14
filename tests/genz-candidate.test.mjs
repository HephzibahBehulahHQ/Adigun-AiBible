import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const candidate = read('../content/genz/ot/GEN/01.json');
const source = read('../data/books/GEN.json');

test('Adigun Gen Z Genesis 1 is complete, source-aligned, and retains the owner's opening text', () => {
  assert.equal(candidate.editionId, 'adigun-genz');
  assert.equal(candidate.sourceEditionId, 'eng-web');
  assert.equal(candidate.bookId, 'GEN');
  assert.equal(candidate.chapterNumber, 1);
  const sourceChapter = source.chapters.find(chapter => chapter.number === 1);
  assert.ok(sourceChapter);
  assert.equal(candidate.verses.length, sourceChapter.verses.length);
  assert.deepEqual(candidate.verses.map(verse => verse.number), sourceChapter.verses.map(verse => verse.number));
  assert.deepEqual(candidate.verses.map(verse => verse.sourceRef), sourceChapter.verses.map(verse => `eng-web:GEN:1:${verse.number}`));
  assert.ok(candidate.verses.every(verse => typeof verse.text === 'string' && verse.text.trim().length > 0));
  assert.deepEqual(candidate.verses.slice(0, 3).map(verse => verse.text), [
    'Lowkey, before anything even existed, God started the whole thing from scratch—the skies, the earth, literally everything.',
    "Back then, the earth was just empty vibes—no shape, straight pitch-black darkness covering the deep water, and God's Spirit was just hovering over the waves.",
    'Then God said, "Bet, let there be light," and instantly, light pulled up.',
  ]);
});

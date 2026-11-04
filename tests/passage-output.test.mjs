import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertCompletePassage, printPassage } from '../src/print.ts';

const matthew = JSON.parse(readFileSync(new URL('../data/editions/eng-bsb/books/MAT.json', import.meta.url), 'utf8'));
const chapter = matthew.chapters.find(value => value.number === 17);
const passage = (first, last) => chapter.verses.filter(verse => verse.number >= first && verse.number <= last);

test('passage output accepts exact contiguous source units without changing their text', () => {
  const verses = passage(22, 23);
  const original = structuredClone(verses);
  assert.doesNotThrow(() => assertCompletePassage(verses, { verse: 22, endVerse: 23 }));
  assert.doesNotThrow(() => assertCompletePassage(passage(22, 22), { verse: 22 }));
  assert.deepEqual(verses, original);
});

test('BSB omitted positions cannot silently disappear from projected or printed ranges', async () => {
  for (const [first, last] of [[20, 22], [21, 22], [20, 21], [21, 21]]) {
    const range = { verse: first, endVerse: last };
    const verses = passage(first, last);
    assert.throws(() => assertCompletePassage(verses, range), /missing source wording/);
    // Validation must precede permission requests or opening any browser window.
    await assert.rejects(printPassage({ id: 'eng-bsb' }, verses, 'Test selection', range), /missing source wording/);
  }
});

test('passage output rejects duplicate, reordered, blank and invalid source selections', () => {
  const verses = passage(22, 23);
  for (const invalid of [[verses[0], verses[0]], [...verses].reverse(), [{ ...verses[0], text: ' ' }, verses[1]]]) {
    assert.throws(() => assertCompletePassage(invalid, { verse: 22, endVerse: 23 }), /missing source wording/);
  }
  for (const range of [{ verse: 0 }, { verse: NaN }, { verse: 1.5 }, { verse: 23, endVerse: 22 }, { verse: 22, endVerse: Infinity }]) {
    assert.throws(() => assertCompletePassage(verses, range), /valid passage range/);
  }
});

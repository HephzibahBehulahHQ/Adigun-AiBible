import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sourceSelectionFromHash, withSourceSelection } from '../src/greek-language/selection.ts';
const manifest = JSON.parse(await readFile(new URL('../data/original-language/morphgnt-sblgnt/manifest.json', import.meta.url), 'utf8'));

test('independent Greek query keys preserve the full Bible path, range, edition and unrelated encoded bytes', () => {
  const hash = '#/greek-study/JHN/3?verse=16&end=18&edition=yor&extra=a%20b&oshbBook=Ruth';
  assert.deepEqual(sourceSelectionFromHash(hash, manifest), { book: 'Mt', chapter: '1', verse: '1' });
  const next = { book: 'Jn', chapter: '8', verse: '12' }, updated = withSourceSelection(hash, next);
  assert.equal(updated, hash + '&greekBook=Jn&greekChapter=8&greekVerse=12');
  assert.deepEqual(sourceSelectionFromHash(updated, manifest), next);
  assert.equal(withSourceSelection(updated, { book: '3Jn', chapter: '1', verse: '15' }), hash + '&greekBook=3Jn&greekChapter=1&greekVerse=15');
  assert.equal(withSourceSelection(hash + '&greek%42ook=Mt&greekChapter=1&greekVerse=1', next), updated);
});

test('unknown, duplicate, translated-style and absent source coordinates fail instead of mapping or renumbering', () => {
  for (const query of ['greekBook=JHN','greekBook=MT','greekBook=Mt&greekChapter=0','greekBook=Jn&greekChapter=8&greekVerse=1','greekBook=Jn&greekChapter=7&greekVerse=53','greekBook=3Jn&greekVerse=16','greekVerse=','greekBook=Mt&greekBook=Jn','greekChapter=01']) {
    assert.throws(() => sourceSelectionFromHash(`#/greek-study/JHN/3?verse=16&${query}`, manifest), /source|Greek/);
  }
  assert.deepEqual(sourceSelectionFromHash('#/greek-study/JHN/3?verse=1&end=11&edition=eng-web&greekBook=Jn&greekChapter=8', manifest), { book: 'Jn', chapter: '8', verse: '12' });
});

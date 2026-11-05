import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sourceSelectionFromHash, withSourceSelection } from '../src/original-language/selection.ts';
const manifest = JSON.parse(await readFile(new URL('../data/original-language/oshb/manifest.json', import.meta.url), 'utf8'));

test('source selection uses only its own keys and preserves every Bible path/query/range byte', () => {
  const hash = '#/hebrew-study/JHN/3?verse=16&end=18&edition=eng-bsb&extra=a%20b';
  assert.deepEqual(sourceSelectionFromHash(hash, manifest), { book: 'Gen', chapter: '1', verse: '1' });
  const next = { book: 'Ruth', chapter: '3', verse: '12' }, updated = withSourceSelection(hash, next);
  assert.equal(updated, hash + '&oshbBook=Ruth&oshbChapter=3&oshbVerse=12');
  assert.deepEqual(sourceSelectionFromHash(updated, manifest), next);
  const twice = withSourceSelection(updated, { book: 'Joel', chapter: '4', verse: '1' });
  assert.equal(twice, hash + '&oshbBook=Joel&oshbChapter=4&oshbVerse=1');
  assert.equal(sourceSelectionFromHash(twice, manifest).chapter, '4');
});

test('invalid, duplicate or translation-shaped source coordinates fail instead of mapping to another source verse', () => {
  for (const query of ['oshbBook=GEN','oshbBook=JHN','oshbBook=Gen&oshbChapter=0','oshbBook=Mal&oshbChapter=4','oshbBook=Ruth&oshbChapter=3&oshbVerse=99','oshbVerse=','oshbBook=Gen&oshbBook=Ruth','oshbChapter=01']) {
    assert.throws(() => sourceSelectionFromHash(`#/hebrew-study/JHN/3?verse=16&${query}`, manifest), /source|Hebrew/);
  }
  assert.deepEqual(sourceSelectionFromHash('#/hebrew-study/JHN/3?edition=eng-bsb&oshbBook=Joel&oshbChapter=4', manifest), { book: 'Joel', chapter: '4', verse: '1' });
});

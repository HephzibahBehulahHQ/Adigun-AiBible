import test from 'node:test';
import assert from 'node:assert/strict';
import { searchQuran } from '../src/quran-search.ts';

const source = { surahs: [
  { number: 1, verses: [
    { number: 1, text: 'In the name of Allah, the Gracious, the Merciful.' },
    { number: 2, text: 'Praise be to Allah, Lord of the Worlds.' },
    { number: 3, text: 'Mercy and peace are gifts.' },
  ] },
  { number: 2, verses: [
    { number: 1, text: 'Abraham said: Allah is merciful.' },
    { number: 2, text: 'Peace is a blessing.' },
  ] },
] };
const search = (query, options = {}) => searchQuran(source, query, { mode: 'phrase', surah: '', exclude: '', ...options });

test('Quran phrase, all-word and any-word searches preserve source wording', () => {
  assert.equal(search('gracious').results[0].text, source.surahs[0].verses[0].text);
  assert.equal(search('Allah merciful', { mode: 'all' }).total, 2);
  assert.equal(search('Allah merciful', { mode: 'any' }).total, 3);
});
test('Quran Boolean search supports grouping, precedence and NOT', () => {
  assert.equal(search('(Allah AND merciful) OR "Mercy and peace"', { mode: 'boolean' }).total, 3);
  assert.equal(search('Allah AND NOT merciful', { mode: 'boolean' }).total, 1);
});
test('surah scope and excluded words narrow only the Quran source records', () => {
  assert.equal(search('peace', { surah: 2 }).total, 1);
  assert.equal(search('Allah', { exclude: 'worlds' }).total, 2);
  assert.equal(search('Allah', { surah: 1, exclude: 'gracious' }).total, 1);
});
test('malformed queries and unknown surahs fail recoverably', () => {
  assert.throws(() => search('Allah OR', { mode: 'boolean' }));
  assert.throws(() => search('Allah', { surah: 999 }));
  assert.throws(() => search(''));
});
test('result count is exact while the visible result list is capped at 100', () => {
  const many = { surahs: [{ number: 1, verses: Array.from({ length: 125 }, (_, i) => ({ number: i + 1, text: 'peace' })) }] };
  const found = searchQuran(many, 'peace', { mode: 'phrase', surah: '', exclude: '' });
  assert.equal(found.total, 125);
  assert.equal(found.results.length, 100);
});

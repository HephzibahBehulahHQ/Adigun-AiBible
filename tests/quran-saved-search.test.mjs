import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SAVED_QURAN_SEARCHES, removeQuranSearch, saveQuranSearch, validateSavedQuranSearches,
} from '../src/quran-saved-search.ts';

const now = '2026-11-04T20:00:00.000Z';
const item = (id, name = id) => ({
  id, name, query: 'mercy AND peace', editionId: 'eng-clearquran',
  options: { mode: 'boolean', surah: 2, exclude: 'war' }, createdAt: now, updatedAt: now,
});

test('saved Quran searches preserve exact query, ClearQuran edition and filters', () => {
  const saved = saveQuranSearch([], item('one', 'Mercy study'));
  assert.equal(saved[0].query, 'mercy AND peace');
  assert.equal(saved[0].editionId, 'eng-clearquran');
  assert.deepEqual(saved[0].options, { mode: 'boolean', surah: 2, exclude: 'war' });
  assert.deepEqual(validateSavedQuranSearches(saved), saved);
});

test('updates one profile and rejects duplicate names and unsupported editions', () => {
  let saved = saveQuranSearch([], item('one', 'Mercy study'));
  saved = saveQuranSearch(saved, { ...item('one', 'Renamed'), query: 'justice' });
  assert.equal(saved.length, 1);
  assert.equal(saved[0].query, 'justice');
  assert.throws(() => saveQuranSearch(saved, item('two', 'renamed')), /different/);
  assert.throws(() => validateSavedQuranSearches([{ ...item('bad'), editionId: 'eng-web' }]), /edition/);
});

test('surah scope and all search modes are validated', () => {
  for (const mode of ['phrase', 'all', 'any', 'boolean']) {
    assert.equal(validateSavedQuranSearches([{ ...item(mode), options: { ...item(mode).options, mode } }])[0].options.mode, mode);
  }
  assert.throws(() => validateSavedQuranSearches([{ ...item('bad'), options: { ...item('bad').options, mode: 'regex' } }]), /filters/);
  assert.throws(() => validateSavedQuranSearches([{ ...item('bad'), options: { ...item('bad').options, surah: 115 } }]), /filters/);
});

test('saved profiles have a finite limit and remove only the selected identity', () => {
  let saved = [];
  for (let index = 0; index < MAX_SAVED_QURAN_SEARCHES; index++) saved = saveQuranSearch(saved, item(String(index), `Search ${index}`));
  assert.equal(saved.length, MAX_SAVED_QURAN_SEARCHES);
  assert.throws(() => saveQuranSearch(saved, item('overflow')), /up to 20/);
  assert.deepEqual(removeQuranSearch(saved, '0').map(entry => entry.id).includes('0'), false);
  assert.throws(() => removeQuranSearch(saved, 'missing'), /no longer exists/);
});

test('malformed records, duplicate identities and dates are rejected without mutation', () => {
  const saved = saveQuranSearch([], item('one'));
  assert.throws(() => validateSavedQuranSearches([saved[0], saved[0]]), /duplicate IDs/);
  assert.throws(() => validateSavedQuranSearches([{ ...item('bad'), createdAt: 'yesterday' }]), /date/);
  assert.equal(saved.length, 1);
});

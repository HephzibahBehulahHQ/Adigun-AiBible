import test from 'node:test';
import assert from 'node:assert/strict';
import { filterCommands, firstEnabledCommand, normalizeCommandQuery } from '../src/commands/model.ts';

const command = (id, label, extra = {}) => ({ id, label, run() { throw new Error('Search must not execute an action.'); }, ...extra });
const ids = entries => entries.map(entry => entry.id);

test('command filtering tolerates case, Yoruba diacritics, Unicode composition and extra spaces without changing labels', () => {
  const source = command('yoruba', 'Yorùbá reading', { keywords: 'Èdè Yorùbá' });
  assert.equal(normalizeCommandQuery('  ÈDÈ   YORÙBÁ  '), 'ede yoruba');
  assert.equal(normalizeCommandQuery('E\u0300de\u0300'), 'ede');
  assert.deepEqual(filterCommands([source], 'YORUBA EDE'), [source]);
  assert.equal(source.label, 'Yorùbá reading');
});

test('exact labels outrank prefixes, label matches and metadata matches with stable ties', () => {
  const entries = [
    command('keyword', 'Private workspace', { keywords: 'reader' }),
    command('contains', 'Open reader'),
    command('prefix-a', 'Reader appearance'),
    command('exact', 'Reader'),
    command('prefix-b', 'Reader settings'),
  ];
  assert.deepEqual(ids(filterCommands(entries, 'reader')), ['exact', 'prefix-a', 'prefix-b', 'contains', 'keyword']);
  assert.deepEqual(ids(entries), ['keyword', 'contains', 'prefix-a', 'exact', 'prefix-b']);
});

test('every search term must match but terms may come from different descriptive fields', () => {
  const entries = [
    command('notes', 'Open notes', { description: 'Your private writing', keywords: 'journal study' }),
    command('search', 'Search Scripture', { description: 'Find exact source passages' }),
  ];
  assert.deepEqual(ids(filterCommands(entries, 'study private notes')), ['notes']);
  assert.deepEqual(filterCommands(entries, 'private passages'), []);
  assert.deepEqual(filterCommands(entries, 'no matching action'), []);
});

test('empty queries preserve command order in a new array and never evaluate callbacks', () => {
  const entries = [command('b', 'Bookmarks'), command('r', 'Reader')];
  const result = filterCommands(entries, ' \t\n ');
  assert.deepEqual(result, entries);
  assert.notEqual(result, entries);
  assert.equal(result[0], entries[0]);
});

test('disabled matching commands remain discoverable but are never the default selection', () => {
  const unavailable = command('disabled', 'Reader', { disabled: true });
  const available = command('available', 'Reader settings');
  const matches = filterCommands([unavailable, available], 'reader');
  assert.deepEqual(matches, [unavailable, available]);
  assert.equal(firstEnabledCommand(matches), available);
  assert.equal(firstEnabledCommand([unavailable]), undefined);
  assert.equal(firstEnabledCommand([]), undefined);
});

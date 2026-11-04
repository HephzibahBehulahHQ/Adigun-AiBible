import test from 'node:test';
import assert from 'node:assert/strict';
import { workspaceCommands } from '../src/commands/model.ts';

const books = [{ id: 'JHN', name: 'John', chapters: 3, verseCounts: [51, 25, 36] }];
test('a direct range opens in the selected edition with exact boundaries', () => {
  const [command] = workspaceCommands('John 3:16–18', books, 'eng-bsb', false);
  assert.equal(command.id, 'open-reference');
  assert.deepEqual(command.reference, { bookId: 'JHN', chapter: 3, verse: 16, endVerse: 18, editionId: 'eng-bsb' });
  assert.equal(command.view, 'read');
});
test('invalid references never manufacture an available passage', () => {
  for (const query of ['John 3:99', 'John 4:1', 'John 3:18-16', 'Missing 1:1']) {
    const result = workspaceCommands(query, books, 'eng-web', false);
    assert.ok(result.every(command => !command.reference));
    assert.equal(result.at(-1).action, 'search');
  }
});
test('command search matches every word and ignores accents without changing the query', () => {
  const result = workspaceCommands('prívate note', books, 'eng-web', false);
  assert.ok(result.some(command => command.id === 'notes'));
  assert.ok(result.some(command => command.id === 'saved'));
  assert.equal(result.at(-1).query, 'prívate note');
});
test('an unavailable edition exposes navigation without source actions or invented search access', () => {
  const result = workspaceCommands('', [], '', false, false);
  assert.ok(result.length > 0);
  assert.ok(result.every(command => command.view && !command.action && !command.reference));
  assert.equal(workspaceCommands('John 3:16', [], '', false, false).length, 0);
});
test('reading focus reflects its current state and commands have stable unique identities', () => {
  assert.equal(workspaceCommands('', books, 'eng-web', true).find(command => command.id === 'focus').label, 'Leave Reading Focus');
  const all = workspaceCommands('', books, 'eng-web', false);
  assert.equal(new Set(all.map(command => command.id)).size, all.length);
  assert.ok(all.every(command => command.view || command.action));
});

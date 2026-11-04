import test from 'node:test';
import assert from 'node:assert/strict';
import { appendRetellingPrompts, retellingPrompts } from '../src/workspace/retelling.ts';

test('optional retelling prompts provide open reflection without scoring', () => {
  const scaffold = appendRetellingPrompts('');
  for (const prompt of retellingPrompts) assert.ok(scaffold.includes(prompt));
  assert.equal(scaffold.endsWith('\n'), true);
});

test('adding prompts preserves an existing draft exactly', () => {
  const draft = 'My own summary, in my own words.';
  const result = appendRetellingPrompts(draft);
  assert.ok(result.startsWith(draft + '\n\n'));
  assert.equal(result.split(draft).length - 1, 1);
});

test('repeated insertion does not overwrite prior notes', () => {
  const once = appendRetellingPrompts('Draft');
  const twice = appendRetellingPrompts(once);
  assert.equal(twice, once);
});

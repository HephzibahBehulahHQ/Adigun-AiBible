import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRetellingTranscript, beginRetellingTranscript, retellingTranscriptChanged, retellingTranscriptTarget } from '../src/workspace/retelling-transcript.ts';
import { audioFixture } from './retelling-media-fixtures.mjs';

async function entries() {
  return Promise.all(['first-original','second-original','third-original'].map(async id => (await audioFixture(id)).state.cards[0].retellings[0]));
}

test('transcript edits follow the exact original through deletion and reordering of other entries', async () => {
  const [first,second,third] = await entries();
  const started = beginRetellingTranscript(second);
  assert.equal(retellingTranscriptChanged(started),false);
  const draft = { ...started,text:'  My unsaved second transcript: àánú.\nKeep this writing exactly.  ' };
  assert.equal(retellingTranscriptChanged(draft),true);
  for (const history of [[second,third],[third,first,second]]) {
    const before = structuredClone(history);
    const result = applyRetellingTranscript(history,draft);
    assert.equal(result.find(item => item.id === second.id).text,draft.text);
    for (const item of result.filter(item => item.id !== second.id)) assert.deepEqual(item,history.find(original => original.id === item.id));
    assert.deepEqual(result.find(item => item.id === second.id).recording,second.recording);
    assert.deepEqual(history,before);
  }
});

test('a removed or replaced original cannot receive or redirect the stale transcript', async () => {
  const [first,second] = await entries();
  const draft = { ...beginRetellingTranscript(first),text:'Unsaved writing for the removed original.' };
  const replacements = [
    [second],
    [{ ...first,recording:{ ...first.recording,sha256:'b'.repeat(64) } },second],
    [{ ...first,recording:{ ...first.recording,source:{ ...first.recording.source,editionSha256:'c'.repeat(64) } } },second],
    [{ id:first.id,at:first.at,text:first.text },second],
  ];
  for (const history of replacements) {
    const before = structuredClone(history);
    assert.equal(retellingTranscriptTarget(history,draft),undefined);
    assert.throws(() => applyRetellingTranscript(history,draft),/removed or replaced/);
    assert.equal(draft.text,'Unsaved writing for the removed original.');
    assert.deepEqual(history,before);
  }
});

test('transcript targeting rejects legacy text-only entries and preserves an intentional empty manual transcript', async () => {
  const [first] = await entries();
  assert.throws(() => beginRetellingTranscript({ at:first.at,text:'Legacy written retelling' }),/saved original/);
  const draft = beginRetellingTranscript(first);
  assert.equal(applyRetellingTranscript([first],{ ...draft,text:'' })[0].text,'');
  assert.throws(() => applyRetellingTranscript([first],{ ...draft,text:'x'.repeat(5001) }),/5,000/);
  first.recording.source.editionSha256 = 'd'.repeat(64);
  assert.notEqual(draft.recording.source.editionSha256,first.recording.source.editionSha256);
});

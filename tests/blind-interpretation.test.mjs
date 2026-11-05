import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { blindChallenge as challenge } from '../src/interpretation/challenges.ts';
import { assertPreservedReflection, challengePassage, emptyInterpretationNotebook, MAX_HISTORY, MAX_NOTEBOOK_BYTES, newBlindReflection, parseInterpretationBackup, reflectionExport, revealReflection, reviseReflection, shuffledSourceOrder, validateChallenge, validateInterpretationNotebook, validateReflectionSource } from '../src/interpretation/model.ts';

const read = path => readFile(new URL(path, import.meta.url), 'utf8').then(JSON.parse);
const manifest = await read('../data/manifest.json');
const matthew = await read('../data/books/MAT.json');
const order = challenge.sources.map(source => source.id);
const at = second => `2026-11-05T10:00:${String(second).padStart(2, '0')}.000Z`;
const fresh = () => newBlindReflection(challenge, manifest.edition, order, at(0));
const notebook = reflection => ({ ...emptyInterpretationNotebook(), reflections: [reflection] });
const writing = () => reviseReflection(undefined, { ...fresh(), before: 'The surrounding examples matter. More evidence may change my view.', initialPreference: order[0] }, at(1));
const reveal = () => { const before = writing(); return reviseReflection(before, revealReflection(before, at(2)), at(2)); };

test('installed research quotes have reproducible excerpt hashes and the supporting verses exist', async () => {
  assert.equal(validateChallenge(challenge).humanReviewStatus, 'pending');
  for (const source of challenge.sources) {
    assert.equal(createHash('sha256').update(source.quote).digest('hex'), source.sourceSha256);
    assert.ok(source.quote.split(/\s+/).length <= 25);
    assert.equal(new URL(source.url).hostname, 'www.ccel.org');
    for (const support of source.supporting) {
      const book = await read(`../data/books/${support.reference.bookId}.json`);
      const chapter = book.chapters.find(item => item.number === support.reference.chapter);
      for (let verse = support.reference.verse; verse <= (support.reference.endVerse ?? support.reference.verse); verse++) assert.ok(chapter.verses.some(item => item.number === verse), support.label);
    }
  }
});
test('passage and context retain every exact source character and report numbering gaps', () => {
  const source = matthew.chapters.find(item => item.number === 5);
  const result = challengePassage(matthew, manifest.edition, challenge);
  assert.deepEqual(result.verses, source.verses.filter(item => item.number >= 17 && item.number <= 20));
  assert.deepEqual(result.context, source.verses.filter(item => item.number >= 13 && item.number <= 26));
  assert.deepEqual(result.missing, []);
  const incomplete = structuredClone(matthew); incomplete.chapters.find(item => item.number === 5).verses = source.verses.filter(item => item.number !== 19);
  assert.deepEqual(challengePassage(incomplete, manifest.edition, challenge).missing, [19]);
  assert.throws(() => challengePassage({ ...matthew, id: 'JHN' }, manifest.edition, challenge), /does not match/);
  assert.throws(() => challengePassage(matthew, { ...manifest.edition, sha256: undefined }, challenge), /exact verified/);
});
test('invalid research content cannot masquerade as reviewed or as a valid source reference', () => {
  for (const change of [null, { ...challenge, humanReviewStatus: 'approved' }, { ...challenge, contextStart: -1 }, { ...challenge, contextEnd: Infinity }, { ...challenge, passage: { ...challenge.passage, endVerse: 18.5 } }, { ...challenge, sources: [challenge.sources[0], challenge.sources[0]] }]) assert.throws(() => validateChallenge(change), /invalid|identity/);
  assert.throws(() => validateChallenge({ ...challenge, sources: [{ ...challenge.sources[0], url: 'javascript:alert(1)' }, challenge.sources[1]] }), /identity/);
});
test('source order is a complete persisted permutation and exact edition revisions are required', () => {
  for (let i = 0; i < 12; i++) assert.deepEqual(shuffledSourceOrder(challenge).sort(), [...order].sort());
  const reflection = fresh();
  assert.deepEqual(reflection.order, order);
  validateReflectionSource(reflection, challenge, manifest.edition);
  assert.throws(() => newBlindReflection(challenge, manifest.edition, [order[0], order[0]]), /complete source order/);
  assert.throws(() => validateReflectionSource(reflection, challenge, { ...manifest.edition, id: 'eng-bsb' }), /different challenge or source/);
  assert.throws(() => validateReflectionSource(reflection, { ...challenge, version: 'another-version' }, manifest.edition), /different challenge or source/);
  assert.throws(() => validateReflectionSource(reflection, challenge, { ...manifest.edition, sha256: '0'.repeat(64) }), /different challenge or source/);
});
test('reveal requires saved-quality reasoning and later revisions preserve the original response', () => {
  assert.throws(() => revealReflection(fresh(), at(2)), /Record your reasoning/);
  const before = writing(), shown = reviseReflection(before, revealReflection(before, at(2)), at(2));
  const later = reviseReflection(shown, { ...shown, after: 'Author identity made me reconsider my assumptions.', finalPreference: order[1] }, at(3));
  assert.equal(later.before, before.before); assert.equal(later.initialPreference, before.initialPreference);
  assert.equal(later.revealedAt, at(2)); assert.equal(later.history.length, 2);
  assert.equal(later.history[0].revealedAt, null); assert.equal(later.history[1].revealedAt, at(2));
  assert.throws(() => reviseReflection(later, { ...later, before: 'Rewritten after seeing the author' }, at(4)), /before source reveal is preserved/);
  assert.throws(() => reviseReflection(later, { ...later, revealedAt: null, after: '', finalPreference: 'undecided' }, at(4)), /cannot rewind/);
  assert.throws(() => reviseReflection(later, { ...later, createdAt: at(1) }, at(4)), /identity cannot change/);
  assert.equal(shown.after, '', 'later changes do not mutate the previous snapshot');
});
test('backup validation rejects forged approvals, invalid choices, rewritten reveal history and oversized files', () => {
  const original = reveal();
  for (const bad of [
    { ...notebook(original), approved: true },
    notebook({ ...original, initialPreference: 'unknown-source' }),
    notebook({ ...original, createdAt: '2026-02-30T00:00:00.000Z' }),
    notebook({ ...original, revealedAt: at(59) }),
    notebook({ ...original, order: [order[0], order[0]] }),
    notebook({ ...original, history: [{ at: at(2), before: 'Changed history', after: '', initialPreference: order[0], finalPreference: 'undecided', revealedAt: at(2) }] }),
    { ...emptyInterpretationNotebook(), reflections: [original, original] },
  ]) assert.throws(() => validateInterpretationNotebook(bad), /invalid|rewritten/);
  assert.throws(() => parseInterpretationBackup('{oops'), /not valid JSON/);
  assert.throws(() => parseInterpretationBackup(' '.repeat(MAX_NOTEBOOK_BYTES + 1)), /smaller than 4 MB/);
  const parsed = parseInterpretationBackup(JSON.stringify(notebook(original)));
  parsed.reflections[0].after = 'Own copy'; assert.equal(original.after, '');
});
test('unrevealed text exports keep attribution hidden, while revealed exports include sources and original writing', () => {
  const before = writing(), text = reflectionExport(before, challenge);
  assert.ok(text.includes(before.before));
  for (const source of challenge.sources) { assert.ok(!text.includes(source.author)); assert.ok(!text.includes(source.quote)); assert.ok(!text.includes(source.url)); }
  const shown = reveal(), after = reflectionExport(shown, challenge);
  for (const source of challenge.sources) { assert.ok(after.includes(source.author)); assert.ok(after.includes(source.url)); }
  assert.ok(after.includes('human review pending')); assert.ok(after.includes(before.before));
  const obsolete = reflectionExport(shown, { ...challenge, version: 'different-version' });
  assert.ok(obsolete.includes('original research preview is not installed')); assert.ok(!obsolete.includes(challenge.sources[0].author));
});
test('revision capacity preserves prior history instead of silently pruning it', () => {
  let current = writing();
  for (let n = 1; n <= MAX_HISTORY; n++) current = reviseReflection(current, { ...current, before: `Revision ${n}` }, at(n + 1));
  assert.equal(current.history.length, MAX_HISTORY);
  assert.throws(() => reviseReflection(current, { ...current, before: 'One more' }, at(40)), /revision limit/);
  assertPreservedReflection(current, { ...current, before: 'Allowed before reveal' });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { detectiveMission } from '../src/workspace/detective-mission.ts';
import { applyMissionAction, createMission, missionDefinitionHash, validateMissionAction, validateMissionState, verifyMissionTransition } from '../src/nearby/mission-model.ts';

const source = { editionId: 'eng-web', editionSha256: 'a'.repeat(64), passageSha256: 'b'.repeat(64) };
const now = new Date('2026-11-05T12:00:00.000Z');
const initial = async () => createMission(source, await missionDefinitionHash(), now);
const apply = (state, action, actor = 'host', id = crypto.randomUUID()) => applyMissionAction(state, action, actor, id, now.toISOString());

test('both participants complete the actual source-linked mission through ordered turns without a score', async () => {
  let state = await initial();
  for (const [index, clue] of detectiveMission.clues.entries()) {
    const actor = state.turn;
    const request = crypto.randomUUID(), action = { type: 'answer', clueId: clue.id, answerId: clue.answerId };
    const next = apply(state, action, actor, request);
    assert.deepEqual(verifyMissionTransition(state, next, action, actor, request), next);
    assert.equal(next.lastAnswer.correct, true);
    state = next;
    if (index < 4) state = apply(state, { type: 'advance' });
  }
  assert.equal(state.phase, 'complete');
  assert.equal(state.solved.length, 5);
  assert.deepEqual(state.source, source);
  assert.equal('score' in state, false);
  assert.throws(() => apply(state, { type: 'pause' }), /complete/);
});

test('a wrong answer retains the clue, and future-clue or out-of-turn actions cannot advance', async () => {
  const state = await initial(), clue = detectiveMission.clues[0];
  const wrong = apply(state, { type: 'answer', clueId: clue.id, answerId: clue.options[1].id });
  assert.equal(wrong.lastAnswer.correct, false);
  assert.equal(wrong.solved.length, 0);
  assert.throws(() => apply(wrong, { type: 'advance' }), /Solve/);
  assert.throws(() => apply(wrong, { type: 'answer', clueId: detectiveMission.clues[1].id, answerId: detectiveMission.clues[1].answerId }), /another clue/);
  assert.throws(() => apply(wrong, { type: 'answer', clueId: clue.id, answerId: clue.answerId }, 'guest'), /other participant/);
});

test('host controls are enforced by the reducer and revealing a facilitator answer never marks a clue solved', async () => {
  const state = await initial(), clueId = detectiveMission.clues[0].id;
  for (const action of [{ type: 'turn', role: 'guest' }, { type: 'pause' }, { type: 'resume' }, { type: 'advance' }, { type: 'reveal', clueId }]) assert.throws(() => apply(state, action, 'guest'), /Only the host/);
  const revealed = apply(state, { type: 'reveal', clueId });
  assert.equal(revealed.solved.length, 0);
  const paused = apply(revealed, { type: 'pause' });
  assert.throws(() => apply(paused, { type: 'evidence', clueId, text: 'Do not send while paused.' }), /paused/);
  assert.equal(apply(paused, { type: 'resume' }).phase, 'active');
});

test('evidence is explicit bounded user writing; removal enforces authorship or host authority', async () => {
  const start = await initial(), clueId = detectiveMission.clues[0].id, id = crypto.randomUUID();
  const written = apply(start, { type: 'evidence', clueId, text: 'I read the opening question in Luke 10:25.' }, 'host', id);
  assert.equal(written.evidence[0].author, 'host');
  assert.throws(() => apply(written, { type: 'remove-evidence', noteId: id }, 'guest'), /author or the host/);
  assert.equal(apply(written, { type: 'remove-evidence', noteId: id }).evidence.length, 0);
  assert.throws(() => validateMissionAction({ type: 'evidence', clueId, text: 'x'.repeat(301) }), /300/);
  assert.throws(() => validateMissionAction({ type: 'evidence', clueId, text: 'Writing', privateNotes: ['Never share'] }), /invalid/);
});

test('replayed requests and forged state changes cannot change source identity or solved progress', async () => {
  const state = await initial(), id = crypto.randomUUID(), action = { type: 'hint', clueId: detectiveMission.clues[0].id };
  const next = apply(state, action, 'host', id);
  assert.throws(() => apply(next, action, 'host', id), /already applied/);
  const forged = structuredClone(next); forged.source.passageSha256 = 'c'.repeat(64);
  assert.throws(() => verifyMissionTransition(state, forged, action, 'host', id), /permitted transition/);
  const skipped = structuredClone(next); skipped.solved = [detectiveMission.clues[1].id];
  assert.throws(() => validateMissionState(skipped), /inconsistent/);
  assert.throws(() => validateMissionState({ ...next, privateRecordings: [] }), /invalid/);
});

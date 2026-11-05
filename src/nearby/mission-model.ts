import { stableStringify, hashContent } from '../editorial.ts';
import { detectiveMission } from '../workspace/detective-mission.ts';

export type MissionRole = 'host' | 'guest';
export const MISSION_ID = detectiveMission.id;
export const MAX_MISSION_BYTES = 10_000;
export const MAX_EVIDENCE_NOTES = 6;
export const MAX_EVIDENCE_LENGTH = 300;
const clueIds: readonly string[] = detectiveMission.clues.map(clue => clue.id);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function fail(message = 'The shared mission record is invalid.'): never { throw new Error(message); }
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!object(value) || Object.keys(value).length !== keys.length || keys.some(key => !(key in value))) fail();
  return value;
}
export function missionUuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(value)) fail('Mission identity is invalid.');
  return value;
}
function hash(value: unknown): string { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail('Mission source hash is invalid.'); return value; }
function integer(value: unknown, max = 10_000): number { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max) fail(); return value; }
function role(value: unknown): MissionRole { if (value !== 'host' && value !== 'guest') fail('Mission participant role is invalid.'); return value; }
function date(value: unknown): string { if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail(); return value; }
function clue(value: unknown): string { if (typeof value !== 'string' || !clueIds.includes(value)) fail('This mission clue does not exist.'); return value; }
function ids(value: unknown, limit: number, validator: (v: unknown) => string): string[] {
  if (!Array.isArray(value) || value.length > limit) fail();
  const result = value.map(validator); if (new Set(result).size !== result.length) fail('Duplicate mission identifiers are invalid.'); return result;
}
export interface MissionSourceIdentity { editionId: string; editionSha256: string; passageSha256: string }
export function validateMissionSource(value: unknown): MissionSourceIdentity {
  const row = exact(value, ['editionId', 'editionSha256', 'passageSha256']);
  if (typeof row.editionId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(row.editionId)) fail('Mission source edition is invalid.');
  return { editionId: row.editionId, editionSha256: hash(row.editionSha256), passageSha256: hash(row.passageSha256) };
}
export interface MissionEvidence { id: string; author: MissionRole; clueId: string; text: string }
export interface MissionAnswer { requestId: string; author: MissionRole; clueId: string; answerId: string; correct: boolean }
export interface MissionState {
  schemaVersion: 1; id: string; missionId: typeof MISSION_ID; definitionHash: string; source: MissionSourceIdentity;
  revision: number; createdAt: string; updatedAt: string; phase: 'active' | 'paused' | 'complete'; turn: MissionRole;
  clueIndex: number; solved: string[]; hints: string[]; revealed: string[]; evidence: MissionEvidence[];
  applied: string[]; lastAnswer: MissionAnswer | null;
}
function writing(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > MAX_EVIDENCE_LENGTH || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) fail('Write 1–300 plain-text characters for the shared evidence board.');
  return value;
}
export function validateMissionState(value: unknown): MissionState {
  const row = exact(value, ['schemaVersion', 'id', 'missionId', 'definitionHash', 'source', 'revision', 'createdAt', 'updatedAt', 'phase', 'turn', 'clueIndex', 'solved', 'hints', 'revealed', 'evidence', 'applied', 'lastAnswer']);
  if (row.schemaVersion !== 1 || row.missionId !== MISSION_ID || !['active', 'paused', 'complete'].includes(String(row.phase))) fail('This mission or its format is unsupported.');
  const solved = ids(row.solved, 5, clue), hints = ids(row.hints, 5, clue), revealed = ids(row.revealed, 5, clue);
  const clueIndex = integer(row.clueIndex, 4), revision = integer(row.revision), applied = ids(row.applied, 64, missionUuid);
  if (solved.some((id, index) => id !== clueIds[index]) || clueIndex > solved.length || solved.length > clueIndex + 1 || (row.phase === 'complete') !== (solved.length === 5)) fail('Mission progress is inconsistent.');
  if (hints.some(id => clueIds.indexOf(id) > clueIndex) || revealed.some(id => clueIds.indexOf(id) > clueIndex)) fail('A future clue was revealed.');
  if (applied.length !== Math.min(revision, 64)) fail('Mission revision history is inconsistent.');
  if (!Array.isArray(row.evidence) || row.evidence.length > MAX_EVIDENCE_NOTES) fail('The evidence board holds up to six notes.');
  const evidence = row.evidence.map(value => {
    const item = exact(value, ['id', 'author', 'clueId', 'text']);
    return { id: missionUuid(item.id), author: role(item.author), clueId: clue(item.clueId), text: writing(item.text) };
  });
  if (new Set(evidence.map(item => item.id)).size !== evidence.length || evidence.some(item => clueIds.indexOf(item.clueId) > clueIndex)) fail('Evidence note identifiers or references are invalid.');
  let lastAnswer: MissionAnswer | null = null;
  if (row.lastAnswer !== null) {
    const item = exact(row.lastAnswer, ['requestId', 'author', 'clueId', 'answerId', 'correct']);
    const question = detectiveMission.clues.find(c => c.id === clue(item.clueId))!;
    if (typeof item.answerId !== 'string' || !question.options.some(o => o.id === item.answerId) || item.correct !== (item.answerId === question.answerId) || clueIds.indexOf(question.id) > clueIndex) fail('Mission answer evidence is invalid.');
    lastAnswer = { requestId: missionUuid(item.requestId), author: role(item.author), clueId: question.id, answerId: item.answerId, correct: item.correct };
  }
  const result: MissionState = { schemaVersion: 1, id: missionUuid(row.id), missionId: MISSION_ID, definitionHash: hash(row.definitionHash), source: validateMissionSource(row.source), revision, createdAt: date(row.createdAt), updatedAt: date(row.updatedAt), phase: row.phase as MissionState['phase'], turn: role(row.turn), clueIndex, solved, hints, revealed, evidence, applied, lastAnswer };
  if (result.updatedAt < result.createdAt || new TextEncoder().encode(JSON.stringify(result)).byteLength > MAX_MISSION_BYTES) fail('Mission data exceeds the supported size or date bounds.');
  return result;
}
export const missionDefinitionHash = () => hashContent(detectiveMission);
export const missionStateHash = (state: MissionState) => hashContent(validateMissionState(state));
export function createMission(source: MissionSourceIdentity, definitionHash: string, now = new Date(), id = crypto.randomUUID()): MissionState {
  return validateMissionState({ schemaVersion: 1, id, missionId: MISSION_ID, definitionHash, source, revision: 0, createdAt: now.toISOString(), updatedAt: now.toISOString(), phase: 'active', turn: 'host', clueIndex: 0, solved: [], hints: [], revealed: [], evidence: [], applied: [], lastAnswer: null });
}
export type MissionAction =
  | { type: 'answer'; clueId: string; answerId: string }
  | { type: 'evidence'; clueId: string; text: string }
  | { type: 'remove-evidence'; noteId: string }
  | { type: 'hint' | 'reveal'; clueId: string }
  | { type: 'turn'; role: MissionRole }
  | { type: 'pause' | 'resume' | 'advance' };
export function validateMissionAction(value: unknown): MissionAction {
  if (!object(value)) fail();
  if (value.type === 'answer') {
    const row = exact(value, ['type', 'clueId', 'answerId']), id = clue(row.clueId);
    const question = detectiveMission.clues.find(c => c.id === id)!;
    if (typeof row.answerId !== 'string' || !question.options.some(o => o.id === row.answerId)) fail('Choose an answer from this clue.');
    return { type: 'answer', clueId: id, answerId: row.answerId };
  }
  if (value.type === 'evidence') { const row = exact(value, ['type', 'clueId', 'text']); return { type: 'evidence', clueId: clue(row.clueId), text: writing(row.text) }; }
  if (value.type === 'remove-evidence') { const row = exact(value, ['type', 'noteId']); return { type: 'remove-evidence', noteId: missionUuid(row.noteId) }; }
  if (value.type === 'hint' || value.type === 'reveal') { const row = exact(value, ['type', 'clueId']); return { type: value.type, clueId: clue(row.clueId) }; }
  if (value.type === 'turn') { const row = exact(value, ['type', 'role']); return { type: 'turn', role: role(row.role) }; }
  if (value.type === 'pause' || value.type === 'resume' || value.type === 'advance') { exact(value, ['type']); return { type: value.type }; }
  return fail('Unknown mission action.');
}
export function applyMissionAction(value: MissionState, raw: MissionAction, actor: MissionRole, requestId: string, at = new Date().toISOString()): MissionState {
  const state = validateMissionState(value), action = validateMissionAction(raw); role(actor); missionUuid(requestId); date(at);
  if (state.applied.includes(requestId) || state.evidence.some(note => note.id === requestId)) fail('This mission action was already applied.');
  if (['turn', 'pause', 'resume', 'advance', 'reveal'].includes(action.type) && actor !== 'host') fail('Only the host can make that mission change.');
  if (state.phase === 'complete' && action.type !== 'remove-evidence') fail('This mission is complete. Start a separate run to replay it.');
  if (state.phase === 'paused' && !['resume', 'turn', 'remove-evidence'].includes(action.type)) fail('The host has paused this mission.');
  const current = detectiveMission.clues[state.clueIndex];
  if ('clueId' in action && action.clueId !== current.id) fail('This action belongs to another clue.');
  if ((action.type === 'answer' || action.type === 'hint') && actor !== state.turn) fail('It is the other participant’s turn.');
  const next = structuredClone(state);
  if (action.type === 'answer') {
    if (state.solved.includes(current.id)) fail('This clue is already solved. The host can open the next clue.');
    const correct = action.answerId === current.answerId;
    next.lastAnswer = { requestId, author: actor, clueId: current.id, answerId: action.answerId, correct };
    if (correct) { next.solved.push(current.id); if (next.solved.length === 5) next.phase = 'complete'; }
  } else if (action.type === 'evidence') {
    if (state.evidence.length >= MAX_EVIDENCE_NOTES) fail('The evidence board holds six notes. Remove one before adding another.');
    next.evidence.push({ id: requestId, author: actor, clueId: current.id, text: action.text });
  } else if (action.type === 'remove-evidence') {
    const note = state.evidence.find(item => item.id === action.noteId);
    if (!note || (note.author !== actor && actor !== 'host')) fail('Only its author or the host can remove that shared note.');
    next.evidence = next.evidence.filter(item => item.id !== action.noteId);
  } else if (action.type === 'hint' || action.type === 'reveal') {
    const target = action.type === 'hint' ? next.hints : next.revealed;
    if (target.includes(current.id)) fail('That clue aid is already visible.'); target.push(current.id);
  } else if (action.type === 'turn') {
    if (action.role === state.turn) fail('That participant already has the turn.'); next.turn = action.role;
  } else if (action.type === 'pause') {
    if (state.phase !== 'active') fail('Only an active mission can be paused.'); next.phase = 'paused';
  } else if (action.type === 'resume') {
    if (state.phase !== 'paused') fail('This mission is not paused.'); next.phase = 'active';
  } else if (action.type === 'advance') {
    if (!state.solved.includes(current.id) || state.clueIndex >= 4) fail('Solve the current clue before advancing.');
    next.clueIndex++; next.turn = state.turn === 'host' ? 'guest' : 'host'; next.lastAnswer = null;
  }
  next.revision++; next.updatedAt = at < state.updatedAt ? state.updatedAt : at; next.applied = [...state.applied, requestId].slice(-64);
  return validateMissionState(next);
}
export function verifyMissionTransition(previous: MissionState, proposed: MissionState, action: MissionAction, actor: MissionRole, requestId: string): MissionState {
  const next = validateMissionState(proposed), expected = applyMissionAction(previous, action, actor, requestId, next.updatedAt);
  if (stableStringify(next) !== stableStringify(expected)) fail('The peer’s mission update does not match the permitted transition.');
  return expected;
}

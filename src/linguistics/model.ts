import { stableStringify } from '../editorial.ts';
import { validateSavedPassage } from '../reading-session/model.ts';
import type { SavedPassage } from '../reading-session/model';
import type { Locale } from '../types';
import { strongId } from './lexicon.ts';
import type { DictionaryId, Lexicon, LexiconEntry } from './lexicon';

export interface TranslationExperiment {
  id: string; title: string; locale: Locale; status: 'private_user_exercise';
  dictionaryId: DictionaryId; entryId: string; entrySha256: string; dictionarySourceSha256: string;
  passage: SavedPassage; choiceA: string; choiceB: string; notes: string; createdAt: string; updatedAt: string;
}
export interface LinguisticsState { schemaVersion: 1; revision: number; experiments: TranslationExperiment[] }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function fail(message: string): never { throw new Error(message); }
function text(value: unknown, limit: number, label: string, required = false): string { if (typeof value !== 'string' || value.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value) || (required && !value.trim())) fail(`${label} is missing or invalid.`); return value; }
function sha(value: unknown): string { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : fail('Source checksum is invalid.'); }
function date(value: unknown): string { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value ? value : fail('Experiment timestamp is invalid.'); }
export function validateExperiment(value: unknown): TranslationExperiment {
  const keys = ['id','title','locale','status','dictionaryId','entryId','entrySha256','dictionarySourceSha256','passage','choiceA','choiceB','notes','createdAt','updatedAt'];
  if (!object(value) || Object.keys(value).some(key => !keys.includes(key))) fail('Unsupported experiment fields. Approval, verse alignment and publication claims cannot be imported.');
  if (typeof value.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(value.id) || value.status !== 'private_user_exercise' || !['en','de','yo','pcm'].includes(String(value.locale)) || !['greek','hebrew'].includes(String(value.dictionaryId)) || typeof value.entryId !== 'string' || strongId(value.entryId) !== value.entryId || !value.entryId.startsWith(value.dictionaryId === 'greek' ? 'G' : 'H')) fail('Experiment identity, language or source dictionary is invalid.');
  const createdAt = date(value.createdAt), updatedAt = date(value.updatedAt);
  if (createdAt > updatedAt) fail('Experiment timestamps are reversed.');
  return { id: value.id, title: text(value.title, 200, 'Experiment title', true), locale: value.locale as Locale, status: 'private_user_exercise', dictionaryId: value.dictionaryId as DictionaryId, entryId: value.entryId, entrySha256: sha(value.entrySha256), dictionarySourceSha256: sha(value.dictionarySourceSha256), passage: validateSavedPassage(value.passage), choiceA: text(value.choiceA, 20000, 'First user-written choice'), choiceB: text(value.choiceB, 20000, 'Second user-written choice'), notes: text(value.notes, 20000, 'Private study notes'), createdAt, updatedAt };
}
export const emptyLinguistics = (): LinguisticsState => ({ schemaVersion: 1, revision: 0, experiments: [] });
export function validateLinguistics(value: unknown): LinguisticsState {
  if (!object(value) || Object.keys(value).some(key => !['schemaVersion','revision','experiments'].includes(key)) || value.schemaVersion !== 1 || !Number.isSafeInteger(value.revision) || Number(value.revision) < 0 || Number(value.revision) >= Number.MAX_SAFE_INTEGER || !Array.isArray(value.experiments) || value.experiments.length > 100) fail('Experiment workspace version, revision or size is invalid.');
  const experiments = value.experiments.map(validateExperiment);
  if (new Set(experiments.map(row => row.id)).size !== experiments.length) fail('Duplicate experiment identities.');
  const state: LinguisticsState = { schemaVersion: 1, revision: Number(value.revision), experiments };
  if (new TextEncoder().encode(JSON.stringify(state)).byteLength > 8_000_000) fail('Experiment workspace exceeds its 8 MB backup size. Back up your work, then remove older experiments.');
  return state;
}
export function newExperiment(entry: LexiconEntry, lexicon: Lexicon, passage: SavedPassage, locale: Locale = 'en', now = new Date()): TranslationExperiment {
  if (!entry.lemma || !lexicon.entries.some(row => row.id === entry.id && row.entrySha256 === entry.entrySha256)) fail('Choose an available dictionary headword; unused number records cannot ground an exercise.');
  return validateExperiment({ id: crypto.randomUUID(), title: `Translation study ${entry.id}`, locale, status: 'private_user_exercise', dictionaryId: lexicon.dictionaryId, entryId: entry.id, entrySha256: entry.entrySha256, dictionarySourceSha256: lexicon.sourceSha256, passage, choiceA: '', choiceB: '', notes: '', createdAt: now.toISOString(), updatedAt: now.toISOString() });
}
export function linguisticsBackup(value: LinguisticsState): string { return JSON.stringify({ kind: 'adigun-private-translation-experiments', schemaVersion: 1, experiments: validateLinguistics(value).experiments }); }
export function parseLinguisticsBackup(raw: string): LinguisticsState {
  if (new TextEncoder().encode(raw).byteLength > 8_001_000) fail('Choose an experiment backup smaller than 8 MB.');
  let value: unknown; try { value = JSON.parse(raw); } catch { return fail('The experiment backup is not valid JSON.'); }
  if (!object(value) || Object.keys(value).some(key => !['kind','schemaVersion','experiments'].includes(key)) || value.kind !== 'adigun-private-translation-experiments' || value.schemaVersion !== 1) fail('Choose an Adigun private translation-experiment backup.');
  return validateLinguistics({ schemaVersion: 1, revision: 0, experiments: value.experiments });
}
export function previewLinguisticsImport(current: LinguisticsState, incoming: LinguisticsState) { let added = 0, identical = 0, conflicts = 0; for (const row of incoming.experiments) { const old = current.experiments.find(item => item.id === row.id); if (!old) added++; else if (stableStringify(old) === stableStringify(row)) identical++; else conflicts++; } return { added, identical, conflicts }; }
export function mergeLinguisticsImport(current: LinguisticsState, incoming: LinguisticsState): LinguisticsState {
  const experiments = [...validateLinguistics(current).experiments];
  for (const row of validateLinguistics(incoming).experiments) { const old = experiments.find(item => item.id === row.id); if (!old) experiments.push(row); else if (stableStringify(old) !== stableStringify(row)) experiments.push({ ...row, id: crypto.randomUUID() }); }
  return validateLinguistics({ ...current, experiments });
}

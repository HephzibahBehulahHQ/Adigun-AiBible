import { gospelReferenceKey, resolvePaneReference, validateGospelReference, validateGospelSelection } from './model.ts';
import type { GospelReference, GospelSelection } from './model';

export const MAX_GOSPEL_STUDIES = 100;
export const MAX_GOSPEL_STUDY_BACKUP_BYTES = 2 * 1024 * 1024;
export interface GospelStudyPassage {
  reference: GospelReference; sourceSha256: string; editionName: string; bookName: string;
}
export interface GospelStudyRow {
  id: string; title: string; note: string; selection: GospelSelection; passages: GospelStudyPassage[];
  createdAt: string; updatedAt: string;
}
export interface GospelStudyState { schemaVersion: 1; revision: number; rows: GospelStudyRow[] }
export const emptyGospelStudy = (): GospelStudyState => ({ schemaVersion: 1, revision: 0, rows: [] });

function record(value: unknown, fields: string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error(`Invalid ${label}.`);
  const row = value as Record<string, unknown>;
  if (Reflect.ownKeys(row).some(key => typeof key !== 'string' || !fields.includes(key))
    || fields.some(key => !Object.hasOwn(row, key))) throw new Error(`Incomplete or unknown ${label} fields. Approval records and copied Scripture are not accepted.`);
  return row;
}
function text(value: unknown, label: string, maximum: number, multiline = false, required = true): string {
  const forbidden = multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/;
  if (typeof value !== 'string' || value.length > maximum || (required && !value.trim()) || forbidden.test(value)) throw new Error(`${label} is missing, invalid or too long.`);
  return value;
}
function date(value: unknown): string {
  const result = text(value, 'Gospel study date', 30);
  if (!Number.isFinite(Date.parse(result)) || new Date(result).toISOString() !== result) throw new Error('Invalid Gospel study date.');
  return result;
}
function boundedJson(value: unknown): string {
  const json = JSON.stringify(value);
  if (new TextEncoder().encode(json).byteLength > MAX_GOSPEL_STUDY_BACKUP_BYTES) throw new Error('The Gospel notebook exceeds its 2 MiB limit. Export and remove older studies first.');
  return json;
}
export function validateGospelStudyPassage(value: unknown): GospelStudyPassage {
  const passage = record(value, ['reference', 'sourceSha256', 'editionName', 'bookName'], 'saved Gospel passage');
  if (typeof passage.sourceSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(passage.sourceSha256)) throw new Error('A saved Gospel passage must include its exact source SHA-256.');
  return {
    reference: validateGospelReference(passage.reference), sourceSha256: passage.sourceSha256,
    editionName: text(passage.editionName, 'Gospel edition name', 200), bookName: text(passage.bookName, 'Gospel book name', 100),
  };
}
export function validateGospelStudyRow(value: unknown): GospelStudyRow {
  const row = record(value, ['id', 'title', 'note', 'selection', 'passages', 'createdAt', 'updatedAt'], 'Gospel study');
  const id = text(row.id, 'Gospel study identifier', 100);
  if (!/^[A-Za-z0-9._-]+$/.test(id)) throw new Error('Invalid Gospel study identifier.');
  const selection = validateGospelSelection(row.selection);
  if (!Array.isArray(row.passages) || row.passages.length !== selection.panes.length) throw new Error('Every Gospel pane needs one matching saved source passage.');
  const passages = Array.from(row.passages, validateGospelStudyPassage);
  for (const [index, passage] of passages.entries()) {
    if (gospelReferenceKey(passage.reference) !== gospelReferenceKey(resolvePaneReference(selection, selection.panes[index]))) {
      throw new Error('Saved Gospel passages must match their selected panes, editions, complete ranges and order.');
    }
  }
  const createdAt = date(row.createdAt), updatedAt = date(row.updatedAt);
  if (Date.parse(updatedAt) < Date.parse(createdAt)) throw new Error('The Gospel study update date precedes its creation date.');
  return { id, title: text(row.title, 'Gospel study title', 160), note: text(row.note, 'Private Gospel notes', 12000, true, false), selection, passages, createdAt, updatedAt };
}
export function validateGospelStudy(value: unknown): GospelStudyState {
  const state = record(value, ['schemaVersion', 'revision', 'rows'], 'Gospel notebook');
  if (state.schemaVersion !== 1 || !Number.isSafeInteger(state.revision) || Number(state.revision) < 0 || Number(state.revision) >= Number.MAX_SAFE_INTEGER) throw new Error('Unsupported Gospel notebook version or revision.');
  if (!Array.isArray(state.rows) || state.rows.length > MAX_GOSPEL_STUDIES) throw new Error(`Keep at most ${MAX_GOSPEL_STUDIES} saved Gospel studies.`);
  const rows = Array.from(state.rows, validateGospelStudyRow);
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('Duplicate saved Gospel study identifiers.');
  const result: GospelStudyState = { schemaVersion: 1, revision: Number(state.revision), rows };
  boundedJson(result);
  return result;
}
export function gospelStudyBackup(value: GospelStudyState): string {
  return boundedJson({ kind: 'adigun-gospel-notebook', version: 1, workspace: { ...validateGospelStudy(value), revision: 0 } });
}
export function parseGospelStudyBackup(raw: string): GospelStudyState {
  if (typeof raw !== 'string') throw new Error('The Gospel backup must be JSON text.');
  if (raw.length > MAX_GOSPEL_STUDY_BACKUP_BYTES || new TextEncoder().encode(raw).byteLength > MAX_GOSPEL_STUDY_BACKUP_BYTES) throw new Error('Choose a Gospel backup no larger than 2 MiB.');
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('The Gospel backup is not valid JSON.'); }
  const backup = record(value, ['kind', 'version', 'workspace'], 'Gospel backup');
  if (backup.kind !== 'adigun-gospel-notebook' || backup.version !== 1) throw new Error('Choose an Adigun Gospel notebook backup.');
  return { ...validateGospelStudy(backup.workspace), revision: 0 };
}
export function previewGospelStudyImport(current: GospelStudyState, incoming: GospelStudyState): { added: number; identical: number; conflicts: number } {
  const saved = new Map(validateGospelStudy(current).rows.map(row => [row.id, row]));
  let added = 0, identical = 0, conflicts = 0;
  for (const row of validateGospelStudy(incoming).rows) {
    const previous = saved.get(row.id);
    if (!previous) added++;
    else if (JSON.stringify(previous) === JSON.stringify(row)) identical++;
    else conflicts++;
  }
  return { added, identical, conflicts };
}
export function mergeGospelStudies(current: GospelStudyState, incoming: GospelStudyState, conflict: 'keep-device' | 'use-backup'): GospelStudyState {
  if (conflict !== 'keep-device' && conflict !== 'use-backup') throw new Error('Choose how conflicting Gospel studies should be restored.');
  const clean = validateGospelStudy(current), rows = new Map(clean.rows.map(row => [row.id, row]));
  for (const row of validateGospelStudy(incoming).rows) if (!rows.has(row.id) || conflict === 'use-backup') rows.set(row.id, row);
  return validateGospelStudy({ ...clean, rows: [...rows.values()] });
}
export function moveGospelStudy(state: GospelStudyState, id: string, delta: -1 | 1): GospelStudyState {
  if (delta !== -1 && delta !== 1) throw new Error('Choose one position earlier or later for this Gospel study.');
  const clean = validateGospelStudy(state), rows = clean.rows.slice(), index = rows.findIndex(row => row.id === id), target = index + delta;
  if (index < 0 || target < 0 || target >= rows.length) throw new Error('This Gospel study cannot move further in that direction.');
  [rows[index], rows[target]] = [rows[target], rows[index]];
  return { ...clean, rows };
}

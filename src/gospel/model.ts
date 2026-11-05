import { validateSavedPassage } from '../reading-session/model.ts';
import type { SavedPassage } from '../reading-session/model';
import type { Reference } from '../types';

export const GOSPEL_BOOKS = ['MAT', 'MRK', 'LUK', 'JHN'] as const;
export const MAX_GOSPEL_ROWS = 100;
export const MAX_GOSPEL_BACKUP_BYTES = 2 * 1024 * 1024;
export interface GospelRow {
  id: string; title: string; note: string; passages: SavedPassage[]; createdAt: string; updatedAt: string;
}
export interface GospelState { schemaVersion: 1; revision: number; rows: GospelRow[] }
export const emptyGospel = (): GospelState => ({ schemaVersion: 1, revision: 0, rows: [] });

// These reading ranges were supplied in the product specification, Law Diary §2.5.
// They are a reading selection, never an editorially approved verse alignment.
export const requestedSowerRanges: Reference[] = [
  { bookId: 'MAT', chapter: 13, verse: 1, endVerse: 23, editionId: 'eng-web' },
  { bookId: 'MRK', chapter: 4, verse: 1, endVerse: 20, editionId: 'eng-web' },
  { bookId: 'LUK', chapter: 8, verse: 4, endVerse: 15, editionId: 'eng-web' },
];

function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Gospel study data must be an object.');
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some(key => !keys.includes(key))) throw new Error('Unexpected Gospel study fields. Approval records and copied Scripture are not accepted.');
  return row;
}
function text(value: unknown, label: string, max: number, required = false): string {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new Error(`${label} is missing, invalid or too long.`);
  return value;
}
function date(value: unknown): string {
  const result = text(value, 'Saved date', 30, true);
  if (!Number.isFinite(Date.parse(result)) || new Date(result).toISOString() !== result) throw new Error('Invalid Gospel study date.');
  return result;
}
export function validateGospelReference(value: Reference): Reference {
  if (!GOSPEL_BOOKS.includes(value.bookId as typeof GOSPEL_BOOKS[number]) || !value.editionId || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value.editionId)
    || !Number.isInteger(value.chapter) || value.chapter < 1 || value.chapter > 28
    || !Number.isInteger(value.verse) || !Number.isInteger(value.endVerse) || value.verse < 1 || value.endVerse! < value.verse || value.endVerse! > 200) {
    throw new Error('Choose an exact, single-chapter range in Matthew, Mark, Luke or John (at most 200 verse numbers).');
  }
  return { bookId: value.bookId, chapter: value.chapter, verse: value.verse, endVerse: value.endVerse, editionId: value.editionId };
}
export function validateGospelRow(value: unknown): GospelRow {
  const row = object(value, ['id', 'title', 'note', 'passages', 'createdAt', 'updatedAt']);
  const id = text(row.id, 'Row identifier', 100, true);
  if (!/^[a-zA-Z0-9._-]+$/.test(id)) throw new Error('Invalid Gospel row identifier.');
  if (!Array.isArray(row.passages) || row.passages.length < 2 || row.passages.length > 4) throw new Error('A comparison row needs two to four Gospel passages.');
  const passages = row.passages.map(value => {
    const passage = object(value, ['reference', 'sourceSha256', 'editionName', 'bookName']);
    object(passage.reference, ['bookId', 'chapter', 'verse', 'endVerse', 'editionId']);
    const saved = validateSavedPassage(passage);
    validateGospelReference(saved.reference);
    return saved;
  });
  if (new Set(passages.map(passage => passage.reference.bookId)).size !== passages.length) throw new Error('Use each Gospel only once in a comparison row. Use Bible editions to compare translations of the same Gospel.');
  const createdAt = date(row.createdAt), updatedAt = date(row.updatedAt);
  if (updatedAt < createdAt) throw new Error('The update date precedes the creation date.');
  return { id, title: text(row.title, 'Row title', 160, true), note: text(row.note, 'Private notes', 12000), passages, createdAt, updatedAt };
}
export function validateGospel(value: unknown): GospelState {
  const state = object(value, ['schemaVersion', 'revision', 'rows']);
  if (state.schemaVersion !== 1 || !Number.isSafeInteger(state.revision) || Number(state.revision) < 0 || Number(state.revision) >= Number.MAX_SAFE_INTEGER) throw new Error('Unsupported Gospel study version or revision.');
  if (!Array.isArray(state.rows) || state.rows.length > MAX_GOSPEL_ROWS) throw new Error(`Keep at most ${MAX_GOSPEL_ROWS} comparison rows.`);
  const rows = state.rows.map(validateGospelRow);
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('Duplicate Gospel comparison row identifiers.');
  const result: GospelState = { schemaVersion: 1, revision: Number(state.revision), rows };
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > MAX_GOSPEL_BACKUP_BYTES) throw new Error('The Gospel workspace exceeds its 2 MB limit. Export and remove older rows first.');
  return result;
}
export function gospelBackup(state: GospelState): string {
  const result = JSON.stringify({ kind: 'adigun-gospel-workspace', version: 1, workspace: { ...validateGospel(state), revision: 0 } });
  if (new TextEncoder().encode(result).byteLength > MAX_GOSPEL_BACKUP_BYTES) throw new Error('The Gospel backup exceeds 2 MB.');
  return result;
}
export function parseGospelBackup(raw: string): GospelState {
  if (new TextEncoder().encode(raw).byteLength > MAX_GOSPEL_BACKUP_BYTES) throw new Error('Choose a Gospel backup smaller than 2 MB.');
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error('The Gospel backup is not valid JSON.'); }
  const backup = object(parsed, ['kind', 'version', 'workspace']);
  if (backup.kind !== 'adigun-gospel-workspace' || backup.version !== 1) throw new Error('Choose an Adigun Gospel workspace backup.');
  return { ...validateGospel(backup.workspace), revision: 0 };
}
export function previewGospelImport(current: GospelState, incoming: GospelState) {
  validateGospel(current); validateGospel(incoming);
  let added = 0, identical = 0, conflicts = 0;
  for (const row of incoming.rows) {
    const saved = current.rows.find(item => item.id === row.id);
    if (!saved) added++; else if (JSON.stringify(saved) === JSON.stringify(row)) identical++; else conflicts++;
  }
  return { added, identical, conflicts };
}
export function mergeGospel(current: GospelState, incoming: GospelState, conflict: 'keep-device' | 'use-backup'): GospelState {
  validateGospel(current); validateGospel(incoming);
  const rows = new Map(current.rows.map(row => [row.id, row]));
  for (const row of incoming.rows) if (!rows.has(row.id) || conflict === 'use-backup') rows.set(row.id, row);
  return validateGospel({ ...current, rows: [...rows.values()] });
}
export function moveGospelRow(state: GospelState, id: string, delta: -1 | 1): GospelState {
  const rows = validateGospel(state).rows.slice(), index = rows.findIndex(row => row.id === id), target = index + delta;
  if (index < 0 || target < 0 || target >= rows.length) throw new Error('This row cannot move further in that direction.');
  [rows[index], rows[target]] = [rows[target], rows[index]];
  return { ...state, rows };
}

import { isReference } from '../domain.ts';
import type { Edition, Reference } from '../types';

export interface AudioEntry {
  id: string;
  ref: Reference & { editionId: string; endVerse: number };
  editionName: string;
  language: string;
  sourceSha256: string;
  repeats: number;
}
export interface AudioCursor { entryId: string; verse: number; repetition: number; completed: boolean }
export interface AudioBookmark {
  id: string;
  ref: Reference & { editionId: string };
  editionName: string;
  sourceSha256: string;
  createdAt: string;
}
export interface AudioSettings { rate: number; sleepMinutes: number; voices: Record<string, string> }
export interface AudioState {
  schemaVersion: 1;
  revision: number;
  entries: AudioEntry[];
  bookmarks: AudioBookmark[];
  cursor: AudioCursor | null;
  settings: AudioSettings;
}
export const AUDIO_QUEUE_LIMIT = 200;
export const emptyAudioState = (): AudioState => ({ schemaVersion: 1, revision: 0, entries: [], bookmarks: [], cursor: null, settings: { rate: 1, sleepMinutes: 0, voices: {} } });

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid listening record.');
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, limit = 200): string {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) throw new Error(`Invalid ${label}.`);
  return value;
}
function identifier(value: unknown): string { const id = text(value, 'listening identifier', 120); if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) throw new Error('Invalid listening identifier.'); return id; }
function checksum(value: unknown): string { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error('The listening record needs an exact source checksum.'); return value; }
function reference(value: unknown): Reference & { editionId: string } {
  if (!isReference(value) || !value.editionId) throw new Error('The listening reference needs a valid, explicit edition.');
  return { bookId: value.bookId, chapter: value.chapter, verse: value.verse, ...(value.endVerse === undefined ? {} : { endVerse: value.endVerse }), editionId: value.editionId };
}
export function validateAudioEntry(value: unknown): AudioEntry {
  const row = record(value); const ref = reference(row.ref); const language = text(row.language, 'source language', 40);
  if (!/^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/.test(language)) throw new Error('Invalid source language.');
  if (!Number.isInteger(row.repeats) || Number(row.repeats) < 1 || Number(row.repeats) > 10) throw new Error('Choose between one and ten passage repetitions.');
  return { id: identifier(row.id), ref: { ...ref, endVerse: ref.endVerse ?? ref.verse }, editionName: text(row.editionName, 'edition name'), language, sourceSha256: checksum(row.sourceSha256), repeats: Number(row.repeats) };
}
export function assertAudioSourceIdentity(item: { ref: Reference; editionName: string; sourceSha256: string; language?: string }, edition: Edition): void {
  if (item.ref.editionId !== edition.id || item.sourceSha256 !== edition.sha256 || item.editionName !== edition.name || (item.language !== undefined && item.language !== edition.language)) throw new Error('This listening record does not match the installed edition identity and revision. Add the passage again from its verified source.');
}
export function validateAudioState(value: unknown): AudioState {
  const state = record(value);
  if (state.schemaVersion !== 1) throw new Error('Unsupported listening workspace version. Existing data was not replaced.');
  if (!Number.isSafeInteger(state.revision) || Number(state.revision) < 0) throw new Error('Invalid listening workspace revision.');
  if (!Array.isArray(state.entries) || state.entries.length > AUDIO_QUEUE_LIMIT || !Array.isArray(state.bookmarks) || state.bookmarks.length > 1000) throw new Error('The listening workspace is too large or malformed.');
  const entries = state.entries.map(validateAudioEntry);
  if (new Set(entries.map(entry => entry.id)).size !== entries.length) throw new Error('Duplicate listening queue identifiers.');
  const bookmarks = state.bookmarks.map(value => {
    const row = record(value); const createdAt = text(row.createdAt, 'bookmark date', 30);
    if (!Number.isFinite(Date.parse(createdAt)) || new Date(createdAt).toISOString() !== createdAt) throw new Error('Invalid audio bookmark date.');
    return { id: identifier(row.id), ref: reference(row.ref), editionName: text(row.editionName, 'edition name'), sourceSha256: checksum(row.sourceSha256), createdAt };
  });
  if (new Set(bookmarks.map(bookmark => bookmark.id)).size !== bookmarks.length) throw new Error('Duplicate audio bookmark identifiers.');
  let cursor: AudioCursor | null = null;
  if (state.cursor !== null) {
    const row = record(state.cursor); const entry = entries.find(entry => entry.id === row.entryId);
    if (!entry || !Number.isInteger(row.verse) || Number(row.verse) < entry.ref.verse || Number(row.verse) > entry.ref.endVerse || !Number.isInteger(row.repetition) || Number(row.repetition) < 0 || Number(row.repetition) >= entry.repeats || typeof row.completed !== 'boolean') throw new Error('The saved listening position is outside its queue entry.');
    cursor = { entryId: entry.id, verse: Number(row.verse), repetition: Number(row.repetition), completed: row.completed };
  }
  const rawSettings = record(state.settings); const rawVoices = record(rawSettings.voices); const voices: Record<string, string> = {};
  if (typeof rawSettings.rate !== 'number' || !Number.isFinite(rawSettings.rate) || rawSettings.rate < 0.5 || rawSettings.rate > 2 || !Number.isInteger(rawSettings.sleepMinutes) || Number(rawSettings.sleepMinutes) < 0 || Number(rawSettings.sleepMinutes) > 180 || Object.keys(rawVoices).length > 100) throw new Error('Invalid listening settings.');
  for (const [language, key] of Object.entries(rawVoices)) {
    if (!/^[a-z]{2,3}$/.test(language)) throw new Error('Invalid voice language.');
    voices[language] = text(key, 'voice selection', 512);
  }
  return { schemaVersion: 1, revision: Number(state.revision), entries, bookmarks, cursor, settings: { rate: rawSettings.rate, sleepMinutes: Number(rawSettings.sleepMinutes), voices } };
}
export function moveAudioEntry(state: AudioState, id: string, direction: -1 | 1): AudioState {
  const entries = [...state.entries]; const index = entries.findIndex(entry => entry.id === id); const destination = index + direction;
  if (index < 0 || destination < 0 || destination >= entries.length) return state;
  [entries[index], entries[destination]] = [entries[destination], entries[index]];
  return { ...state, entries };
}
export function removeAudioEntry(state: AudioState, id: string): AudioState { return { ...state, entries: state.entries.filter(entry => entry.id !== id), cursor: state.cursor?.entryId === id ? null : state.cursor }; }
export function audioReferenceLabel(ref: Reference): string { return `${ref.bookId} ${ref.chapter}:${ref.verse}${ref.endVerse && ref.endVerse !== ref.verse ? `–${ref.endVerse}` : ''}`; }
export function audioBackup(state: AudioState): string { return JSON.stringify({ kind: 'Adigun-AiBible/listening', exportedAt: new Date().toISOString(), workspace: validateAudioState(state) }, null, 2); }
export function parseAudioBackup(text: string): AudioState {
  if (text.length > 2_000_000) throw new Error('The listening backup exceeds the 2 MB limit.');
  let backup: Record<string, unknown>; try { backup = record(JSON.parse(text)); } catch { throw new Error('Choose a valid listening JSON backup.'); }
  if (backup.kind !== 'Adigun-AiBible/listening') throw new Error('This is not an Adigun-AiBible listening backup.');
  return validateAudioState(backup.workspace);
}

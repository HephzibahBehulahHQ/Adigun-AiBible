import { isReference } from '../domain.ts';
import type { Reference } from '../types';

export const MAX_HISTORY = 100;
export const MAX_TABS = 12;
export const MAX_BACKUP_BYTES = 256 * 1024;
export interface SavedPassage {
  reference: Reference & { editionId: string; endVerse: number };
  sourceSha256: string;
  editionName: string;
  bookName: string;
}
export interface ReadingVisit { id: string; passage: SavedPassage; visitedAt: string }
export interface StudyTab { id: string; name: string; passage: SavedPassage }
export interface ReadingSessionState {
  schemaVersion: 1;
  revision: number;
  history: ReadingVisit[];
  historyIndex: number;
  tabs: StudyTab[];
  activeTabId: string | null;
}
export function emptyReadingSession(): ReadingSessionState {
  return { schemaVersion: 1, revision: 0, history: [], historyIndex: -1, tabs: [], activeTabId: null };
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Reading session data must be an object.');
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) throw new Error(`${label} is invalid.`);
  return value;
}
function identifier(value: unknown): string {
  const id = text(value, 'Reading session identifier', 100);
  if (!/^[a-zA-Z0-9._-]+$/.test(id)) throw new Error('Reading session identifier is invalid.');
  return id;
}
export function validateSavedPassage(value: unknown): SavedPassage {
  const p = object(value), r = p.reference;
  if (!isReference(r) || !r.editionId || !Number.isInteger(r.endVerse)) throw new Error('A saved passage must include its edition and complete verse range.');
  if (typeof p.sourceSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(p.sourceSha256)) throw new Error('A saved passage must include its source revision.');
  return {
    reference: { editionId: r.editionId, bookId: r.bookId, chapter: r.chapter, verse: r.verse, endVerse: r.endVerse! },
    sourceSha256: p.sourceSha256, editionName: text(p.editionName, 'Edition name', 200), bookName: text(p.bookName, 'Book name', 100),
  };
}
export function validateReadingSession(value: unknown): ReadingSessionState {
  const s = object(value);
  if (s.schemaVersion !== 1 || !Number.isSafeInteger(s.revision) || Number(s.revision) < 0 || Number(s.revision) >= Number.MAX_SAFE_INTEGER) throw new Error('Reading session version is invalid.');
  if (!Array.isArray(s.history) || s.history.length > MAX_HISTORY || !Array.isArray(s.tabs) || s.tabs.length > MAX_TABS) throw new Error('Reading session exceeds its history or tab limit.');
  const history = s.history.map(value => {
    const v = object(value), visitedAt = text(v.visitedAt, 'Visit date', 30);
    if (!Number.isFinite(Date.parse(visitedAt)) || new Date(visitedAt).toISOString() !== visitedAt) throw new Error('Visit date is invalid.');
    return { id: identifier(v.id), passage: validateSavedPassage(v.passage), visitedAt };
  });
  const tabs = s.tabs.map(value => {
    const t = object(value);
    return { id: identifier(t.id), name: text(t.name, 'Tab name', 80), passage: validateSavedPassage(t.passage) };
  });
  if (new Set(history.map(v => v.id)).size !== history.length || new Set(tabs.map(t => t.id)).size !== tabs.length) throw new Error('Reading session contains duplicate identifiers.');
  if (!Number.isInteger(s.historyIndex) || Number(s.historyIndex) < -1 || Number(s.historyIndex) >= history.length || (history.length > 0 && Number(s.historyIndex) < 0)) throw new Error('Reading history position is invalid.');
  if (s.activeTabId !== null && (typeof s.activeTabId !== 'string' || !tabs.some(t => t.id === s.activeTabId))) throw new Error('The active study tab is missing.');
  if (tabs.length > 0 && s.activeTabId === null) throw new Error('Reading session has no active study tab.');
  return { schemaVersion: 1, revision: Number(s.revision), history, historyIndex: Number(s.historyIndex), tabs, activeTabId: s.activeTabId as string | null };
}
export function samePassage(a: SavedPassage, b: SavedPassage): boolean {
  const x = a.reference, y = b.reference;
  return a.sourceSha256 === b.sourceSha256 && x.editionId === y.editionId && x.bookId === y.bookId && x.chapter === y.chapter && x.verse === y.verse && x.endVerse === y.endVerse;
}
export function passageLabel(p: SavedPassage): string {
  const r = p.reference;
  return `${p.bookName} ${r.chapter}:${r.verse}${r.endVerse !== r.verse ? `–${r.endVerse}` : ''}`;
}
export function recordReadingVisit(state: ReadingSessionState, passage: SavedPassage, visitId: string, visitedAt: string, firstTabId: string): ReadingSessionState {
  const current = state.history[state.historyIndex];
  const history = current && samePassage(current.passage, passage) ? state.history : [...state.history.slice(0, state.historyIndex + 1), { id: visitId, passage, visitedAt }].slice(-MAX_HISTORY);
  const historyIndex = current && samePassage(current.passage, passage) ? state.historyIndex : history.length - 1;
  const tabs = state.tabs.length ? state.tabs.map(t => t.id === state.activeTabId ? { ...t, passage } : t) : [{ id: firstTabId, name: passageLabel(passage), passage }];
  return validateReadingSession({ ...state, history, historyIndex, tabs, activeTabId: state.activeTabId || firstTabId });
}
export function selectHistoryVisit(state: ReadingSessionState, visitId: string): ReadingSessionState {
  const index = state.history.findIndex(v => v.id === visitId);
  if (index < 0) throw new Error('That history entry is no longer saved.');
  const passage = state.history[index].passage;
  return { ...state, historyIndex: index, tabs: state.tabs.map(t => t.id === state.activeTabId ? { ...t, passage } : t) };
}
export function addStudyTab(state: ReadingSessionState, passage: SavedPassage, id: string): ReadingSessionState {
  if (state.tabs.length >= MAX_TABS) throw new Error(`You can keep up to ${MAX_TABS} study tabs.`);
  return validateReadingSession({ ...state, tabs: [...state.tabs, { id, name: passageLabel(passage), passage }], activeTabId: id });
}
export function selectStudyTab(state: ReadingSessionState, id: string): ReadingSessionState {
  if (!state.tabs.some(t => t.id === id)) throw new Error('That study tab is no longer saved.');
  return { ...state, activeTabId: id };
}
export function closeStudyTab(state: ReadingSessionState, id: string): ReadingSessionState {
  const index = state.tabs.findIndex(t => t.id === id);
  if (index < 0) throw new Error('That study tab is no longer saved.');
  const tabs = state.tabs.filter(t => t.id !== id);
  return { ...state, tabs, activeTabId: state.activeTabId === id ? tabs[Math.min(index, tabs.length - 1)]?.id || null : state.activeTabId };
}
export function renameStudyTab(state: ReadingSessionState, id: string, name: string): ReadingSessionState {
  if (!state.tabs.some(t => t.id === id)) throw new Error('That study tab is no longer saved.');
  const validated = text(name.trim(), 'Tab name', 80);
  return { ...state, tabs: state.tabs.map(t => t.id === id ? { ...t, name: validated } : t) };
}
export function readingSessionBackup(state: ReadingSessionState): string {
  return JSON.stringify({ kind: 'adigun-reading-session', version: 1, session: { ...validateReadingSession(state), revision: 0 } }, null, 2);
}
export function parseReadingSessionBackup(raw: string): ReadingSessionState {
  if (new TextEncoder().encode(raw).byteLength > MAX_BACKUP_BYTES) throw new Error('Reading session backup is too large.');
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('Reading session backup is not valid JSON.'); }
  const backup = object(value);
  if (backup.kind !== 'adigun-reading-session' || backup.version !== 1) throw new Error('Choose an Adigun reading session backup.');
  return { ...validateReadingSession(backup.session), revision: 0 };
}

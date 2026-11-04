import type { Theme } from '../types';

export const MAX_LAYOUTS = 12;
export const MAX_LAYOUT_BACKUP_BYTES = 64 * 1024;

export interface SourceAppearance {
  layout: 'verses' | 'paragraphs';
  headings: boolean;
  notes: boolean;
  redLetters: boolean;
}
export interface ComparisonPane { id: string; linked: boolean; bookId: string; chapter: number }
export interface ReaderLayoutSettings {
  theme: Theme;
  fontSize: number;
  lineHeight: number;
  focus: boolean;
  inspector: 'context' | 'source' | 'notes';
  showInspector: boolean;
  source: SourceAppearance;
  panes: ComparisonPane[];
}
export interface ReaderLayout { id: string; name: string; settings: ReaderLayoutSettings; updatedAt: string }
export interface ReaderLayoutsState { schemaVersion: 1; revision: number; layouts: ReaderLayout[] }

export function emptyReaderLayouts(): ReaderLayoutsState {
  return { schemaVersion: 1, revision: 0, layouts: [] };
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Reader layout data must be an object.');
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) throw new Error(`${label} is invalid.`);
  return value.trim();
}
function id(value: unknown, label = 'Layout identifier'): string {
  const result = text(value, label, 100);
  if (!/^[a-zA-Z0-9._-]+$/.test(result)) throw new Error(`${label} is invalid.`);
  return result;
}
function bool(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} must be on or off.`);
  return value;
}
function range(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`${label} is outside its supported range.`);
  return value;
}
function choice<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw new Error(`${label} is invalid.`);
  return value as T;
}
function date(value: unknown): string {
  const result = text(value, 'Layout date', 30);
  if (!Number.isFinite(Date.parse(result)) || new Date(result).toISOString() !== result) throw new Error('Layout date is invalid.');
  return result;
}
const nameKey = (value: string) => value.normalize('NFKC').toLocaleLowerCase('en-US');

export function validateReaderLayoutSettings(value: unknown): ReaderLayoutSettings {
  const settings = object(value), source = object(settings.source);
  if (!Array.isArray(settings.panes) || settings.panes.length < 2 || settings.panes.length > 4) throw new Error('A layout must have two to four comparison panes.');
  const panes = settings.panes.map(value => {
    const pane = object(value), editionId = id(pane.id, 'Comparison edition');
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(editionId)) throw new Error('Comparison edition is invalid.');
    if (typeof pane.bookId !== 'string' || !/^[A-Z0-9]{3,8}$/.test(pane.bookId)) throw new Error('Comparison book is invalid.');
    if (!Number.isInteger(pane.chapter) || Number(pane.chapter) < 1 || Number(pane.chapter) > 200) throw new Error('Comparison chapter is invalid.');
    return { id: editionId, linked: bool(pane.linked, 'Comparison link'), bookId: pane.bookId, chapter: Number(pane.chapter) };
  });
  return {
    theme: choice(settings.theme, ['observatory', 'light', 'parchment', 'night', 'retro'] as const, 'Reader theme'),
    fontSize: range(settings.fontSize, 16, 28, 'Reading size'),
    lineHeight: range(settings.lineHeight, 1.5, 2.2, 'Line spacing'),
    focus: bool(settings.focus, 'Focus mode'),
    inspector: choice(settings.inspector, ['context', 'source', 'notes'] as const, 'Study inspector'),
    showInspector: bool(settings.showInspector, 'Study inspector visibility'),
    source: {
      layout: choice(source.layout, ['verses', 'paragraphs'] as const, 'Source layout'),
      headings: bool(source.headings, 'Publisher headings'),
      notes: bool(source.notes, 'Publisher notes'),
      redLetters: bool(source.redLetters, 'Publisher red letters'),
    },
    panes,
  };
}

export function validateReaderLayouts(value: unknown): ReaderLayoutsState {
  const state = object(value);
  if (state.schemaVersion !== 1 || !Number.isSafeInteger(state.revision) || Number(state.revision) < 0 || Number(state.revision) >= Number.MAX_SAFE_INTEGER) throw new Error('Saved layout version is invalid.');
  if (!Array.isArray(state.layouts) || state.layouts.length > MAX_LAYOUTS) throw new Error(`You can keep up to ${MAX_LAYOUTS} reader layouts.`);
  const layouts = state.layouts.map(value => {
    const layout = object(value);
    return { id: id(layout.id), name: text(layout.name, 'Layout name', 80), settings: validateReaderLayoutSettings(layout.settings), updatedAt: date(layout.updatedAt) };
  });
  if (new Set(layouts.map(layout => layout.id.toLowerCase())).size !== layouts.length) throw new Error('Saved layouts contain duplicate identifiers.');
  if (new Set(layouts.map(layout => nameKey(layout.name))).size !== layouts.length) throw new Error('Choose a different name: a reader layout already uses that name.');
  return { schemaVersion: 1, revision: Number(state.revision), layouts };
}

export function addReaderLayout(state: ReaderLayoutsState, settings: ReaderLayoutSettings, identifier: string, name: string, updatedAt: string): ReaderLayoutsState {
  const current = validateReaderLayouts(state);
  if (current.layouts.length >= MAX_LAYOUTS) throw new Error(`You can keep up to ${MAX_LAYOUTS} reader layouts. Remove one before saving another.`);
  return validateReaderLayouts({ ...current, layouts: [...current.layouts, { id: identifier, name, settings, updatedAt }] });
}
export function renameReaderLayout(state: ReaderLayoutsState, identifier: string, name: string, updatedAt: string): ReaderLayoutsState {
  const current = validateReaderLayouts(state);
  if (!current.layouts.some(layout => layout.id === identifier)) throw new Error('That reader layout is no longer saved.');
  return validateReaderLayouts({ ...current, layouts: current.layouts.map(layout => layout.id === identifier ? { ...layout, name, updatedAt } : layout) });
}
export function removeReaderLayout(state: ReaderLayoutsState, identifier: string): ReaderLayoutsState {
  const current = validateReaderLayouts(state);
  if (!current.layouts.some(layout => layout.id === identifier)) throw new Error('That reader layout is no longer saved.');
  return { ...current, layouts: current.layouts.filter(layout => layout.id !== identifier) };
}
export function readerLayoutsBackup(state: ReaderLayoutsState): string {
  return JSON.stringify({ kind: 'adigun-reader-layouts', version: 1, state: { ...validateReaderLayouts(state), revision: 0 } }, null, 2);
}
export function parseReaderLayoutsBackup(raw: string): ReaderLayoutsState {
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).byteLength > MAX_LAYOUT_BACKUP_BYTES) throw new Error('Reader layout backup is too large.');
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error('Reader layout backup is not valid JSON.'); }
  const backup = object(parsed);
  if (backup.kind !== 'adigun-reader-layouts' || backup.version !== 1) throw new Error('Choose an Adigun reader layouts backup.');
  return { ...validateReaderLayouts(backup.state), revision: 0 };
}

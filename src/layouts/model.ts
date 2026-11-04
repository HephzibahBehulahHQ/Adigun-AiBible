import type { Theme } from '../types';

export const MAX_LAYOUTS = 12;
export const MAX_LAYOUT_NAME = 60;
export const MAX_LAYOUT_BACKUP_BYTES = 65_536;

export interface WorkspaceLayoutSnapshot {
  theme: Theme;
  fontSize: number;
  lineHeight: number;
  focus: boolean;
  inspector: 'context' | 'source' | 'notes';
  inspectorVisible: boolean;
}
export interface SavedWorkspaceLayout {
  id: string;
  name: string;
  snapshot: WorkspaceLayoutSnapshot;
  createdAt: string;
  updatedAt: string;
}
export interface WorkspaceLayouts {
  schemaVersion: 1;
  revision: number;
  layouts: SavedWorkspaceLayout[];
}

export const layoutThemeNames: Record<Theme, string> = {
  observatory: 'Observatory Dark', light: 'Minimal Light', parchment: 'Warm Parchment',
  night: 'Moody Night', retro: 'Retro Paper',
};

function record(value: unknown, keys: string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} is invalid.`);
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(result, key))) {
    throw new Error(`${label} contains missing or unsupported fields.`);
  }
  return result;
}
function bounded(value: unknown, minimum: number, maximum: number, label: string) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`${label} is out of range.`);
  return value;
}
function identifier(value: unknown) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(value)) throw new Error('Layout identity is invalid.');
  return value;
}
function date(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error('Layout date is invalid.');
  return value;
}
export function layoutName(value: unknown): string {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f-\u009f]/.test(value)) throw new Error('Enter a layout name without control characters.');
  const name = value.trim().normalize('NFC');
  if (!name || name.length > MAX_LAYOUT_NAME) throw new Error(`Use a layout name between 1 and ${MAX_LAYOUT_NAME} characters.`);
  return name;
}
const nameKey = (name: string) => name.normalize('NFC').toLowerCase();

/** Only display configuration is accepted; passages, editions, notes and locale never enter a layout. */
export function validateLayoutSnapshot(value: unknown): WorkspaceLayoutSnapshot {
  const snapshot = record(value, ['theme', 'fontSize', 'lineHeight', 'focus', 'inspector', 'inspectorVisible'], 'Layout settings');
  if (typeof snapshot.theme !== 'string' || !Object.hasOwn(layoutThemeNames, snapshot.theme)) throw new Error('Layout theme is unsupported.');
  if (typeof snapshot.focus !== 'boolean' || typeof snapshot.inspectorVisible !== 'boolean') throw new Error('Layout visibility settings are invalid.');
  if (typeof snapshot.inspector !== 'string' || !['context', 'source', 'notes'].includes(snapshot.inspector)) throw new Error('Layout inspector is unsupported.');
  return {
    theme: snapshot.theme as Theme,
    fontSize: bounded(snapshot.fontSize, 16, 28, 'Layout font size'),
    lineHeight: bounded(snapshot.lineHeight, 1.5, 2.2, 'Layout line spacing'),
    focus: snapshot.focus,
    inspector: snapshot.inspector as WorkspaceLayoutSnapshot['inspector'],
    inspectorVisible: snapshot.inspectorVisible,
  };
}
function validateLayout(value: unknown): SavedWorkspaceLayout {
  const layout = record(value, ['id', 'name', 'snapshot', 'createdAt', 'updatedAt'], 'Saved layout');
  const createdAt = date(layout.createdAt), updatedAt = date(layout.updatedAt);
  if (updatedAt < createdAt) throw new Error('A layout cannot be updated before it was created.');
  return { id: identifier(layout.id), name: layoutName(layout.name), snapshot: validateLayoutSnapshot(layout.snapshot), createdAt, updatedAt };
}
function validateList(value: unknown): SavedWorkspaceLayout[] {
  if (!Array.isArray(value) || value.length > MAX_LAYOUTS) throw new Error(`A backup can contain at most ${MAX_LAYOUTS} layouts.`);
  const layouts = value.map(validateLayout), ids = new Set<string>(), names = new Set<string>();
  for (const layout of layouts) {
    if (ids.has(layout.id) || names.has(nameKey(layout.name))) throw new Error('Layout identities and names must be unique.');
    ids.add(layout.id); names.add(nameKey(layout.name));
  }
  return layouts;
}
export function emptyLayouts(): WorkspaceLayouts { return { schemaVersion: 1, revision: 0, layouts: [] }; }
export function validateLayouts(value: unknown): WorkspaceLayouts {
  const state = record(value, ['schemaVersion', 'revision', 'layouts'], 'Saved workspace layouts');
  if (state.schemaVersion !== 1) throw new Error('Unsupported workspace layout version.');
  if (!Number.isSafeInteger(state.revision) || Number(state.revision) < 0 || Number(state.revision) >= Number.MAX_SAFE_INTEGER - 1) throw new Error('Layout revision is invalid.');
  return { schemaVersion: 1, revision: state.revision as number, layouts: validateList(state.layouts) };
}
export function addLayout(value: WorkspaceLayouts, name: string, snapshot: WorkspaceLayoutSnapshot, id: string, now: string): WorkspaceLayouts {
  const state = validateLayouts(value);
  return validateLayouts({ ...state, layouts: [...state.layouts, { id, name, snapshot, createdAt: now, updatedAt: now }] });
}
export function renameLayout(value: WorkspaceLayouts, id: string, name: string, now: string): WorkspaceLayouts {
  const state = validateLayouts(value);
  if (!state.layouts.some(layout => layout.id === id)) throw new Error('That layout is no longer saved. Reload layouts.');
  return validateLayouts({ ...state, layouts: state.layouts.map(layout => layout.id === id ? { ...layout, name, updatedAt: now } : layout) });
}
export function removeLayout(value: WorkspaceLayouts, id: string): WorkspaceLayouts {
  const state = validateLayouts(value);
  if (!state.layouts.some(layout => layout.id === id)) throw new Error('That layout is no longer saved. Reload layouts.');
  return { ...state, layouts: state.layouts.filter(layout => layout.id !== id) };
}
export function layoutBackup(value: WorkspaceLayouts): string {
  return JSON.stringify({ kind: 'adigun-workspace-layouts', version: 1, layouts: validateLayouts(value).layouts }, null, 2);
}
export function parseLayoutBackup(raw: string): SavedWorkspaceLayout[] {
  if (typeof raw !== 'string' || raw.length > MAX_LAYOUT_BACKUP_BYTES || new TextEncoder().encode(raw).byteLength > MAX_LAYOUT_BACKUP_BYTES) throw new Error('Layout backup exceeds 64 KB.');
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error('Choose a valid workspace layout JSON backup.'); }
  const backup = record(parsed, ['kind', 'version', 'layouts'], 'Layout backup');
  if (backup.kind !== 'adigun-workspace-layouts' || backup.version !== 1) throw new Error('Unsupported workspace layout backup.');
  return validateList(backup.layouts);
}
/** Existing matching IDs or names win. The entire import is refused when new entries exceed the cap. */
export function mergeLayouts(value: WorkspaceLayouts, imported: SavedWorkspaceLayout[]) {
  const state = validateLayouts(value), incoming = validateList(imported);
  const ids = new Set(state.layouts.map(layout => layout.id)), names = new Set(state.layouts.map(layout => nameKey(layout.name)));
  const additions = incoming.filter(layout => !ids.has(layout.id) && !names.has(nameKey(layout.name)));
  if (state.layouts.length + additions.length > MAX_LAYOUTS) throw new Error(`These layouts would exceed the ${MAX_LAYOUTS}-layout limit. Remove a saved layout first; nothing was imported.`);
  return {
    state: validateLayouts({ ...state, layouts: [...state.layouts, ...additions] }),
    added: additions.length, skipped: incoming.length - additions.length,
    addedIds: additions.map(layout => layout.id),
  };
}
export function layoutDescription(snapshot: WorkspaceLayoutSnapshot): string {
  const value = validateLayoutSnapshot(snapshot);
  return `${layoutThemeNames[value.theme]} · ${value.fontSize} px · Line spacing ${value.lineHeight} · Focus ${value.focus ? 'on' : 'off'} · ${value.inspectorVisible ? `${value.inspector[0].toUpperCase()}${value.inspector.slice(1)} inspector` : 'Inspector hidden'}`;
}

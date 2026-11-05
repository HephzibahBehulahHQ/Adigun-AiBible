import { validateSavedPassage } from '../reading-session/model.ts';
import type { SavedPassage } from '../reading-session/model';

export const MAX_MINISTRY_BACKUP_BYTES = 12 * 1024 * 1024;
export interface MinistryQuote { id: string; passage: SavedPassage }
export interface MinistrySection { id: string; heading: string; writing: string; quoteIds: string[] }
export interface MinistryOutline {
  id: string; title: string; kind: 'sermon' | 'lesson'; summary: string;
  series: string; scheduledDate: string; timeZone: string; tradition: string; contentLanguage: string;
  contextNotes: string; facilitatorNotes: string; sections: MinistrySection[]; quotes: MinistryQuote[];
  createdAt: string; updatedAt: string;
}
export interface MinistryState { schemaVersion: 1; revision: number; outlines: MinistryOutline[]; templates: MinistryOutline[] }
export const emptyMinistry = (): MinistryState => ({ schemaVersion: 1, revision: 0, outlines: [], templates: [] });
export const ministryTemplates = [
  { id: 'passage', name: 'Passage study', headings: ['Read the passage', 'Observe the wording', 'Discuss the context', 'Questions for reflection'] },
  { id: 'teaching', name: 'Teaching outline', headings: ['Opening reading', 'Main points', 'Discussion', 'Closing reflection'] },
  { id: 'blank', name: 'Start with one section', headings: ['Outline'] },
] as const;

export function newMinistryOutline(templateId = 'passage', now = new Date()): MinistryOutline {
  const template = ministryTemplates.find(item => item.id === templateId) || ministryTemplates[0];
  return { id: `outline-${crypto.randomUUID()}`, title: '', kind: 'lesson', summary: '', series: '', scheduledDate: '',
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', tradition: '', contentLanguage: 'en',
    contextNotes: '', facilitatorNotes: '', sections: template.headings.map(heading => ({ id: `section-${crypto.randomUUID()}`, heading, writing: '', quoteIds: [] })),
    quotes: [], createdAt: now.toISOString(), updatedAt: now.toISOString() };
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Ministry data must be an object.');
  return value as Record<string, unknown>;
}
function text(value: unknown, name: string, max: number, required = false): string {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new Error(`${name} is invalid or too long.`);
  return value;
}
function id(value: unknown): string {
  const result = text(value, 'Record identifier', 100, true);
  if (!/^[a-zA-Z0-9._-]+$/.test(result)) throw new Error('Invalid ministry record identifier.');
  return result;
}
function dateTime(value: unknown): string {
  const result = text(value, 'Saved date', 30, true);
  if (!Number.isFinite(Date.parse(result)) || new Date(result).toISOString() !== result) throw new Error('Invalid saved date.');
  return result;
}
export function validMinistryDate(value: string): boolean {
  return value === '' || (/^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value);
}
export function validateMinistryOutline(value: unknown): MinistryOutline {
  const row = object(value);
  if (row.kind !== 'sermon' && row.kind !== 'lesson') throw new Error('Choose a sermon or lesson outline.');
  const scheduledDate = text(row.scheduledDate, 'Calendar date', 10);
  if (!validMinistryDate(scheduledDate)) throw new Error('Choose a valid calendar date.');
  const timeZone = text(row.timeZone, 'Calendar timezone', 100, true);
  try { new Intl.DateTimeFormat('en', { timeZone }).format(); } catch { throw new Error('Enter a valid IANA timezone, such as Europe/Berlin.'); }
  const contentLanguage = text(row.contentLanguage, 'Writing language', 40, true);
  if (contentLanguage.toLowerCase() === 'genz') throw new Error('Gen Z is a writing register. Use a language tag such as en.');
  try { if (!Intl.getCanonicalLocales(contentLanguage).length) throw new Error(); } catch { throw new Error('Enter a valid writing-language tag, such as en, de, yo or pcm.'); }
  if (!Array.isArray(row.quotes) || row.quotes.length > 80 || !Array.isArray(row.sections) || row.sections.length < 1 || row.sections.length > 40) throw new Error('An outline needs 1–40 sections and at most 80 source passages.');
  const quotes = row.quotes.map(raw => { const item = object(raw); return { id: id(item.id), passage: validateSavedPassage(item.passage) }; });
  const quoteIds = new Set(quotes.map(item => item.id));
  if (quoteIds.size !== quotes.length) throw new Error('Duplicate source-passage identifiers.');
  const sections = row.sections.map(raw => {
    const section = object(raw);
    if (!Array.isArray(section.quoteIds) || section.quoteIds.length > 80 || section.quoteIds.some(value => typeof value !== 'string' || !quoteIds.has(value)) || new Set(section.quoteIds).size !== section.quoteIds.length) throw new Error('A section has a missing or duplicate source-passage link.');
    return { id: id(section.id), heading: text(section.heading, 'Section heading', 200, true), writing: text(section.writing, 'Section writing', 20000), quoteIds: section.quoteIds as string[] };
  });
  if (new Set(sections.map(item => item.id)).size !== sections.length) throw new Error('Duplicate section identifiers.');
  const createdAt = dateTime(row.createdAt), updatedAt = dateTime(row.updatedAt);
  if (updatedAt < createdAt) throw new Error('The saved update precedes the creation date.');
  return { id: id(row.id), title: text(row.title, 'Outline title', 200, true), kind: row.kind,
    summary: text(row.summary, 'Participant introduction', 5000), series: text(row.series, 'Series title', 200),
    scheduledDate, timeZone, tradition: text(row.tradition, 'Tradition setting', 200), contentLanguage,
    contextNotes: text(row.contextNotes, 'Private context notes', 20000), facilitatorNotes: text(row.facilitatorNotes, 'Facilitator notes', 30000),
    sections, quotes, createdAt, updatedAt };
}
export function validateMinistry(value: unknown): MinistryState {
  const state = object(value);
  if (state.schemaVersion !== 1 || !Number.isSafeInteger(state.revision) || Number(state.revision) < 0 || Number(state.revision) >= Number.MAX_SAFE_INTEGER) throw new Error('Unsupported ministry backup version or revision.');
  if (!Array.isArray(state.outlines) || state.outlines.length > 100 || !Array.isArray(state.templates) || state.templates.length > 20) throw new Error('Keep at most 100 outlines and 20 personal templates.');
  const outlines = state.outlines.map(validateMinistryOutline), templates = state.templates.map(validateMinistryOutline);
  if (new Set([...outlines, ...templates].map(item => item.id)).size !== outlines.length + templates.length) throw new Error('Duplicate ministry record identifiers.');
  const result: MinistryState = { schemaVersion: 1, revision: Number(state.revision), outlines, templates };
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > MAX_MINISTRY_BACKUP_BYTES) throw new Error('The ministry workspace exceeds its 12 MB limit. Export and remove older records first.');
  return result;
}
export function ministryBackup(state: MinistryState): string {
  const output = JSON.stringify({ kind: 'adigun-ministry-workspace', version: 1, workspace: { ...validateMinistry(state), revision: 0 } });
  if (new TextEncoder().encode(output).byteLength > MAX_MINISTRY_BACKUP_BYTES) throw new Error('The ministry backup exceeds 12 MB. Export individual outlines and remove older records first.');
  return output;
}
export function parseMinistryBackup(raw: string): MinistryState {
  if (new TextEncoder().encode(raw).byteLength > MAX_MINISTRY_BACKUP_BYTES) throw new Error('Choose a ministry backup smaller than 12 MB.');
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error('The selected backup is not valid JSON.'); }
  const backup = object(parsed);
  if (backup.kind !== 'adigun-ministry-workspace' || backup.version !== 1) throw new Error('Choose an Adigun ministry workspace backup.');
  return { ...validateMinistry(backup.workspace), revision: 0 };
}
export function previewMinistryImport(current: MinistryState, incoming: MinistryState) {
  validateMinistry(current); validateMinistry(incoming);
  let added = 0, identical = 0, conflicts = 0;
  for (const key of ['outlines', 'templates'] as const) for (const item of incoming[key]) {
    const existing = current[key].find(row => row.id === item.id);
    if (!existing) added++; else if (JSON.stringify(existing) === JSON.stringify(item)) identical++; else conflicts++;
  }
  return { added, identical, conflicts };
}
export function mergeMinistry(current: MinistryState, incoming: MinistryState, conflict: 'keep-device' | 'use-backup'): MinistryState {
  validateMinistry(current); validateMinistry(incoming);
  const merge = (key: 'outlines' | 'templates') => {
    const items = new Map(current[key].map(item => [item.id, item]));
    for (const item of incoming[key]) if (!items.has(item.id) || conflict === 'use-backup') items.set(item.id, item);
    return [...items.values()];
  };
  return validateMinistry({ ...current, outlines: merge('outlines'), templates: merge('templates') });
}
export function calendarOutlines(outlines: MinistryOutline[]): MinistryOutline[] {
  return outlines.filter(item => item.scheduledDate).slice().sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || a.title.localeCompare(b.title));
}

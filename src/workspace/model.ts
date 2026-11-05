import { isReference } from '../domain.ts';
import type { Reference } from '../types';
import { MAX_WORKSPACE_AUDIO_BYTES, validateRetellingRecording } from './retelling-media.ts';
import type { RetellingRecording } from './retelling-media';

export type WorkspaceTab = 'prayer' | 'collections' | 'memory' | 'plans' | 'reflections';
export interface EntryBase { id: string; createdAt: string; updatedAt: string }
export interface PrayerRevision { at: string; title: string; text: string; reflection: string; outcome: string }
export interface PrayerEntry extends EntryBase { title: string; text: string; category: string; tags: string[]; refs: Reference[]; reflection: string; outcome: string; followUp: string; history: PrayerRevision[] }
export interface BoardNote extends EntryBase { text: string; refs: Reference[]; links: string[]; history: { at: string; text: string }[] }
export interface StudyBoard extends EntryBase { title: string; folder: string; tags: string[]; refs: Reference[]; notes: BoardNote[] }
export type MemoryGrade = 'again' | 'hard' | 'good';
export interface MemoryReview { at: string; grade: MemoryGrade; intervalDays: number }
export interface MemoryRetelling { at: string; text: string; id?: string; recording?: RetellingRecording }
export interface MemoryCard extends EntryBase { ref: Reference; timeZone: string; dueDate: string; intervalDays: number; successfulReviews: number; lapses: number; contextNotes: string; history: MemoryReview[]; retellings: MemoryRetelling[] }
export type PlanKind = 'whole-bible' | 'new-testament' | 'gospels' | 'book' | 'custom' | 'family' | 'language' | 'memorization';
export interface PlanSession { id: string; ref: Reference; scheduledDate: string; completedAt?: string }
export interface ReadingPlan extends EntryBase { title: string; kind: PlanKind; editionId: string; timeZone: string; startDate: string; weekdays: number[]; sessionsPerDay: number; paused: boolean; sessions: PlanSession[]; history: { sessionId: string; at: string; action: 'completed' | 'reopened' }[] }
export type ReflectionKind = 'question' | 'interpretation' | 'application' | 'reconciliation';
export type QuestionState = 'unresolved' | 'researched' | 'revisited' | 'answered';
export interface ReflectionEntry extends EntryBase { title: string; kind: ReflectionKind; state: QuestionState; text: string; reason: string; refs: Reference[]; sources: string[]; history: { at: string; text: string; reason: string; state: QuestionState; refs: Reference[]; sources: string[] }[] }
export interface WorkspaceState { schemaVersion: 2; revision: number; prayers: PrayerEntry[]; boards: StudyBoard[]; cards: MemoryCard[]; plans: ReadingPlan[]; reflections: ReflectionEntry[] }
export const workspaceCollections = ['prayers', 'boards', 'cards', 'plans', 'reflections'] as const;
export const emptyWorkspace = (): WorkspaceState => ({ schemaVersion: 2, revision: 0, prayers: [], boards: [], cards: [], plans: [], reflections: [] });
export const MAX_BACKUP_BYTES = 12 * 1024 * 1024;
export function newEntryBase(now = new Date()): EntryBase { return { id: crypto.randomUUID(), createdAt: now.toISOString(), updatedAt: now.toISOString() }; }
export function explicitReference(ref: Reference): Reference { return { bookId: ref.bookId, chapter: ref.chapter, verse: ref.verse, ...(ref.endVerse !== undefined ? { endVerse: ref.endVerse } : {}), editionId: ref.editionId || 'eng-web' }; }
export function referenceLabel(ref: Reference) { return `${ref.bookId} ${ref.chapter}:${ref.verse}${ref.endVerse && ref.endVerse !== ref.verse ? `–${ref.endVerse}` : ''} · ${ref.editionId || 'eng-web'}`; }
export interface InterpretationChallengeDraft { observation: string; context: string; alternatives: string; uncertainty: string; sources: string }
function challengeField(value: unknown, label: string, required = false): string {
  if (typeof value !== 'string' || value.length > 4000 || (required && !value.trim())) throw new Error(`Invalid interpretation challenge ${label}.`);
  return value.trim();
}
export function createInterpretationChallenge(ref: Reference, draft: InterpretationChallengeDraft, now = new Date()): ReflectionEntry {
  const observation = challengeField(draft.observation, 'observation', true);
  const context = challengeField(draft.context, 'context');
  const alternatives = challengeField(draft.alternatives, 'alternative readings');
  const uncertainty = challengeField(draft.uncertainty, 'uncertainty');
  const sourceText = challengeField(draft.sources, 'sources');
  const sources = [...new Set(sourceText.split('\n').map(value => value.trim()).filter(Boolean))];
  if (sources.length > 20 || sources.some(value => value.length > 500)) throw new Error('Use at most 20 sources, each no longer than 500 characters.');
  const text = [
    `Observation — what the passage says\n${observation}`,
    context ? `Context — details that matter\n${context}` : '',
    alternatives ? `Alternative readings to consider\n${alternatives}` : '',
  ].filter(Boolean).join('\n\n');
  if (text.length > 20000) throw new Error('This interpretation challenge is too long to save.');
  return { ...newEntryBase(now), title:`Interpretation challenge · ${referenceLabel(ref)}`, kind:'interpretation', state:'unresolved',
    text, reason:uncertainty, refs:[explicitReference(ref)], sources, history:[] };
}
export function parseTags(value: string) { return [...new Set(value.split(',').map(x => x.trim()).filter(Boolean))].slice(0, 30); }
function record(value: unknown, label: string): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${label}.`); return value as Record<string, unknown>; }
function text(value: unknown, label: string, max = 20000, allowEmpty = true): string { if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())) throw new Error(`Invalid ${label}.`); return value; }
function count(value: unknown, label: string, max = 1000000) { if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > max) throw new Error(`Invalid ${label}.`); return Number(value); }
function array<T>(value: unknown, label: string, read: (item: unknown) => T, max = 5000): T[] { if (!Array.isArray(value) || value.length > max) throw new Error(`Invalid ${label}.`); return value.map(read); }
function choice<T extends string>(value: unknown, options: readonly T[], label: string): T { if (!options.includes(value as T)) throw new Error(`Invalid ${label}.`); return value as T; }
function timestamp(value: unknown, label: string): string { const s = text(value, label, 40, false); if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(s) || !Number.isFinite(Date.parse(s)) || !validDate(s.slice(0, 10)) || Number(s.slice(11, 13)) > 23) throw new Error(`Invalid ${label}.`); return s; }
export function validDate(value: string) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const date = new Date(`${value}T12:00:00Z`); return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value; }
function day(value: unknown, label: string, allowEmpty = false): string { const s = text(value, label, 10); if (!(allowEmpty && s === '') && !validDate(s)) throw new Error(`Invalid ${label}.`); return s; }
export function validTimeZone(value: string) { try { new Intl.DateTimeFormat('en', { timeZone: value }).format(); return value.length < 100; } catch { return false; } }
function timeZone(value: unknown): string { const s = text(value, 'timezone', 100, false); if (!validTimeZone(s)) throw new Error('Invalid timezone.'); return s; }
function id(value: unknown): string { const s = text(value, 'record ID', 150, false); if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(s)) throw new Error('Invalid record ID.'); return s; }
function base(r: Record<string, unknown>): EntryBase { return { id: id(r.id), createdAt: timestamp(r.createdAt, 'creation date'), updatedAt: timestamp(r.updatedAt, 'update date') }; }
function ref(value: unknown): Reference { if (!isReference(value) || !value.editionId) throw new Error('Every workspace passage needs a valid reference and explicit edition ID.'); return explicitReference(value); }
function refs(value: unknown) { return array(value, 'passage links', ref, 2000); }
function tags(value: unknown) { return [...new Set(array(value, 'tags', v => text(v, 'tag', 100, false), 30))]; }
function unique<T extends { id: string }>(items: T[], label: string) { if (new Set(items.map(i => i.id)).size !== items.length) throw new Error(`Duplicate IDs in ${label}.`); return items; }
function prayer(value: unknown): PrayerEntry { const r = record(value, 'prayer'); return { ...base(r), title: text(r.title, 'prayer title', 200, false), text: text(r.text, 'prayer text'), category: text(r.category, 'category', 100), tags: tags(r.tags), refs: refs(r.refs), reflection: text(r.reflection, 'reflection'), outcome: text(r.outcome, 'personal outcome', 100), followUp: day(r.followUp, 'follow-up date', true), history: array(r.history, 'prayer history', v => { const h = record(v, 'prayer revision'); return { at: timestamp(h.at, 'revision date'), title: text(h.title, 'revision title', 200), text: text(h.text, 'revision text'), reflection: text(h.reflection, 'revision reflection'), outcome: text(h.outcome, 'revision outcome', 100) }; }, 50) }; }
function boardNote(value: unknown): BoardNote { const r = record(value, 'board note'); return { ...base(r), text: text(r.text, 'note', 20000, false), refs: refs(r.refs), links: array(r.links, 'cross-links', id, 100), history: array(r.history, 'note history', v => { const h = record(v, 'note revision'); return { at: timestamp(h.at, 'revision date'), text: text(h.text, 'revision text') }; }, 50) }; }
function board(value: unknown): StudyBoard { const r = record(value, 'board'); return { ...base(r), title: text(r.title, 'board title', 200, false), folder: text(r.folder, 'folder', 100), tags: tags(r.tags), refs: refs(r.refs), notes: unique(array(r.notes, 'board notes', boardNote, 1000), 'board notes') }; }
function memory(value: unknown): MemoryCard { const r = record(value, 'memory card'); return { ...base(r), ref: ref(r.ref), timeZone: timeZone(r.timeZone), dueDate: day(r.dueDate, 'review date'), intervalDays: count(r.intervalDays, 'review interval', 365), successfulReviews: count(r.successfulReviews, 'review count'), lapses: count(r.lapses, 'review count'), contextNotes: text(r.contextNotes, 'context notes'), history: array(r.history, 'review history', v => { const h = record(v, 'review'); return { at: timestamp(h.at, 'review timestamp'), grade: choice(h.grade, ['again', 'hard', 'good'], 'review choice'), intervalDays: count(h.intervalDays, 'review interval', 365) }; }, 20000), retellings: r.retellings === undefined ? [] : array(r.retellings, 'retellings', v => { const item = record(v, 'retelling'); const recording = item.recording === undefined ? undefined : validateRetellingRecording(item.recording); const entryId = item.id === undefined ? undefined : id(item.id); if (recording && (recording.id !== entryId || referenceLabel(recording.source.ref) !== referenceLabel(ref(r.ref)))) throw new Error('The recording must belong to this exact retelling and passage.'); return { at: timestamp(item.at, 'retelling timestamp'), text: text(item.text, 'retelling text', 5000, !!recording), ...(entryId ? { id:entryId } : {}), ...(recording ? { recording } : {}) }; }, 50) }; }
function plan(value: unknown): ReadingPlan { const r = record(value, 'reading plan'); const editionId = text(r.editionId, 'edition ID', 100, false); if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(editionId)) throw new Error('Invalid plan edition.'); const weekdays = array(r.weekdays, 'weekdays', v => count(v, 'weekday', 6), 7); const sessionsPerDay = count(r.sessionsPerDay, 'sessions per day', 10); if (!weekdays.length || new Set(weekdays).size !== weekdays.length || sessionsPerDay < 1 || typeof r.paused !== 'boolean') throw new Error('Invalid plan schedule.'); const sessions = unique(array(r.sessions, 'plan sessions', v => { const s = record(v, 'plan session'); const reference = ref(s.ref); if (reference.editionId !== editionId) throw new Error('Plan passage edition does not match the plan.'); return { id: id(s.id), ref: reference, scheduledDate: day(s.scheduledDate, 'session date'), ...(s.completedAt !== undefined ? { completedAt: timestamp(s.completedAt, 'completion date') } : {}) }; }, 3000), 'plan sessions'); const sessionIds = new Set(sessions.map(s => s.id)); return { ...base(r), title: text(r.title, 'plan title', 200, false), kind: choice(r.kind, ['whole-bible', 'new-testament', 'gospels', 'book', 'custom', 'family', 'language', 'memorization'], 'plan kind'), editionId, timeZone: timeZone(r.timeZone), startDate: day(r.startDate, 'plan start date'), weekdays, sessionsPerDay, paused: r.paused, sessions, history: array(r.history, 'completion history', v => { const h = record(v, 'completion record'); const sessionId = id(h.sessionId); if (!sessionIds.has(sessionId)) throw new Error('Completion history references an unknown session.'); return { sessionId, at: timestamp(h.at, 'completion timestamp'), action: choice(h.action, ['completed', 'reopened'], 'completion action') }; }, 100000) }; }
function reflection(value: unknown): ReflectionEntry { const r = record(value, 'reflection'); return { ...base(r), title: text(r.title, 'reflection title', 200, false), kind: choice(r.kind, ['question', 'interpretation', 'application', 'reconciliation'], 'reflection kind'), state: choice(r.state, ['unresolved', 'researched', 'revisited', 'answered'], 'question state'), text: text(r.text, 'reflection text'), reason: text(r.reason, 'reason for change'), refs: refs(r.refs), sources: array(r.sources, 'sources', v => text(v, 'source', 1000, false), 100), history: array(r.history, 'reflection history', v => { const h = record(v, 'reflection revision'); return { at: timestamp(h.at, 'revision date'), text: text(h.text, 'revision text'), reason: text(h.reason, 'revision reason'), state: choice(h.state, ['unresolved', 'researched', 'revisited', 'answered'], 'revision state'), refs: h.refs === undefined ? [] : refs(h.refs), sources: h.sources === undefined ? [] : array(h.sources, 'revision sources', v => text(v, 'source', 1000, false), 100) }; }, 50) }; }
export function validateWorkspace(value: unknown): WorkspaceState {
  const r = record(value, 'workspace');
  if (r.schemaVersion !== 1 && r.schemaVersion !== 2) throw new Error('Unsupported workspace version. Existing device data has not been replaced.');
  const result: WorkspaceState = { schemaVersion: 2, revision: count(r.revision, 'workspace revision', Number.MAX_SAFE_INTEGER), prayers: unique(array(r.prayers, 'prayers', prayer), 'prayers'), boards: unique(array(r.boards, 'boards', board, 500), 'boards'), cards: unique(array(r.cards, 'memory cards', memory), 'memory cards'), plans: unique(array(r.plans, 'plans', plan, 100), 'plans'), reflections: unique(array(r.reflections, 'reflections', reflection), 'reflections') };
  unique(result.boards.flatMap(board => board.notes), 'workspace notes');
  unique(result.cards.flatMap(card => card.retellings).filter((item): item is MemoryRetelling & { id: string } => !!item.id), 'retelling entries');
  const recordings = workspaceRecordings(result);
  if (r.schemaVersion === 1 && recordings.length) throw new Error('Legacy workspace data cannot contain recording attachments. Use a complete version 2 backup.');
  if (recordings.reduce((total, item) => total + item.bytes, 0) > MAX_WORKSPACE_AUDIO_BYTES) throw new Error('Retelling recordings would exceed the 32 MiB device-workspace limit. Export before removing an older recording.');
  const backupSize = new TextEncoder().encode(JSON.stringify({ format: 'adigun-aibible-workspace', schemaVersion: 2, exportedAt: '2000-01-01T00:00:00.000Z', state: result, media: [] }, null, 2)).byteLength;
  if (backupSize > MAX_BACKUP_BYTES) throw new Error('This workspace exceeds the 12 MB portable-backup limit. The change was not saved; export your existing records before removing items.');
  return result;
}
export function workspaceRecordings(state: WorkspaceState): RetellingRecording[] { return state.cards.flatMap(card => card.retellings.flatMap(item => item.recording ? [item.recording] : [])); }
export interface ImportPreview { incoming: WorkspaceState; added: number; identical: number; conflicts: number }
export function summarizeWorkspaceImport(current: WorkspaceState, incoming: WorkspaceState): ImportPreview {
  let added = 0; let identical = 0; let conflicts = 0;
  for (const key of workspaceCollections) {
    const byId = new Map<string, EntryBase>(current[key].map(i => [i.id, i]));
    for (const item of incoming[key]) { const existing = byId.get(item.id); if (!existing) added++; else if (JSON.stringify(existing) === JSON.stringify(item)) identical++; else conflicts++; }
  }
  return { incoming, added, identical, conflicts };
}
/** Compatibility helper for existing text-only consumers. Complete media imports use retelling-backup.ts. */
export function previewImport(current: WorkspaceState, raw: string): ImportPreview {
  if (new TextEncoder().encode(raw).byteLength > MAX_BACKUP_BYTES) throw new Error('Workspace text backups must be 12 MB or smaller.');
  let value: unknown; try { value = JSON.parse(raw); } catch { throw new Error('This file is not valid JSON.'); }
  const r = record(value, 'workspace backup');
  if (r.format !== 'adigun-aibible-workspace' || (r.schemaVersion !== 1 && r.schemaVersion !== 2)) throw new Error('Choose an Adigun personal-workspace backup. The reader backup is imported in Saved study.');
  const incoming = validateWorkspace(r.state);
  if (workspaceRecordings(incoming).length || (Array.isArray(r.media) && r.media.length)) throw new Error('Use the complete audio-backup importer for recording attachments.');
  return summarizeWorkspaceImport(current, incoming);
}
export function mergeWorkspace(current: WorkspaceState, incoming: WorkspaceState, conflicts: 'keep-device' | 'use-import' = 'keep-device'): WorkspaceState {
  const result: Record<string, unknown> = { schemaVersion: 2, revision: current.revision };
  for (const key of workspaceCollections) { const items = new Map<string, EntryBase>(current[key].map(i => [i.id, i])); for (const item of incoming[key]) if (!items.has(item.id) || conflicts === 'use-import') items.set(item.id, item); result[key] = [...items.values()]; }
  return validateWorkspace(result);
}
export function workspaceBackup(state: WorkspaceState, now = new Date()) {
  const checked = validateWorkspace(state);
  if (workspaceRecordings(checked).length) throw new Error('This workspace contains recordings. Export the complete workspace backup to include their original bytes.');
  return JSON.stringify({ format:'adigun-aibible-workspace', schemaVersion:2, exportedAt:now.toISOString(), state:checked, media:[] }, null, 2);
}
export function workspaceNotebook(state: WorkspaceState) { const sections: string[] = ['# Adigun private workspace', '', 'Personal writing and passage references. This export contains no copied source corpus. Audio bytes are excluded; use the complete workspace backup to retain recordings.', '']; for (const p of state.prayers) sections.push(`## Prayer: ${p.title}`, p.text, `Category: ${p.category || 'Uncategorized'} · Tags: ${p.tags.join(', ') || 'None'}`, `Personal outcome: ${p.outcome || 'Not assigned'} · Follow up: ${p.followUp || 'Not scheduled'}`, p.reflection, p.refs.map(referenceLabel).join('\n'), ''); for (const b of state.boards) sections.push(`## Collection: ${b.title}`, `Folder: ${b.folder || 'None'} · Tags: ${b.tags.join(', ') || 'None'}`, b.refs.map(referenceLabel).join('\n'), ...b.notes.flatMap(n => [n.text, n.refs.map(referenceLabel).join('\n'), `Linked note IDs: ${n.links.join(', ') || 'None'}`, ''])); for (const r of state.reflections) sections.push(`## ${r.kind}: ${r.title}`, `Personal state: ${r.state}`, r.text, `Reason for change: ${r.reason}`, r.refs.map(referenceLabel).join('\n'), ...r.sources, ''); for (const c of state.cards) sections.push(`## Memorization: ${referenceLabel(c.ref)}`, `Due: ${c.dueDate} (${c.timeZone}) · Reviews: ${c.history.length}`, c.contextNotes, ...c.retellings.flatMap(item => [`Retelling · ${item.at}`, item.text || 'No manual transcript added.', ...(item.recording ? [`Original recording: ${item.recording.name} · ${item.recording.mimeType} · ${item.recording.bytes} bytes · SHA-256 ${item.recording.sha256}`, `Recorded against ${referenceLabel(item.recording.source.ref)} · source revision ${item.recording.source.editionSha256}`] : [])]), ''); for (const p of state.plans) sections.push(`## Plan: ${p.title}`, `${p.paused ? 'Paused' : 'Active'} · ${p.timeZone}`, ...p.sessions.map(s => `- [${s.completedAt ? 'x' : ' '}] ${s.scheduledDate}: ${referenceLabel(s.ref)}${s.completedAt ? ` (completed ${s.completedAt})` : ''}`), ''); return sections.join('\n\n'); }

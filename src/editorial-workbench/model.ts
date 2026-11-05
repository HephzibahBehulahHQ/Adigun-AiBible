import { stableStringify } from '../editorial.ts';
import type { Locale } from '../types';

export interface SourceSnapshot {
  corpus: 'bible' | 'quran'; editionId: string; editionSha256: string; referenceSystemId: string;
  workId: string; workName: string; chapter: number; start: number; end: number; editionName: string;
  sourceUrl: string; licenseUrl: string; attribution: string;
  units: { number: number; text: string; sha256: string }[];
}
export interface DraftWriting {
  title: string; text: string; proposition: string; evidenceNotes: string; locale: Locale;
  origin: 'human_authored' | 'ai_assisted'; register: 'plain' | 'genz' | 'pidgin_study';
  proposedRelationship: '' | 'shared_claim' | 'differing_claim' | 'mixed' | 'thematic';
}
export interface DraftRevision { at: string; reason: string; before: DraftWriting; after: DraftWriting }
export interface EditorialDraft {
  id: string; kind: 'comparison' | 'paraphrase'; approvalState: 'unreviewed_draft';
  sources: SourceSnapshot[]; original: DraftWriting; writing: DraftWriting; privateNotes: string;
  history: DraftRevision[]; createdAt: string; updatedAt: string; historyPrunedAt?: string;
}
export interface WorkbenchState { schemaVersion: 1; revision: number; drafts: EditorialDraft[] }
export const MAX_PACKAGE_BYTES = 12_000_000;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const fail = (message: string): never => { throw new Error(message); };
function exact(value: unknown, keys: string[], label: string): Record<string, unknown> {
  if (!object(value)) return fail(`${label} must be an object.`);
  if (Object.keys(value).some(key => !keys.includes(key))) fail(`${label} contains unsupported fields. Approval and reviewer claims cannot be imported into this authoring workspace.`);
  return value;
}
function string(value: unknown, max: number, label: string, required = false): string {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value) || (required && !value.trim())) return fail(`${label} is missing or invalid.`);
  return value;
}
function integer(value: unknown, max: number, label: string): number { return Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= max ? Number(value) : fail(`${label} is invalid.`); }
function sha(value: unknown): string { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : fail('Source checksum is missing or invalid.'); }
function id(value: unknown): string { return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(value) ? value : fail('Record identity is invalid.'); }
function date(value: unknown): string { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value ? value : fail('Record timestamp is invalid.'); }
function url(value: unknown): string { const raw = string(value, 2000, 'Source URL', true); try { if (new URL(raw).protocol === 'https:') return raw; } catch { /* Reject unsafe URLs. */ } return fail('Source URLs must use HTTPS.'); }
export function validateSnapshot(value: unknown): SourceSnapshot {
  const row = exact(value, ['corpus','editionId','editionSha256','referenceSystemId','workId','workName','chapter','start','end','editionName','sourceUrl','licenseUrl','attribution','units'], 'Source snapshot');
  if (row.corpus !== 'bible' && row.corpus !== 'quran') fail('Only installed Bible and Quran sources can ground these drafts.');
  const start = integer(row.start, 300, 'First unit'), end = integer(row.end, 300, 'Last unit');
  if (end < start || end - start >= 40 || !Array.isArray(row.units) || row.units.length !== end - start + 1) fail('A source snapshot requires a complete range of 1–40 units.');
  const units = (row.units as unknown[]).map((value, index) => {
    const unit = exact(value, ['number','text','sha256'], 'Source unit');
    if (unit.number !== start + index) fail('Source unit numbers are missing, duplicated or out of order.');
    return { number: Number(unit.number), text: string(unit.text, 30000, 'Exact source text', true), sha256: sha(unit.sha256) };
  });
  const workId = id(row.workId);
  if (row.corpus === 'quran' ? workId !== 'QUR' : !/^[1-3]?[A-Z]{2,3}$/.test(workId)) fail('Source work does not match its corpus.');
  return { corpus: row.corpus as SourceSnapshot['corpus'], editionId: id(row.editionId), editionSha256: sha(row.editionSha256), referenceSystemId: string(row.referenceSystemId, 120, 'Reference system', true), workId,
    workName: string(row.workName, 200, 'Work name', true), chapter: integer(row.chapter, row.corpus === 'quran' ? 114 : 150, 'Chapter'), start, end,
    editionName: string(row.editionName, 300, 'Edition name', true), sourceUrl: url(row.sourceUrl), licenseUrl: url(row.licenseUrl), attribution: string(row.attribution, 10000, 'Attribution', true), units };
}
export function validateWriting(value: unknown): DraftWriting {
  const row = exact(value, ['title','text','proposition','evidenceNotes','locale','origin','register','proposedRelationship'], 'Draft writing');
  if (!['en','de','yo','pcm'].includes(String(row.locale))) fail('Choose a supported writing language. Gen Z is a register, not a language.');
  if (!['human_authored','ai_assisted'].includes(String(row.origin)) || !['plain','genz','pidgin_study'].includes(String(row.register)) || !['','shared_claim','differing_claim','mixed','thematic'].includes(String(row.proposedRelationship))) fail('Draft authoring metadata is invalid.');
  return { title: string(row.title, 200, 'Draft title', true), text: string(row.text, 30000, 'Draft text'), proposition: string(row.proposition, 2000, 'Proposition'), evidenceNotes: string(row.evidenceNotes, 10000, 'Evidence notes'), locale: row.locale as Locale, origin: row.origin as DraftWriting['origin'], register: row.register as DraftWriting['register'], proposedRelationship: row.proposedRelationship as DraftWriting['proposedRelationship'] };
}
export function validateDraft(value: unknown): EditorialDraft {
  const row = exact(value, ['id','kind','approvalState','sources','original','writing','privateNotes','history','createdAt','updatedAt','historyPrunedAt'], 'Editorial draft');
  if (row.approvalState !== 'unreviewed_draft') fail('This workspace accepts unreviewed author drafts only. It cannot grant or import approval.');
  if (row.kind !== 'comparison' && row.kind !== 'paraphrase') fail('Unsupported draft type.');
  if (!Array.isArray(row.sources) || row.sources.length < 1 || row.sources.length > 8) fail('A draft needs 1–8 installed source passages.');
  const sources = row.sources.map(validateSnapshot);
  if (!sources.some(source => source.corpus === 'bible') || (row.kind === 'comparison' && !sources.some(source => source.corpus === 'quran')) || (row.kind === 'paraphrase' && sources.some(source => source.corpus !== 'bible'))) fail('Comparison drafts need both Bible and Quran evidence; paraphrases can use licensed Bible sources only.');
  const sourceKeys = sources.map(source => `${source.editionId}:${source.workId}:${source.chapter}:${source.start}:${source.end}`);
  if (new Set(sourceKeys).size !== sources.length) fail('Duplicate source passages.');
  if (!Array.isArray(row.history) || row.history.length > 40) fail('Keep at most 40 corrections per draft. Export a backup before deliberately clearing older history.');
  const createdAt = date(row.createdAt), updatedAt = date(row.updatedAt), original = validateWriting(row.original), writing = validateWriting(row.writing);
  if (createdAt > updatedAt) fail('Draft timestamps are reversed.');
  const history = row.history.map(value => { const entry = exact(value, ['at','reason','before','after'], 'Correction history'); return { at: date(entry.at), reason: string(entry.reason, 1000, 'Correction reason', true), before: validateWriting(entry.before), after: validateWriting(entry.after) }; });
  for (let index = 0; index < history.length; index++) {
    if (history[index].at < createdAt || history[index].at > updatedAt || (index && history[index].at < history[index - 1].at) || (index && stableStringify(history[index].before) !== stableStringify(history[index - 1].after))) fail('Correction history is inconsistent.');
  }
  if (history.length && stableStringify(history[history.length - 1].after) !== stableStringify(writing)) fail('Current writing does not match its correction history.');
  const historyPrunedAt = row.historyPrunedAt === undefined ? undefined : date(row.historyPrunedAt);
  if (historyPrunedAt && (historyPrunedAt < createdAt || historyPrunedAt > updatedAt)) fail('History retention timestamp is invalid.');
  if (!historyPrunedAt && stableStringify(history[0]?.before ?? writing) !== stableStringify(original)) fail('Original writing does not match its correction history.');
  return { id: id(row.id), kind: row.kind, approvalState: 'unreviewed_draft', sources, original, writing, privateNotes: string(row.privateNotes, 30000, 'Private author notes'), history, createdAt, updatedAt, ...(historyPrunedAt ? { historyPrunedAt } : {}) };
}
export const emptyWorkbench = (): WorkbenchState => ({ schemaVersion: 1, revision: 0, drafts: [] });
export function validateWorkbench(value: unknown): WorkbenchState {
  const row = exact(value, ['schemaVersion','revision','drafts'], 'Workbench');
  if (row.schemaVersion !== 1 || !Number.isSafeInteger(row.revision) || Number(row.revision) < 0 || Number(row.revision) >= Number.MAX_SAFE_INTEGER || !Array.isArray(row.drafts) || row.drafts.length > 80) fail('Workbench version, revision or draft count is invalid.');
  const drafts = (row.drafts as unknown[]).map(validateDraft);
  if (new Set(drafts.map(draft => draft.id)).size !== drafts.length) fail('Duplicate draft identities.');
  return { schemaVersion: 1, revision: Number(row.revision), drafts };
}
export function newEditorialDraft(kind: EditorialDraft['kind'], sources: SourceSnapshot[], locale: Locale = 'en', now = new Date()): EditorialDraft {
  const writing: DraftWriting = { title: kind === 'comparison' ? 'Untitled comparison proposal' : 'Untitled study paraphrase', text: '', proposition: '', evidenceNotes: '', locale, origin: 'human_authored', register: 'plain', proposedRelationship: '' };
  return validateDraft({ id: crypto.randomUUID(), kind, approvalState: 'unreviewed_draft', sources, original: writing, writing, privateNotes: '', history: [], createdAt: now.toISOString(), updatedAt: now.toISOString() });
}
export function reviseDraft(value: EditorialDraft, writing: DraftWriting, privateNotes: string, reason: string, now = new Date()): EditorialDraft {
  const before = validateDraft(value), next = validateWriting(writing), changed = stableStringify(before.writing) !== stableStringify(next), at = now.toISOString();
  return validateDraft({ ...before, writing: next, privateNotes, updatedAt: at, history: changed ? [...before.history, { at, reason, before: before.writing, after: next }] : before.history });
}
export function pruneHistory(value: EditorialDraft, now = new Date()): EditorialDraft { const at = now.toISOString(); return validateDraft({ ...value, history: [], historyPrunedAt: at, updatedAt: at }); }
export function workbenchBackup(value: WorkbenchState): string { return JSON.stringify({ kind: 'adigun-editorial-private-backup', schemaVersion: 1, drafts: validateWorkbench(value).drafts }, null, 2); }
export function reviewPackage(value: EditorialDraft): string {
  const draft = validateDraft(value);
  if (!draft.writing.text.trim() || (draft.kind === 'comparison' && (!draft.writing.proposition.trim() || !draft.writing.proposedRelationship))) fail('Add draft writing, a proposition and an author-proposed relationship before exporting a comparison for review.');
  return JSON.stringify({ kind: 'adigun-editorial-review-package', schemaVersion: 1, drafts: [{ ...draft, privateNotes: '' }] }, null, 2);
}
export function parseWorkbenchPackage(raw: string): WorkbenchState {
  if (new TextEncoder().encode(raw).byteLength > MAX_PACKAGE_BYTES) fail('Choose a draft package smaller than 12 MB.');
  let parsed: unknown; try { parsed = JSON.parse(raw); } catch { return fail('The selected package is not valid JSON.'); }
  const envelope = exact(parsed, ['kind','schemaVersion','drafts'], 'Draft package');
  if (!['adigun-editorial-private-backup','adigun-editorial-review-package'].includes(String(envelope.kind)) || envelope.schemaVersion !== 1) fail('Choose an Adigun editorial private backup or draft review package.');
  return validateWorkbench({ schemaVersion: 1, revision: 0, drafts: envelope.drafts });
}
export function previewDraftImport(current: WorkbenchState, incoming: WorkbenchState) {
  let added = 0, identical = 0, conflicts = 0;
  for (const draft of incoming.drafts) { const found = current.drafts.find(row => row.id === draft.id); if (!found) added++; else if (stableStringify(found) === stableStringify(draft)) identical++; else conflicts++; }
  return { added, identical, conflicts };
}
/** Existing IDs never get overwritten by an import. Conflicting drafts become explicit copies. */
export function mergeDraftImport(current: WorkbenchState, incoming: WorkbenchState): WorkbenchState {
  const drafts = [...validateWorkbench(current).drafts];
  for (const draft of validateWorkbench(incoming).drafts) { const found = drafts.find(row => row.id === draft.id); if (!found) drafts.push(draft); else if (stableStringify(found) !== stableStringify(draft)) drafts.push({ ...draft, id: crypto.randomUUID() }); }
  return validateWorkbench({ ...current, drafts });
}
export function writingDiff(original: DraftWriting, edited: DraftWriting): { field: keyof DraftWriting; before: string; after: string }[] {
  return (Object.keys(original) as (keyof DraftWriting)[]).filter(key => original[key] !== edited[key]).map(field => ({ field, before: original[field], after: edited[field] }));
}

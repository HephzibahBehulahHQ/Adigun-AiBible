import type { Book, Edition, Reference, Verse } from '../types';

export interface InterpretationSource {
  id: string; author: string; tradition: string; title: string; locator: string; url: string;
  edition: string; quote: string; summary: string; limits: string[];
  supporting: { label: string; reference: Reference; reason: string }[];
  rights: string; rightsSources: { label: string; url: string }[];
  /** SHA-256 of the exact UTF-8 short quotation, not a hash or approval of the remote page. */
  sourceSha256: string;
}
export interface BlindChallenge {
  id: string; version: string; title: string; question: string; passage: Reference;
  contextStart: number; contextEnd: number; aiReviewStatus: 'draft'; humanReviewStatus: 'pending';
  sources: InterpretationSource[]; diversityNotice: string;
}
export interface ReflectionRevision {
  at: string; before: string; after: string; initialPreference: string; finalPreference: string; revealedAt: string | null;
}
export interface BlindReflection {
  id: string; challengeId: string; challengeVersion: string; editionId: string; sourceSha256: string;
  order: string[]; before: string; initialPreference: string; revealedAt: string | null;
  after: string; finalPreference: string; createdAt: string; updatedAt: string;
  history: ReflectionRevision[];
}
export interface InterpretationNotebook { kind: 'adigun-blind-interpretation'; schemaVersion: 1; revision: number; reflections: BlindReflection[] }
export const MAX_NOTEBOOK_BYTES = 4_000_000;
export const MAX_REFLECTIONS = 100;
export const MAX_HISTORY = 30;
export const MAX_REASONING = 6000;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max = MAX_REASONING): value is string => typeof value === 'string' && value.length <= max;
const required = (value: unknown, max = MAX_REASONING): value is string => text(value, max) && !!value.trim();
const id = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{1,99}$/.test(value);
const sha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const date = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const integer = (value: unknown, min = 1, max = 1000): value is number => Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max;
const https = (value: unknown): value is string => { try { if (!text(value, 2000)) return false; const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; } };
const only = (value: Record<string, unknown>, names: string[]) => Object.keys(value).every(key => names.includes(key));
function reference(value: unknown): value is Reference {
  if (!record(value) || typeof value.bookId !== 'string' || !/^[1-3]?[A-Z]{2,3}$/.test(value.bookId) || !integer(value.chapter) || !integer(value.verse)) return false;
  return (value.endVerse === undefined || (integer(value.endVerse) && value.endVerse >= value.verse && value.endVerse - value.verse <= 200)) && (value.editionId === undefined || id(value.editionId));
}
export function validateChallenge(value: unknown): BlindChallenge {
  if (!record(value) || !id(value.id) || !id(value.version) || !required(value.title, 300) || !required(value.question, 1500) || value.aiReviewStatus !== 'draft' || value.humanReviewStatus !== 'pending' || !Array.isArray(value.sources) || value.sources.length < 2 || value.sources.length > 10 || !required(value.diversityNotice)) throw new Error('Interpretation research preview is invalid.');
  const p = value.passage;
  if (!reference(p) || !integer(value.contextStart) || !integer(value.contextEnd) || value.contextStart > p.verse || value.contextEnd < (p.endVerse ?? p.verse) || value.contextEnd - value.contextStart > 200) throw new Error('Interpretation passage reference is invalid.');
  const seen = new Set<string>();
  for (const source of value.sources) {
    if (!record(source) || !id(source.id) || seen.has(source.id) || !https(source.url) || !sha(source.sourceSha256)) throw new Error('Interpretation source identity is invalid.');
    seen.add(source.id);
    for (const field of ['author','tradition','title','locator','edition','quote','summary','rights']) if (!required(source[field])) throw new Error(`Interpretation source lacks ${field}.`);
    if ((source.quote as string).trim().split(/\s+/).length > 25 || !Array.isArray(source.limits) || !source.limits.length || source.limits.length > 10 || source.limits.some(item => !required(item)) || !Array.isArray(source.rightsSources) || !source.rightsSources.length || source.rightsSources.length > 12 || source.rightsSources.some(item => !record(item) || !required(item.label, 300) || !https(item.url))) throw new Error('Interpretation source evidence is incomplete.');
    if (!Array.isArray(source.supporting) || !source.supporting.length || source.supporting.length > 10 || source.supporting.some(item => !record(item) || !required(item.label, 300) || !required(item.reason) || !reference(item.reference))) throw new Error('Interpretation supporting reference is invalid.');
  }
  return value as unknown as BlindChallenge;
}
export function challengePassage(book: Book, edition: Edition, challenge: BlindChallenge): { edition: Edition; verses: Verse[]; context: Verse[]; missing: number[] } {
  validateChallenge(challenge);
  if (!sha(edition.sha256) || !id(edition.id) || (challenge.passage.editionId && challenge.passage.editionId !== edition.id)) throw new Error('The challenge needs the exact verified Bible edition.');
  if (book.id !== challenge.passage.bookId) throw new Error('The source book does not match the interpretation challenge.');
  const chapter = book.chapters.find(item => item.number === challenge.passage.chapter);
  if (!chapter) throw new Error('This challenge chapter is absent from the selected edition.');
  const first = challenge.passage.verse, last = challenge.passage.endVerse ?? first;
  const verses = chapter.verses.filter(item => item.number >= first && item.number <= last);
  const missing = Array.from({ length: last - first + 1 }, (_, index) => first + index).filter(number => !verses.some(item => item.number === number));
  return { edition, verses, context: chapter.verses.filter(item => item.number >= challenge.contextStart && item.number <= challenge.contextEnd), missing };
}
export function emptyInterpretationNotebook(): InterpretationNotebook { return { kind: 'adigun-blind-interpretation', schemaVersion: 1, revision: 0, reflections: [] }; }
function validReasoning(value: Record<string, unknown>, order: string[]): boolean {
  return text(value.before) && text(value.after) && typeof value.initialPreference === 'string' && typeof value.finalPreference === 'string' && ['undecided', ...order].includes(value.initialPreference) && ['undecided', ...order].includes(value.finalPreference)
    && (value.revealedAt === null || (date(value.revealedAt) && !!value.before.trim()))
    && (value.revealedAt !== null || (!value.after.trim() && value.finalPreference === 'undecided'));
}
export function validateInterpretationNotebook(value: unknown): InterpretationNotebook {
  if (!record(value) || !only(value, ['kind','schemaVersion','revision','reflections']) || value.kind !== 'adigun-blind-interpretation' || value.schemaVersion !== 1 || !integer(value.revision, 0, Number.MAX_SAFE_INTEGER) || !Array.isArray(value.reflections) || value.reflections.length > MAX_REFLECTIONS) throw new Error('Blind interpretation notebook is invalid. Existing records are unchanged.');
  const ids = new Set<string>();
  for (const item of value.reflections) {
    if (!record(item) || !only(item, ['id','challengeId','challengeVersion','editionId','sourceSha256','order','before','initialPreference','revealedAt','after','finalPreference','createdAt','updatedAt','history']) || !id(item.id) || ids.has(item.id) || !id(item.challengeId) || !id(item.challengeVersion) || !id(item.editionId) || !sha(item.sourceSha256) || !Array.isArray(item.order) || item.order.length < 2 || item.order.length > 10 || item.order.some(source => !id(source)) || new Set(item.order).size !== item.order.length) throw new Error('Blind interpretation record identity is invalid.');
    ids.add(item.id);
    if (!validReasoning(item, item.order) || !date(item.createdAt) || !date(item.updatedAt) || item.updatedAt < item.createdAt || (item.revealedAt !== null && ((item.revealedAt as string) < item.createdAt || (item.revealedAt as string) > item.updatedAt)) || !Array.isArray(item.history) || item.history.length > MAX_HISTORY) throw new Error('Blind interpretation reasoning or reveal state is invalid.');
    let lastAt = item.createdAt;
    let firstReveal: Record<string, unknown> | undefined;
    for (const revision of item.history) {
      if (!record(revision) || !only(revision, ['at','before','after','initialPreference','finalPreference','revealedAt']) || !date(revision.at) || revision.at < lastAt || revision.at > item.updatedAt || !validReasoning(revision, item.order) || (revision.revealedAt !== null && ((revision.revealedAt as string) < item.createdAt || (revision.revealedAt as string) > revision.at))) throw new Error('Blind interpretation revision history is invalid.');
      if (firstReveal && (revision.before !== firstReveal.before || revision.initialPreference !== firstReveal.initialPreference || revision.revealedAt !== firstReveal.revealedAt)) throw new Error('Before-reveal reasoning cannot be rewritten in history.');
      if (revision.revealedAt !== null) firstReveal ||= revision;
      lastAt = revision.at;
    }
    if (firstReveal && (item.before !== firstReveal.before || item.initialPreference !== firstReveal.initialPreference || item.revealedAt !== firstReveal.revealedAt)) throw new Error('Before-reveal reasoning cannot be rewritten after reveal.');
  }
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_NOTEBOOK_BYTES) throw new Error('The interpretation notebook exceeds its 4 MB backup limit. Export existing records and remove an older reflection before saving more.');
  return structuredClone(value) as unknown as InterpretationNotebook;
}
export function parseInterpretationBackup(raw: string): InterpretationNotebook {
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).byteLength > MAX_NOTEBOOK_BYTES) throw new Error('Choose an interpretation backup smaller than 4 MB.');
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('Interpretation backup is not valid JSON. Existing records are unchanged.'); }
  return validateInterpretationNotebook(value);
}
export function validateReflectionSource(reflection: BlindReflection, challenge: BlindChallenge, edition: Edition): void {
  validateInterpretationNotebook({ ...emptyInterpretationNotebook(), reflections: [reflection] });
  if (reflection.challengeId !== challenge.id || reflection.challengeVersion !== challenge.version || reflection.editionId !== edition.id || reflection.sourceSha256 !== edition.sha256 || reflection.order.length !== challenge.sources.length || reflection.order.some(source => !challenge.sources.some(item => item.id === source))) throw new Error('This reflection belongs to a different challenge or source revision. Its saved notes remain available; start a new reflection to use this source.');
}
export function shuffledSourceOrder(challenge: BlindChallenge): string[] {
  const result = challenge.sources.map(source => source.id);
  for (let i = result.length - 1; i > 0; i--) {
    const limit = Math.floor(0x100000000 / (i + 1)) * (i + 1);
    let value: number;
    do { value = crypto.getRandomValues(new Uint32Array(1))[0]; } while (value >= limit);
    const j = value % (i + 1); [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function newBlindReflection(challenge: BlindChallenge, edition: Edition, order = shuffledSourceOrder(challenge), now = new Date().toISOString()): BlindReflection {
  validateChallenge(challenge);
  if (!sha(edition.sha256) || order.length !== challenge.sources.length || new Set(order).size !== order.length || order.some(source => !challenge.sources.some(item => item.id === source))) throw new Error('A verified edition and complete source order are required.');
  const reflection = { id: crypto.randomUUID(), challengeId: challenge.id, challengeVersion: challenge.version, editionId: edition.id, sourceSha256: edition.sha256, order: [...order], before: '', initialPreference: 'undecided', revealedAt: null, after: '', finalPreference: 'undecided', createdAt: now, updatedAt: now, history: [] };
  validateReflectionSource(reflection, challenge, edition);
  return reflection;
}
export function assertPreservedReflection(previous: BlindReflection, next: BlindReflection): void {
  if (previous.id !== next.id || previous.challengeId !== next.challengeId || previous.challengeVersion !== next.challengeVersion || previous.editionId !== next.editionId || previous.sourceSha256 !== next.sourceSha256 || previous.createdAt !== next.createdAt || JSON.stringify(previous.order) !== JSON.stringify(next.order)) throw new Error('Saved interpretation source identity cannot change. Start a new reflection instead.');
  if (previous.revealedAt && (next.revealedAt !== previous.revealedAt || next.before !== previous.before || next.initialPreference !== previous.initialPreference)) throw new Error('The reasoning recorded before source reveal is preserved. A restore cannot rewind an existing reveal.');
}
export function reviseReflection(previous: BlindReflection | undefined, next: BlindReflection, now = new Date().toISOString()): BlindReflection {
  if (previous) assertPreservedReflection(previous, next);
  const changed = previous && JSON.stringify({ ...previous, updatedAt: '', history: [] }) !== JSON.stringify({ ...next, updatedAt: '', history: [] });
  const history = changed ? [...previous.history, { at: previous.updatedAt, before: previous.before, after: previous.after, initialPreference: previous.initialPreference, finalPreference: previous.finalPreference, revealedAt: previous.revealedAt }] : previous?.history || [];
  if (history.length > MAX_HISTORY) throw new Error('This reflection reached its revision limit. Export it and start a new reflection.');
  const result = { ...next, updatedAt: now, history };
  validateInterpretationNotebook({ ...emptyInterpretationNotebook(), reflections: [result] });
  return result;
}
export function revealReflection(reflection: BlindReflection, now = new Date().toISOString()): BlindReflection {
  if (reflection.revealedAt) throw new Error('This reflection has already revealed its sources.');
  if (!reflection.before.trim()) throw new Error('Record your reasoning before revealing sources. Being undecided is welcome.');
  return { ...reflection, revealedAt: now, updatedAt: now };
}
export function reflectionExport(reflection: BlindReflection, challenge?: BlindChallenge): string {
  const compatible = challenge?.id === reflection.challengeId && challenge.version === reflection.challengeVersion;
  const revealed = !!reflection.revealedAt;
  const sources = compatible ? reflection.order.map((sourceId, index) => {
    const source = challenge!.sources.find(item => item.id === sourceId);
    if (!source) return `Reading ${index + 1}: source revision unavailable.`;
    // An unrevealed writing export omits source text and metadata so it does not reveal attribution accidentally.
    return revealed ? `Reading ${index + 1}\n${source.summary}\nShort source quotation: “${source.quote}”\n${source.author}\n${source.tradition}\n${source.title}, ${source.locator}\n${source.edition}\n${source.url}\n${source.rights}` : `Reading ${index + 1}: source identity is not yet revealed in this exercise.`;
  }).join('\n\n') : 'The original research preview is not installed. No replacement interpretations are attached to these saved notes.';
  const name = (choice: string) => choice === 'undecided' ? 'Undecided / more evidence needed' : `Reading ${reflection.order.indexOf(choice) + 1}`;
  return `PRIVATE INTERPRETATION REFLECTION\n${compatible ? challenge!.title : reflection.challengeId}\nChallenge: ${reflection.challengeId} / ${reflection.challengeVersion}\nBible edition: ${reflection.editionId}\nBible source SHA-256: ${reflection.sourceSha256}\nThis export contains personal notes and, after reveal, brief research excerpts. It does not export Bible source text.\n\nAI-assisted research preview; human review pending. No correctness or denomination score.\n${compatible ? challenge!.diversityNotice : ''}\n\n${sources}\n\nBEFORE REVEAL\nPreference: ${name(reflection.initialPreference)}\n${reflection.before}\n\n${revealed ? `REVEALED: ${reflection.revealedAt}\nAFTER REVEAL\nPreference: ${name(reflection.finalPreference)}\n${reflection.after}` : 'SOURCE IDENTITIES HAVE NOT BEEN REVEALED'}\n\nCreated: ${reflection.createdAt}\nUpdated: ${reflection.updatedAt}\n\nREVISION HISTORY\n${reflection.history.map(item => `${item.at}\nBefore: ${item.before}\nAfter: ${item.after}\nPreference before: ${name(item.initialPreference)}\nPreference after: ${name(item.finalPreference)}\nRevealed: ${item.revealedAt || 'not revealed'}`).join('\n\n')}\n`;
}

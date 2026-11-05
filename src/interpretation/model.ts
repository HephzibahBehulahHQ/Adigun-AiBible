import type { Book, Edition, Reference, Verse } from '../types';

export interface InterpretationSource {
  id: string; author: string; tradition: string; title: string; locator: string; url: string;
  edition: string; quote: string; summary: string; limits: string[];
  supporting: { label: string; reference: Reference; reason: string }[];
  rights: string; rightsSources: { label: string; url: string }[]; sourceSha256: string;
}
export interface BlindChallenge {
  id: string; version: string; title: string; question: string; passage: Reference;
  contextStart: number; contextEnd: number; aiReviewStatus: 'draft'; humanReviewStatus: 'pending';
  sources: InterpretationSource[]; diversityNotice: string;
}
export interface BlindReflection {
  id: string; challengeId: string; challengeVersion: string; editionId: string; sourceSha256: string;
  order: string[]; before: string; initialPreference: string; revealedAt: string | null;
  after: string; finalPreference: string; createdAt: string; updatedAt: string;
  history: { at: string; before: string; after: string; initialPreference: string; finalPreference: string; revealedAt: string | null }[];
}
export interface InterpretationNotebook { kind: 'adigun-blind-interpretation'; schemaVersion: 1; revision: number; reflections: BlindReflection[] }
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max = 6000): value is string => typeof value === 'string' && value.length <= max;
const id = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{1,99}$/.test(value);
const date = (value: unknown): value is string => typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value));
const https = (value: unknown): value is string => { try { const url = new URL(String(value)); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; } };
export function validateChallenge(value: BlindChallenge): BlindChallenge {
  if (!id(value.id) || !id(value.version) || !value.title || !value.question || value.aiReviewStatus !== 'draft' || value.humanReviewStatus !== 'pending' || value.sources.length < 2 || !value.diversityNotice) throw new Error('Interpretation research preview is invalid.');
  const p = value.passage;
  if (!/^[1-3]?[A-Z]{2,3}$/.test(p.bookId) || !Number.isSafeInteger(p.chapter) || p.chapter < 1 || !Number.isSafeInteger(p.verse) || p.verse < 1 || (p.endVerse || p.verse) < p.verse || value.contextStart > p.verse || value.contextEnd < (p.endVerse || p.verse)) throw new Error('Interpretation passage reference is invalid.');
  const seen = new Set<string>();
  for (const source of value.sources) {
    if (!id(source.id) || seen.has(source.id) || !https(source.url) || !/^[a-f0-9]{64}$/.test(source.sourceSha256)) throw new Error('Interpretation source identity is invalid.');
    seen.add(source.id);
    for (const field of ['author','tradition','title','locator','edition','quote','summary','rights'] as const) if (!text(source[field]) || !source[field].trim()) throw new Error(`Interpretation source lacks ${field}.`);
    if (source.quote.split(/\s+/).length > 25 || !source.limits.length || source.limits.some(item => !text(item) || !item.trim()) || !source.rightsSources.length || source.rightsSources.some(item => !item.label || !https(item.url))) throw new Error('Interpretation source evidence is incomplete.');
    if (!source.supporting.length || source.supporting.some(item => !item.label || !item.reason || !/^[1-3]?[A-Z]{2,3}$/.test(item.reference.bookId) || !Number.isSafeInteger(item.reference.chapter) || item.reference.chapter < 1 || !Number.isSafeInteger(item.reference.verse) || item.reference.verse < 1 || (item.reference.endVerse || item.reference.verse) < item.reference.verse)) throw new Error('Interpretation supporting reference is invalid.');
  }
  return value;
}
export function challengePassage(book: Book, edition: Edition, challenge: BlindChallenge): { edition: Edition; verses: Verse[]; context: Verse[]; missing: number[] } {
  if (book.id !== challenge.passage.bookId) throw new Error('The source book does not match the interpretation challenge.');
  const chapter = book.chapters.find(item => item.number === challenge.passage.chapter);
  if (!chapter) throw new Error('This challenge chapter is absent from the selected edition.');
  const first = challenge.passage.verse, last = challenge.passage.endVerse || first;
  const verses = chapter.verses.filter(item => item.number >= first && item.number <= last);
  const missing = Array.from({ length: last - first + 1 }, (_, index) => first + index).filter(number => !verses.some(item => item.number === number));
  return { edition, verses, context: chapter.verses.filter(item => item.number >= challenge.contextStart && item.number <= challenge.contextEnd), missing };
}
export function emptyInterpretationNotebook(): InterpretationNotebook { return { kind: 'adigun-blind-interpretation', schemaVersion: 1, revision: 0, reflections: [] }; }
export function validateInterpretationNotebook(value: unknown): InterpretationNotebook {
  if (!record(value) || value.kind !== 'adigun-blind-interpretation' || value.schemaVersion !== 1 || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0 || !Array.isArray(value.reflections) || value.reflections.length > 1000) throw new Error('Blind interpretation notebook is invalid. Existing records are unchanged.');
  const ids = new Set<string>();
  for (const item of value.reflections) {
    if (!record(item) || !id(item.id) || ids.has(item.id) || !id(item.challengeId) || !id(item.challengeVersion) || !id(item.editionId) || !/^[a-f0-9]{64}$/.test(String(item.sourceSha256)) || !Array.isArray(item.order) || item.order.length < 2 || item.order.length > 10 || item.order.some(source => !id(source)) || new Set(item.order).size !== item.order.length) throw new Error('Blind interpretation record identity is invalid.');
    ids.add(item.id);
    if (!text(item.before) || !text(item.after) || !text(item.initialPreference, 100) || !text(item.finalPreference, 100) || !['undecided', ...item.order].includes(item.initialPreference) || !['undecided', ...item.order].includes(item.finalPreference) || !date(item.createdAt) || !date(item.updatedAt) || (item.revealedAt !== null && !date(item.revealedAt)) || (item.revealedAt === null && ((item.after as string).trim() || item.finalPreference !== 'undecided')) || !Array.isArray(item.history) || item.history.length > 100) throw new Error('Blind interpretation reasoning or reveal state is invalid.');
    for (const revision of item.history) if (!record(revision) || !date(revision.at) || !text(revision.before) || !text(revision.after) || !text(revision.initialPreference, 100) || !text(revision.finalPreference, 100) || (revision.revealedAt !== null && !date(revision.revealedAt))) throw new Error('Blind interpretation revision history is invalid.');
  }
  return value as unknown as InterpretationNotebook;
}
export function newBlindReflection(challenge: BlindChallenge, edition: Edition, order: string[], now = new Date().toISOString()): BlindReflection {
  if (!edition.sha256 || order.length !== challenge.sources.length || new Set(order).size !== order.length || order.some(source => !challenge.sources.some(item => item.id === source))) throw new Error('A verified edition and complete source order are required.');
  return { id: crypto.randomUUID(), challengeId: challenge.id, challengeVersion: challenge.version, editionId: edition.id, sourceSha256: edition.sha256, order, before: '', initialPreference: 'undecided', revealedAt: null, after: '', finalPreference: 'undecided', createdAt: now, updatedAt: now, history: [] };
}
export function reviseReflection(previous: BlindReflection | undefined, next: BlindReflection, now = new Date().toISOString()): BlindReflection {
  if (previous && (previous.id !== next.id || previous.challengeId !== next.challengeId || previous.challengeVersion !== next.challengeVersion || previous.editionId !== next.editionId || previous.sourceSha256 !== next.sourceSha256 || JSON.stringify(previous.order) !== JSON.stringify(next.order))) throw new Error('Saved interpretation source identity cannot change. Start a new reflection instead.');
  if (previous?.revealedAt && (next.revealedAt !== previous.revealedAt || next.before !== previous.before || next.initialPreference !== previous.initialPreference)) throw new Error('The reasoning recorded before source reveal is preserved. Add your later reasoning below.');
  const changed = previous && JSON.stringify({ ...previous, updatedAt: '', history: [] }) !== JSON.stringify({ ...next, updatedAt: '', history: [] });
  const history = changed ? [...previous.history, { at: previous.updatedAt, before: previous.before, after: previous.after, initialPreference: previous.initialPreference, finalPreference: previous.finalPreference, revealedAt: previous.revealedAt }] : previous?.history || [];
  if (history.length > 100) throw new Error('This reflection reached its revision limit. Export it and start a new reflection.');
  return { ...next, updatedAt: now, history };
}
export function reflectionExport(reflection: BlindReflection, challenge: BlindChallenge): string {
  const revealed = !!reflection.revealedAt;
  const sources = reflection.order.map((sourceId, index) => {
    const source = challenge.sources.find(item => item.id === sourceId);
    if (!source) return `Reading ${index + 1}: source revision unavailable.`;
    return `Reading ${index + 1}\n${source.summary}\nShort source quotation: “${source.quote}”${revealed ? `\n${source.author}\n${source.tradition}\n${source.title}, ${source.locator}\n${source.edition}\n${source.url}\n${source.rights}` : '\nAuthor and source identity not yet revealed in this exercise.'}`;
  }).join('\n\n');
  const name = (choice: string) => choice === 'undecided' ? 'Undecided / more evidence needed' : `Reading ${reflection.order.indexOf(choice) + 1}`;
  return `PRIVATE INTERPRETATION REFLECTION\n${challenge.title}\nChallenge: ${reflection.challengeId} / ${reflection.challengeVersion}\nBible edition: ${reflection.editionId}\nBible source SHA-256: ${reflection.sourceSha256}\nThis export contains research excerpts and personal notes, not Bible source text.\n\nAI-assisted research preview; human review pending. No correctness or denomination score.\n${challenge.diversityNotice}\n\n${sources}\n\nBEFORE REVEAL\nPreference: ${name(reflection.initialPreference)}\n${reflection.before}\n\n${revealed ? `REVEALED: ${reflection.revealedAt}\nAFTER REVEAL\nPreference: ${name(reflection.finalPreference)}\n${reflection.after}` : 'SOURCE IDENTITIES HAVE NOT BEEN REVEALED'}\n\nCreated: ${reflection.createdAt}\nUpdated: ${reflection.updatedAt}\n\nREVISION HISTORY\n${reflection.history.map(item => `${item.at}\nBefore: ${item.before}\nAfter: ${item.after}\nPreference before: ${name(item.initialPreference)}\nPreference after: ${name(item.finalPreference)}\nRevealed: ${item.revealedAt || 'not revealed'}`).join('\n\n')}\n`;
}

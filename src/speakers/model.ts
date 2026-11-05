import type { Book, Edition, Reference } from '../types';
import { buildChapterStructure } from '../reader/source-structure.ts';
import { hashSourceText, stableStringify } from '../editorial.ts';
import type { EditorialContent, ReviewRecord } from '../editorial';
import { isValidatedPublication } from '../publication.ts';
import type { PublishedEditorial } from '../publication';
import { fold } from '../domain.ts';

export const SPEAKER_REVIEW_TAG = 'adigun:speaker-annotation:v1';
export interface PublisherSpeech {
  id: string; reference: Reference; bookName: string; edition: Edition;
  start: number; end: number; text: string; fullVerse: string;
  marker: 'wj'; offsetUnit: 'unicode-codepoint';
}

/** Publisher metadata supplies spans. It does not supply an independent human review. */
export function publisherSpeeches(book: Book, edition: Edition): { speeches: PublisherSpeech[]; issues: string[] } {
  const speeches: PublisherSpeech[] = [], issues: string[] = [];
  for (const chapter of book.chapters) {
    const structure = buildChapterStructure(chapter);
    for (const verse of structure.verses) {
      if (verse.issues.length) { issues.push(`${book.id} ${chapter.number}:${verse.number}: ${verse.issues.join(' ')}`); continue; }
      const ranges: { start: number; end: number }[] = [];
      for (const segment of verse.segments.filter(segment => segment.markers.includes('wj'))) {
        const previous = ranges.at(-1);
        if (previous && previous.end === segment.start) previous.end = segment.end;
        else ranges.push({ start: segment.start, end: segment.end });
      }
      for (const range of ranges) {
        const text = Array.from(verse.text).slice(range.start, range.end).join('');
        if (!text.trim()) continue;
        const reference = { bookId: book.id, chapter: chapter.number, verse: verse.number, editionId: edition.id };
        speeches.push({ id: `${edition.id}:${book.id}:${chapter.number}:${verse.number}:${range.start}-${range.end}`, reference, bookName: book.name, edition, ...range, text, fullVerse: verse.text, marker: 'wj', offsetUnit: 'unicode-codepoint' });
      }
    }
  }
  return { speeches, issues };
}

export function searchPublisherSpeeches(values: PublisherSpeech[], query: string): PublisherSpeech[] {
  const needle = fold(query);
  return needle ? values.filter(value => fold(value.text).includes(needle)) : values;
}

export interface SpeakerPayload {
  schemaVersion: 1; id: string; reference: Reference & { editionId: string };
  editionSha256: string; sourceTextHash: string; offsetUnit: 'unicode-codepoint';
  start: number; end: number; speakerId: string; audience: string[];
  quotedSpeakerId?: string; speechKind: 'direct' | 'quotation' | 'narration' | 'prayer' | 'song';
  uncertainty: 'asserted' | 'disputed' | 'unknown'; evidenceIds: string[];
}
export interface SpeakerAnnotation extends SpeakerPayload { review: ReviewRecord }
export interface CorrectionProposal { id: string; annotation: SpeakerPayload; reason: string; createdAt: string; status: 'draft' }
export interface SpeakerCorrections { schemaVersion: 1; revision: number; proposals: CorrectionProposal[] }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max: number): value is string => typeof value === 'string' && !!value.trim() && value.length <= max;
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

export function validateSpeakerPayload(value: unknown): SpeakerPayload {
  if (!object(value) || value.schemaVersion !== 1 || !text(value.id, 180) || !object(value.reference) || !/^[1-3]?[A-Z]{2,3}$/.test(String(value.reference.bookId)) || !text(value.reference.editionId, 64) || !/^[a-z0-9][a-z0-9-]*$/.test(String(value.reference.editionId)) || !Number.isSafeInteger(value.reference.chapter) || Number(value.reference.chapter) < 1 || !Number.isSafeInteger(value.reference.verse) || Number(value.reference.verse) < 1 || value.reference.endVerse !== undefined || !hash(value.editionSha256) || !hash(value.sourceTextHash) || value.offsetUnit !== 'unicode-codepoint' || !Number.isSafeInteger(value.start) || !Number.isSafeInteger(value.end) || Number(value.start) < 0 || Number(value.end) <= Number(value.start) || Number(value.end) > 100_000 || !text(value.speakerId, 120) || !Array.isArray(value.audience) || value.audience.length > 20 || !value.audience.every(item => text(item, 120)) || value.quotedSpeakerId !== undefined && !text(value.quotedSpeakerId, 120) || !['direct', 'quotation', 'narration', 'prayer', 'song'].includes(String(value.speechKind)) || !['asserted', 'disputed', 'unknown'].includes(String(value.uncertainty)) || !Array.isArray(value.evidenceIds) || !value.evidenceIds.length || value.evidenceIds.length > 20 || !value.evidenceIds.every(item => text(item, 300))) throw new Error('The speaker annotation has invalid identity, source evidence or Unicode code point spans.');
  const source = value as unknown as SpeakerPayload;
  return { schemaVersion: 1, id: source.id, reference: { bookId: source.reference.bookId, chapter: source.reference.chapter, verse: source.reference.verse, editionId: source.reference.editionId }, editionSha256: source.editionSha256, sourceTextHash: source.sourceTextHash, offsetUnit: 'unicode-codepoint', start: source.start, end: source.end, speakerId: source.speakerId, audience: [...source.audience], ...(source.quotedSpeakerId ? { quotedSpeakerId: source.quotedSpeakerId } : {}), speechKind: source.speechKind, uncertainty: source.uncertainty, evidenceIds: [...source.evidenceIds] };
}

export async function checkSpeakerSource(value: SpeakerPayload, edition: Edition, verseText: string): Promise<string> {
  const payload = validateSpeakerPayload(value);
  if (payload.reference.editionId !== edition.id || payload.editionSha256 !== edition.sha256 || payload.sourceTextHash !== await hashSourceText(verseText)) throw new Error('This proposal belongs to a different source revision. Reopen the current source before using it.');
  const points = Array.from(verseText);
  if (payload.end > points.length || !points.slice(payload.start, payload.end).join('').trim()) throw new Error('The speaker span is outside the exact source wording.');
  return points.slice(payload.start, payload.end).join('');
}

/** This draft envelope can enter the existing reviewer-registry publication workflow. */
export function speakerEditorialDraft(payload: SpeakerPayload): EditorialContent {
  const checked = validateSpeakerPayload(payload), sourceId = `${checked.reference.editionId}:${checked.reference.bookId}:${checked.reference.chapter}:${checked.reference.verse}`;
  return { id: checked.id, kind: 'context', locale: 'en', text: stableStringify(checked), origin: 'human_authored', basePassageIds: [sourceId], reviewedSourceHashes: { [sourceId]: checked.sourceTextHash }, sourceIds: [SPEAKER_REVIEW_TAG, ...checked.evidenceIds], review: { status: 'draft', evidenceIds: [sourceId] } };
}

/** A self-declared review flag or imported local proposal never establishes publication. */
export function publishedSpeakerAnnotations(publication: PublishedEditorial | null): SpeakerAnnotation[] {
  if (!isValidatedPublication(publication)) return [];
  return publication.approvedContent.filter(entry => entry.kind === 'context' && entry.sourceIds.includes(SPEAKER_REVIEW_TAG)).flatMap(entry => {
    try {
      const payload = validateSpeakerPayload(JSON.parse(entry.text));
      const sourceId = `${payload.reference.editionId}:${payload.reference.bookId}:${payload.reference.chapter}:${payload.reference.verse}`;
      if (entry.id !== payload.id || entry.text !== stableStringify(payload) || entry.basePassageIds.length !== 1 || entry.basePassageIds[0] !== sourceId || entry.reviewedSourceHashes[sourceId] !== payload.sourceTextHash) return [];
      return [{ ...payload, review: entry.review }];
    } catch { return []; }
  });
}

export const emptyCorrections = (): SpeakerCorrections => ({ schemaVersion: 1, revision: 0, proposals: [] });
export function validateCorrections(value: unknown): SpeakerCorrections {
  if (!object(value) || value.schemaVersion !== 1 || !Number.isSafeInteger(value.revision) || Number(value.revision) < 0 || !Array.isArray(value.proposals) || value.proposals.length > 250) throw new Error('Unsupported speaker-correction backup or too many proposals. Existing proposals have not been replaced.');
  const ids = new Set<string>();
  const proposals = value.proposals.map(raw => {
    if (!object(raw) || !text(raw.id, 180) || ids.has(raw.id) || raw.status !== 'draft' || !text(raw.reason, 6000) || !text(raw.createdAt, 40) || !Number.isFinite(Date.parse(raw.createdAt)) || new Date(raw.createdAt).toISOString() !== raw.createdAt || !object(raw.annotation) || 'review' in raw.annotation) throw new Error('A correction proposal is malformed or attempts to import a review approval. Existing proposals have not been replaced.');
    ids.add(raw.id);
    return { id: raw.id, annotation: validateSpeakerPayload(raw.annotation), reason: raw.reason, createdAt: raw.createdAt, status: 'draft' as const };
  });
  return { schemaVersion: 1, revision: Number(value.revision), proposals };
}

export function mergeCorrections(current: SpeakerCorrections, incoming: SpeakerCorrections): SpeakerCorrections {
  const previous = validateCorrections(current), imported = validateCorrections(incoming), byId = new Map(previous.proposals.map(proposal => [proposal.id, proposal]));
  for (const proposal of imported.proposals) {
    const existing = byId.get(proposal.id);
    if (existing && stableStringify(existing) !== stableStringify(proposal)) throw new Error('A proposal ID has different content in this backup. Nothing was imported; keep both backups for review.');
    byId.set(proposal.id, proposal);
  }
  return validateCorrections({ ...previous, proposals: [...byId.values()] });
}

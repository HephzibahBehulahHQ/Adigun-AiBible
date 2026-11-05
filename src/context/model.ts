import type { Book, Chapter, Edition, Manifest, Reference, Verse } from '../types';

export interface ContextSource {
  reference: Reference;
  edition: Edition;
  bookName: string;
  chapter: Chapter;
  chapterCount: number;
  label: string;
  windowLabel: string;
  verses: Verse[];
  missing: number[];
}

export interface ContextDependencies {
  getManifest: (editionId: string) => Promise<Manifest>;
  getBook: (bookId: string, editionId: string) => Promise<Book>;
}

export function contextKey(reference: Reference): string {
  return `${reference.editionId || 'eng-web'}:${reference.bookId}:${reference.chapter}:${reference.verse}:${reference.endVerse ?? reference.verse}`;
}

/** The selected edition owns both the wording and the numbering. Never repair gaps with another text. */
export async function loadContextSource(reference: Reference, dependencies: ContextDependencies): Promise<ContextSource> {
  const editionId = reference.editionId || 'eng-web';
  const last = reference.endVerse ?? reference.verse;
  if (!/^[1-3]?[A-Z]{2,3}$/.test(reference.bookId) || ![reference.chapter, reference.verse, last].every(value => Number.isSafeInteger(value) && value > 0) || last < reference.verse) throw new Error('Choose a valid book, chapter and verse range before opening context.');
  const manifest = await dependencies.getManifest(editionId);
  if (manifest.edition.id !== editionId) throw new Error('The source edition does not match this passage. No substitute wording has been used.');
  const inventory = manifest.books.find(book => book.id === reference.bookId);
  if (!inventory || reference.chapter > inventory.chapters) throw new Error('This chapter is absent from the selected edition.');
  const count = inventory.verseCounts[reference.chapter - 1];
  if (last > count) throw new Error(`This chapter has numbered positions through ${count}. Choose a valid range.`);
  const book = await dependencies.getBook(reference.bookId, editionId);
  const chapter = book.chapters.find(value => value.number === reference.chapter);
  if (book.id !== reference.bookId || !chapter) throw new Error('This chapter is not available in the selected source.');
  const start = Math.max(1, reference.verse - 2), end = Math.min(count, last + 2);
  const verses = chapter.verses.filter(verse => verse.number >= start && verse.number <= end);
  const missing = Array.from({ length: last - reference.verse + 1 }, (_, offset) => reference.verse + offset).filter(number => !verses.some(verse => verse.number === number && verse.text.trim()));
  return {
    reference: { ...reference, editionId }, edition: manifest.edition, bookName: book.name, chapter, chapterCount: inventory.chapters,
    label: `${book.name} ${reference.chapter}:${reference.verse}${last === reference.verse ? '' : `–${last}`}`,
    windowLabel: `${book.name} ${reference.chapter}:${start}${start === end ? '' : `–${end}`}`, verses, missing,
  };
}

export interface ContextCitation { label: string; reference?: Reference; url?: string }
export interface ContextField { label: string; text: string; sources: ContextCitation[] }
export interface ContextRecord {
  id: string;
  bookId: string;
  fromChapter: number;
  toChapter: number;
  title: string;
  aiReviewStatus: 'AI-assisted draft · human review pending';
  sources: ContextCitation[];
  fields: ContextField[];
  prosperityGospelRisk: 'none' | 'flagged';
  debateId?: string;
}

export interface DebateRecord {
  id: string;
  title: string;
  summary: string;
  positions: { name: string; summary: string; representativeSources: { label: string; url: string }[] }[];
  reviewStatus: 'draft' | 'in_review' | 'disputed';
}

export function safeSourceUrl(value: string): boolean {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}

/** Imported editorial metadata must not invent a human approval or executable source link. */
export function validateContextRecords(value: unknown): ContextRecord[] {
  if (!Array.isArray(value) || value.length > 200) throw new Error('Context records must be a bounded list.');
  const seen = new Set<string>();
  const citation = (item: unknown): item is ContextCitation => {
    if (!item || typeof item !== 'object') return false;
    const source = item as ContextCitation;
    if (typeof source.label !== 'string' || !source.label.trim()) return false;
    if (source.url !== undefined && !safeSourceUrl(source.url)) return false;
    if (source.reference) {
      const ref = source.reference;
      if (!/^[1-3]?[A-Z]{2,3}$/.test(ref.bookId) || !Number.isSafeInteger(ref.chapter) || ref.chapter < 1 || !Number.isSafeInteger(ref.verse) || ref.verse < 1 || ref.endVerse !== undefined && (!Number.isSafeInteger(ref.endVerse) || ref.endVerse < ref.verse)) return false;
    }
    return !!(source.reference || source.url);
  };
  for (const item of value) {
    const record = item as ContextRecord;
    if (!record || typeof record.id !== 'string' || !record.id || seen.has(record.id) || !/^[1-3]?[A-Z]{2,3}$/.test(record.bookId) || !Number.isInteger(record.fromChapter) || !Number.isInteger(record.toChapter) || record.fromChapter < 1 || record.toChapter < record.fromChapter || typeof record.title !== 'string' || !record.title.trim() || record.aiReviewStatus !== 'AI-assisted draft · human review pending' || !['none', 'flagged'].includes(record.prosperityGospelRisk) || !Array.isArray(record.sources) || !record.sources.length || !record.sources.every(citation) || !Array.isArray(record.fields) || !record.fields.length || record.fields.some(field => !field || typeof field.label !== 'string' || !field.label.trim() || typeof field.text !== 'string' || !field.text.trim() || !Array.isArray(field.sources) || !field.sources.length || !field.sources.every(citation))) throw new Error('A context record lacks valid provenance, scope, or explicit draft status.');
    seen.add(record.id);
  }
  return value as ContextRecord[];
}

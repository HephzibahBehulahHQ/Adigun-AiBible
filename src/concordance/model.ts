import type { BookInfo, Edition, Manifest, Reference, SearchResult } from '../types';

export const CONCORDANCE_PAGE_SIZE = 25;
export const MAX_CONCORDANCE_QUERY = 200;
export const MAX_CONCORDANCE_WORDS = 8;
export const MAX_CONCORDANCE_RECORDS = 100_000;
export interface WordToken { value: string; start: number; end: number }
export interface MatchSpan { start: number; end: number }
export interface ConcordanceQuery {
  text: string;
  mode: 'word' | 'phrase';
  caseSensitive: boolean;
  bookId: string;
  testament: '' | 'old' | 'new';
}
export interface ConcordanceSource {
  manifest: Manifest;
  rows: SearchResult[];
  indexSha256: string;
  contentVersion: string;
}
export interface ConcordanceMatch {
  reference: Reference & { editionId: string };
  text: string;
  spans: MatchSpan[];
}
export interface BookDistribution { bookId: string; name: string; occurrences: number; verses: number }
export interface ConcordanceResult {
  query: ConcordanceQuery;
  edition: Edition;
  sourceSha256: string;
  indexSha256: string;
  contentVersion: string;
  totalSourceRecords: number;
  searchedRecords: number;
  occurrences: number;
  matchingVerses: number;
  distribution: BookDistribution[];
  page: number;
  pageSize: number;
  matches: ConcordanceMatch[];
}

/** Offsets always address the unchanged JavaScript source string (UTF-16). */
export function surfaceWords(text: string, caseSensitive = false): WordToken[] {
  return [...text.matchAll(/[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:['’][\p{L}\p{M}\p{N}]+)*/gu)].map(match => ({
    value: caseSensitive ? match[0].normalize('NFC') : match[0].normalize('NFC').toLowerCase(),
    start: match.index!, end: match.index! + match[0].length,
  }));
}

export function validateConcordanceQuery(query: ConcordanceQuery): WordToken[] {
  if (!query || typeof query.text !== 'string' || !query.text.trim() || query.text.length > MAX_CONCORDANCE_QUERY
    || !['word', 'phrase'].includes(query.mode) || typeof query.caseSensitive !== 'boolean'
    || typeof query.bookId !== 'string' || !['', 'old', 'new'].includes(query.testament)) {
    throw new Error(`Enter a word or phrase of up to ${MAX_CONCORDANCE_QUERY} characters.`);
  }
  const words = surfaceWords(query.text, query.caseSensitive);
  if (!words.length || words.length > MAX_CONCORDANCE_WORDS) throw new Error(`Use between one and ${MAX_CONCORDANCE_WORDS} source words.`);
  if (query.mode === 'word' && words.length !== 1) throw new Error('Exact word mode accepts one word. Choose consecutive words for a phrase.');
  return words;
}

export function occurrenceSpans(text: string, queryWords: WordToken[], caseSensitive = false): MatchSpan[] {
  const words = surfaceWords(text, caseSensitive), spans: MatchSpan[] = [];
  for (let i = 0; i <= words.length - queryWords.length; i++) {
    if (queryWords.every((word, offset) => words[i + offset].value === word.value)) {
      spans.push({ start: words[i].start, end: words[i + queryWords.length - 1].end });
    }
  }
  return spans;
}

/** Merge overlaps only for visual markup; occurrence counts retain every token start. */
export function highlightParts(text: string, spans: MatchSpan[]): { text: string; match: boolean }[] {
  const merged: MatchSpan[] = [];
  for (const span of spans) {
    if (!Number.isInteger(span.start) || !Number.isInteger(span.end) || span.start < 0 || span.end > text.length || span.end <= span.start) throw new Error('Invalid source highlight boundary.');
    const previous = merged.at(-1);
    if (previous && span.start < previous.start) throw new Error('Source highlight boundaries are out of order.');
    if (previous && span.start < previous.end) previous.end = Math.max(previous.end, span.end);
    else merged.push({ ...span });
  }
  const parts: { text: string; match: boolean }[] = []; let offset = 0;
  for (const span of merged) {
    if (span.start > offset) parts.push({ text: text.slice(offset, span.start), match: false });
    parts.push({ text: text.slice(span.start, span.end), match: true }); offset = span.end;
  }
  if (offset < text.length) parts.push({ text: text.slice(offset), match: false });
  return parts;
}

export function validateConcordanceManifest(value: unknown, editionId: string): Manifest {
  const manifest = value as Manifest;
  if (!manifest || manifest.schemaVersion !== 1 || manifest.edition?.id !== editionId
    || manifest.edition.corpus === 'quran' || typeof manifest.edition.name !== 'string' || !manifest.edition.name
    || typeof manifest.edition.language !== 'string' || !manifest.edition.language
    || !/^[a-f0-9]{64}$/.test(manifest.edition.sha256 || '') || !Array.isArray(manifest.books) || !manifest.books.length
    || manifest.books.length > 100 || !manifest.totals || !Number.isInteger(manifest.totals.verses)
    || manifest.totals.verses < 1 || manifest.totals.verses > MAX_CONCORDANCE_RECORDS) throw new Error('The edition inventory is invalid. No concordance count is available.');
  const ids = new Set<string>(); let chapters = 0, records = 0;
  for (const book of manifest.books) {
    if (!book || !/^[1-3]?[A-Z]{2,3}$/.test(book.id) || ids.has(book.id) || typeof book.name !== 'string'
      || !Number.isInteger(book.chapters) || book.chapters < 1 || book.chapters > 150
      || !Array.isArray(book.verseCounts) || book.verseCounts.length !== book.chapters
      || book.verseCounts.some(n => !Number.isInteger(n) || n < 1 || n > 176)
      || (book.verseRecordCounts !== undefined && (!Array.isArray(book.verseRecordCounts) || book.verseRecordCounts.length !== book.chapters
        || book.verseRecordCounts.some((n, i) => !Number.isInteger(n) || n < 1 || n > book.verseCounts[i])))) throw new Error('The edition book inventory is invalid.');
    ids.add(book.id); chapters += book.chapters;
    records += (book.verseRecordCounts || book.verseCounts).reduce((sum, n) => sum + n, 0);
  }
  if (manifest.totals.books !== manifest.books.length || manifest.totals.chapters !== chapters || manifest.totals.verses !== records) throw new Error('The source record totals do not agree with the edition inventory.');
  return manifest;
}

/** Full index validation precedes counting: omitted or duplicate records cannot masquerade as zero. */
export function validateConcordanceRows(value: unknown, manifest: Manifest): SearchResult[] {
  if (!Array.isArray(value) || value.length !== manifest.totals.verses || value.length > MAX_CONCORDANCE_RECORDS) throw new Error('The source index is incomplete. No concordance count is available.');
  const books = new Map(manifest.books.map((book, index) => [book.id, { book, index }]));
  const counts = new Map<string, number>(); let previous = -1, previousEnd = 0, previousChapter = '';
  for (const raw of value) {
    const row = raw as SearchResult, entry = row && books.get(row.bookId);
    if (!entry || typeof row.text !== 'string' || row.text.length > 100_000
      || !Number.isInteger(row.chapter) || row.chapter < 1 || row.chapter > entry.book.chapters
      || !Number.isInteger(row.verse) || row.verse < 1 || row.verse > entry.book.verseCounts[row.chapter - 1]
      || (row.editionId !== undefined && row.editionId !== manifest.edition.id)
      || (row.endVerse !== undefined && (!Number.isInteger(row.endVerse) || row.endVerse < row.verse || row.endVerse > entry.book.verseCounts[row.chapter - 1]))) throw new Error('The source index contains an invalid edition or verse record.');
    const position = entry.index * 1_000_000 + row.chapter * 1_000 + row.verse;
    const chapterKey = `${row.bookId}:${row.chapter}`, endVerse = row.endVerse ?? row.verse;
    if (position <= previous || (chapterKey === previousChapter && row.verse <= previousEnd)) throw new Error('The source index has duplicate, overlapping, or unordered references.');
    previous = position; previousEnd = endVerse; previousChapter = chapterKey; counts.set(chapterKey, (counts.get(chapterKey) || 0) + 1);
  }
  for (const book of manifest.books) for (let chapter = 1; chapter <= book.chapters; chapter++) {
    if (counts.get(`${book.id}:${chapter}`) !== (book.verseRecordCounts || book.verseCounts)[chapter - 1]) throw new Error('The source index chapter coverage is incomplete.');
  }
  return value as SearchResult[];
}

function scopedBooks(books: BookInfo[], query: ConcordanceQuery): BookInfo[] {
  if (query.bookId && !books.some(book => book.id === query.bookId)) throw new Error('That book is absent from this source edition.');
  const boundary = books.findIndex(book => book.id === 'MAT');
  if (query.testament && boundary < 0) throw new Error('This source has no verified testament boundary. Choose an edition or book scope.');
  return books.filter((book, index) => (!query.bookId || query.bookId === book.id) && (!query.testament || (query.testament === 'old' ? index < boundary : index >= boundary)));
}

export async function countConcordance(source: ConcordanceSource, query: ConcordanceQuery, page = 0, options: {
  signal?: AbortSignal;
  yieldControl?: () => Promise<void>;
  onProgress?: (processed: number, total: number) => void;
} = {}): Promise<ConcordanceResult> {
  const queryWords = validateConcordanceQuery(query);
  if (!Number.isInteger(page) || page < 0 || page > Math.ceil(MAX_CONCORDANCE_RECORDS / CONCORDANCE_PAGE_SIZE)) throw new Error('Choose a valid concordance page.');
  const abort = () => { if (options.signal?.aborted) throw new DOMException('Concordance cancelled. No partial total was published.', 'AbortError'); };
  abort(); const books = scopedBooks(source.manifest.books, query);
  const distribution = books.map(book => ({ bookId: book.id, name: book.name, occurrences: 0, verses: 0 }));
  const byBook = new Map(distribution.map(book => [book.bookId, book]));
  let occurrences = 0, matchingVerses = 0, searchedRecords = 0;
  const matches: ConcordanceMatch[] = [];
  for (let index = 0; index < source.rows.length; index++) {
    if (index % 250 === 0) {
      abort(); options.onProgress?.(index, source.rows.length);
      if (options.yieldControl) await options.yieldControl();
      abort();
    }
    const row = source.rows[index], book = byBook.get(row.bookId);
    if (!book) continue;
    searchedRecords++;
    const spans = occurrenceSpans(row.text, queryWords, query.caseSensitive);
    if (!spans.length) continue;
    if (matchingVerses >= page * CONCORDANCE_PAGE_SIZE && matches.length < CONCORDANCE_PAGE_SIZE) matches.push({
      reference: { editionId: source.manifest.edition.id, bookId: row.bookId, chapter: row.chapter, verse: row.verse }, text: row.text, spans,
    });
    occurrences += spans.length; matchingVerses++; book.occurrences += spans.length; book.verses++;
  }
  abort();
  if (page > 0 && page * CONCORDANCE_PAGE_SIZE >= matchingVerses) throw new Error('That result page is unavailable. Run the concordance again from its first page.');
  return {
    query: { ...query }, edition: source.manifest.edition, sourceSha256: source.manifest.edition.sha256!, indexSha256: source.indexSha256,
    contentVersion: source.contentVersion, totalSourceRecords: source.rows.length, searchedRecords, occurrences, matchingVerses,
    distribution, page, pageSize: CONCORDANCE_PAGE_SIZE, matches,
  };
}

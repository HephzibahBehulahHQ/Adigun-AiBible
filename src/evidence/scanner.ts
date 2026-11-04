import type { Book, BookInfo, Manifest, Reference, Verse } from '../types';

export const MAX_TRANSCRIPT_LENGTH = 200_000;
export const MAX_SCAN_REFERENCES = 80;

export interface TranscriptSpan { start: number; end: number; text: string }
export interface TranscriptTimestamp { label: string; seconds: number }
export type FindingCategory = 'exact_quotation' | 'likely_alternative_edition' | 'approximate_quotation' | 'explicit_paraphrase' | 'possible_transcription_error' | 'possible_misquotation' | 'missing_context_requiring_review' | 'interpretive_disagreement' | 'claim_unsupported_by_checked_sources' | 'claim_outside_scope' | 'insufficient_evidence';
export interface DetectedReference {
  span: TranscriptSpan;
  reference: Reference;
  timestamp?: TranscriptTimestamp;
  error?: string;
  errorType?: 'cross_chapter' | 'inventory';
}
export interface PassageEvidence {
  reference: Reference;
  label: string;
  editionName: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string;
  attribution: string;
  editionHash?: string;
  passageHash: string;
  verses: Verse[];
  context: Verse[];
  match: 'exact_words' | 'approximate_words' | 'different_words' | 'not_compared';
}
export interface SermonFinding {
  id: string;
  transcriptSpan: TranscriptSpan;
  referenceSpan: TranscriptSpan;
  timestamp?: TranscriptTimestamp;
  quotation?: TranscriptSpan;
  claim: string;
  references: Reference[];
  category: FindingCategory;
  evidence: PassageEvidence[];
  explanation: string;
  uncertainty: string[];
}
export interface ScanReport {
  schemaVersion: 1;
  createdAt: string;
  transcriptHash: string;
  checkedEditions: { id: string; name: string; sourceUrl: string; editionHash?: string }[];
  findings: SermonFinding[];
  detectedReferences: number;
  scope: string;
}
/** Callers must supply only editions permitted for local indexing and report export. */
export interface ScanSource { manifest: Manifest; book: (id: string) => Promise<Book> }

export const categoryLabels: Record<FindingCategory, string> = {
  exact_quotation: 'Exact quoted words',
  likely_alternative_edition: 'Matches another checked edition',
  approximate_quotation: 'Approximate quotation — review needed',
  explicit_paraphrase: 'Explicit paraphrase — meaning not assessed',
  possible_transcription_error: 'Possible transcription error',
  possible_misquotation: 'Possible misquotation',
  missing_context_requiring_review: 'Reference mentioned — context review needed',
  interpretive_disagreement: 'Interpretive disagreement',
  claim_unsupported_by_checked_sources: 'Claim unsupported by checked sources',
  claim_outside_scope: 'Claim outside the scanner’s scope',
  insufficient_evidence: 'Insufficient evidence',
};

// These are reference spellings, not translated Scripture or inferred book authors.
const aliases: Record<string, string[]> = {
  GEN: ['Gen', 'Ge', 'Gn'], EXO: ['Ex', 'Exod'], LEV: ['Lev', 'Lv'], NUM: ['Num', 'Nm'], DEU: ['Deut', 'Dt'],
  JOS: ['Josh'], JDG: ['Judg', 'Jdg'], RUT: ['Ruth'], '1SA': ['1 Sam', '1 Sa'], '2SA': ['2 Sam', '2 Sa'],
  '1KI': ['1 Kgs', '1 Ki'], '2KI': ['2 Kgs', '2 Ki'], '1CH': ['1 Chr', '1 Chron'], '2CH': ['2 Chr', '2 Chron'],
  EZR: ['Ezra'], NEH: ['Neh'], EST: ['Esth'], JOB: ['Job'], PSA: ['Ps', 'Psa', 'Psalm', 'Psalms'],
  PRO: ['Prov', 'Pr'], ECC: ['Eccl', 'Eccles'], SNG: ['Song', 'Song of Songs', 'Song of Solomon', 'Canticles'],
  ISA: ['Isa', 'Is'], JER: ['Jer'], LAM: ['Lam'], EZK: ['Ezek', 'Eze'], DAN: ['Dan', 'Dn'], HOS: ['Hos'],
  JOL: ['Joel'], AMO: ['Amos'], OBA: ['Obad'], JON: ['Jonah'], MIC: ['Mic'], NAM: ['Nah'], HAB: ['Hab'],
  ZEP: ['Zeph'], HAG: ['Hag'], ZEC: ['Zech'], MAL: ['Mal'], MAT: ['Matt', 'Mt'], MRK: ['Mark', 'Mk'],
  LUK: ['Luke', 'Lk'], JHN: ['John', 'Jn'], ACT: ['Acts'], ROM: ['Rom', 'Ro'], '1CO': ['1 Cor'], '2CO': ['2 Cor'],
  GAL: ['Gal'], EPH: ['Eph'], PHP: ['Phil', 'Php'], COL: ['Col'], '1TH': ['1 Thess', '1 Thes'], '2TH': ['2 Thess', '2 Thes'],
  '1TI': ['1 Tim'], '2TI': ['2 Tim'], TIT: ['Titus'], PHM: ['Philem', 'Phlm'], HEB: ['Heb'], JAS: ['James', 'Jas'],
  '1PE': ['1 Pet'], '2PE': ['2 Pet'], '1JN': ['1 Jn'], '2JN': ['2 Jn'], '3JN': ['3 Jn'], JUD: ['Jude'], REV: ['Rev', 'Revelation', 'Revelations'],
};
const englishNames: Record<string, string> = {
  GEN:'Genesis',EXO:'Exodus',LEV:'Leviticus',NUM:'Numbers',DEU:'Deuteronomy',JOS:'Joshua',JDG:'Judges',RUT:'Ruth','1SA':'1 Samuel','2SA':'2 Samuel','1KI':'1 Kings','2KI':'2 Kings','1CH':'1 Chronicles','2CH':'2 Chronicles',EZR:'Ezra',NEH:'Nehemiah',EST:'Esther',JOB:'Job',PSA:'Psalms',PRO:'Proverbs',ECC:'Ecclesiastes',SNG:'Song of Solomon',ISA:'Isaiah',JER:'Jeremiah',LAM:'Lamentations',EZK:'Ezekiel',DAN:'Daniel',HOS:'Hosea',JOL:'Joel',AMO:'Amos',OBA:'Obadiah',JON:'Jonah',MIC:'Micah',NAM:'Nahum',HAB:'Habakkuk',ZEP:'Zephaniah',HAG:'Haggai',ZEC:'Zechariah',MAL:'Malachi',MAT:'Matthew',MRK:'Mark',LUK:'Luke',JHN:'John',ACT:'Acts',ROM:'Romans','1CO':'1 Corinthians','2CO':'2 Corinthians',GAL:'Galatians',EPH:'Ephesians',PHP:'Philippians',COL:'Colossians','1TH':'1 Thessalonians','2TH':'2 Thessalonians','1TI':'1 Timothy','2TI':'2 Timothy',TIT:'Titus',PHM:'Philemon',HEB:'Hebrews',JAS:'James','1PE':'1 Peter','2PE':'2 Peter','1JN':'1 John','2JN':'2 John','3JN':'3 John',JUD:'Jude',REV:'Revelation',
};

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const foldName = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim();
export async function sha256(text: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), byte => byte.toString(16).padStart(2, '0')).join('');
}

function timestampBefore(text: string, offset: number): TranscriptTimestamp | undefined {
  const pattern = /^[\t ]*\[?(?:(\d{1,2}):)?(\d{1,3}):(\d{2})(?:[.,](\d{1,3}))?\]?(?=\s|$)/gm;
  let latest: TranscriptTimestamp | undefined;
  for (const match of text.matchAll(pattern)) {
    if (match.index > offset) break;
    const hours = Number(match[1] || 0), minutes = Number(match[2]), seconds = Number(match[3]);
    if (seconds >= 60 || (match[1] && minutes >= 60)) continue;
    latest = { label: match[0].trim(), seconds: hours * 3600 + minutes * 60 + seconds + Number(`0.${match[4] || 0}`) };
  }
  return latest;
}

export function detectReferences(text: string, books: BookInfo[]): DetectedReference[] {
  if (text.length > MAX_TRANSCRIPT_LENGTH) throw new Error(`Keep transcripts below ${MAX_TRANSCRIPT_LENGTH.toLocaleString('en')} characters, or split the recording into sections.`);
  const names = new Map<string, BookInfo>();
  for (const book of books) {
    for (const name of [book.name, book.id, ...(englishNames[book.id] ? [englishNames[book.id]] : []), ...(aliases[book.id] || [])]) {
      names.set(foldName(name), book);
      if (/^[1-3] /.test(name)) {
        const number = Number(name[0]);
        for (const prefix of [['I', 'First', '1st'], ['II', 'Second', '2nd'], ['III', 'Third', '3rd']][number - 1]) names.set(foldName(prefix + name.slice(1)), book);
      }
    }
  }
  const alternatives = [...names.keys()].sort((a, b) => b.length - a.length).map(name => escapeRegex(name).replace(/ /g, '\\s+')).join('|');
  if (!alternatives) return [];
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(${alternatives})\\.?\\s+(\\d{1,3})\\s*:\\s*(\\d{1,3})(?:\\s*[-–—]\\s*(?:(\\d{1,3})\\s*:\\s*)?(\\d{1,3}))?(?!\\d)`, 'giu');
  return [...text.matchAll(pattern)].map(match => {
    const book = names.get(foldName(match[1]))!;
    const chapter = Number(match[2]), verse = Number(match[3]), endVerse = match[5] ? Number(match[5]) : undefined;
    const reference: Reference = { bookId: book.id, chapter, verse, ...(endVerse !== undefined ? { endVerse } : {}) };
    let error: string | undefined;
    if (match[4] && Number(match[4]) !== chapter) error = 'This citation crosses chapters. Split it into one reference per chapter before checking.';
    else if (chapter < 1 || chapter > book.chapters || verse < 1 || verse > book.verseCounts[chapter - 1] || (endVerse !== undefined && (endVerse < verse || endVerse > book.verseCounts[chapter - 1]))) error = 'This reference is outside the checked edition’s book inventory. Correct it in the transcript.';
    return { span: { start: match.index, end: match.index + match[0].length, text: match[0] }, reference, timestamp: timestampBefore(text, match.index), ...(error ? { error, errorType: match[4] && Number(match[4]) !== chapter ? 'cross_chapter' as const : 'inventory' as const } : {}) };
  });
}

function nearbySpan(text: string, span: TranscriptSpan): TranscriptSpan {
  const start = Math.max(text.lastIndexOf('\n', span.start - 1) + 1, span.start - 240);
  const nextLine = text.indexOf('\n', span.end);
  const end = Math.min(nextLine < 0 ? text.length : nextLine, span.end + 1000);
  return { start, end, text: text.slice(start, end) };
}
function quotationFor(text: string, mention: DetectedReference, mentions: DetectedReference[]): TranscriptSpan | undefined {
  const nearby = nearbySpan(text, mention.span);
  const quotes = [...nearby.text.matchAll(/"([^"\n]{2,1800})"|“([^”\n]{2,1800})”/g)].map(match => ({ start: nearby.start + match.index + 1, end: nearby.start + match.index + match[0].length - 1, text: match[1] || match[2] }));
  const proximity = (quote: TranscriptSpan, ref: TranscriptSpan) => {
    const distance = quote.start >= ref.end ? quote.start - ref.end : ref.start >= quote.end ? ref.start - quote.end : Number.POSITIVE_INFINITY;
    if (distance > 240) return Number.POSITIVE_INFINITY;
    const before = quote.start >= ref.end ? text.slice(ref.end, quote.start) : '';
    const after = ref.start >= quote.end ? text.slice(quote.end, ref.start) : '';
    const introduced = /^[\s,:;—-]*(?:(?:says?|reads?|states?|writes?|declares?|tells us)\s*[:,]?\s*)?["“]$/i.test(before);
    const attributed = /^[”"]\s*[\[(—-]\s*$/.test(after);
    return introduced || attributed ? distance / 10 : 100 + distance;
  };
  const candidates = quotes.filter(quote => Number.isFinite(proximity(quote, mention.span)) && !mentions.some(other => other !== mention && proximity(quote, other.span) <= proximity(quote, mention.span)));
  return candidates.sort((a, b) => proximity(a, mention.span) - proximity(b, mention.span))[0];
}

export function quoteWords(text: string): string[] {
  return text.normalize('NFKC').replace(/’/g, "'").toLowerCase().match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu) || [];
}

/** Ordered token comparison is deliberately conservative; semantic truth is not inferred. */
export function compareQuotation(quotation: string, source: string): PassageEvidence['match'] {
  const quote = quoteWords(quotation), words = quoteWords(source);
  if (!quote.length || !words.length || quote.length > 400 || words.length > 5000) return 'not_compared';
  const exact = (offset: number) => quote.every((word, index) => word === words[offset + index]);
  if ((quote.length >= 4 || quote.length === words.length) && words.some((_word, offset) => exact(offset))) return 'exact_words';
  if (quote.length < 5) return 'different_words';
  // A local sequence alignment catches minor transcription changes without bag-of-words reordering.
  let previous = Array(words.length + 1).fill(0) as number[];
  for (let row = 1; row <= quote.length; row++) {
    const current = [row];
    for (let column = 1; column <= words.length; column++) current[column] = Math.min(previous[column] + 1, current[column - 1] + 1, previous[column - 1] + (quote[row - 1] === words[column - 1] ? 0 : 1));
    previous = current;
  }
  const distance = Math.min(...previous.slice(1));
  return distance / quote.length <= 0.22 ? 'approximate_words' : 'different_words';
}

function evidenceReferenceLabel(book: Book, reference: Reference) { return `${book.name} ${reference.chapter}:${reference.verse}${reference.endVerse && reference.endVerse !== reference.verse ? `–${reference.endVerse}` : ''}`; }

export async function scanTranscript(transcript: string, sources: ScanSource[], options: { signal?: AbortSignal; onProgress?: (complete: number, total: number) => void } = {}): Promise<ScanReport> {
  if (!transcript.trim()) throw new Error('Paste or upload a transcript before checking references.');
  if (!sources.length) throw new Error('No permitted Scripture source is available for this check.');
  if (sources.length > 8 || new Set(sources.map(source => source.manifest.edition.id)).size !== sources.length) throw new Error('Choose up to eight distinct permitted editions.');
  const referenceBooks = new Map<string, BookInfo>();
  for (const source of sources) for (const book of source.manifest.books) if (!referenceBooks.has(book.id)) referenceBooks.set(book.id, book);
  const mentions = detectReferences(transcript, [...referenceBooks.values()]);
  const findings: SermonFinding[] = [];
  const books = new Map<string, Promise<Book>>();
  for (const mention of mentions.slice(0, MAX_SCAN_REFERENCES)) {
    options.signal?.throwIfAborted();
    const span = nearbySpan(transcript, mention.span), quotation = quotationFor(transcript, mention, mentions);
    const evidence: PassageEvidence[] = [], uncertainty: string[] = [];
    if (mention.timestamp) uncertainty.push('Timestamp copied from the nearest preceding transcript timestamp; audio timing has not been verified.');
    if (quotation) uncertainty.push('The nearest quoted span was linked by proximity. Confirm that it belongs to this reference.');
    if (mention.error) uncertainty.push(mention.error);
    if (!mention.error || (mention.errorType === 'inventory' && sources.some(source => {
      const book = source.manifest.books.find(item => item.id === mention.reference.bookId), ref = mention.reference, end = ref.endVerse || ref.verse;
      return book && ref.chapter >= 1 && ref.chapter <= book.chapters && ref.verse >= 1 && end >= ref.verse && end <= book.verseCounts[ref.chapter - 1];
    }))) for (const source of sources) {
      const { manifest } = source, edition = manifest.edition, reference = { ...mention.reference, editionId: edition.id };
      try {
        const bookInfo = manifest.books.find(book => book.id === reference.bookId);
        const end = reference.endVerse || reference.verse;
        if (!bookInfo || reference.chapter > bookInfo.chapters || end > bookInfo.verseCounts[reference.chapter - 1]) throw new Error('The reference is absent from this edition’s inventory.');
        const key = `${edition.id}:${reference.bookId}`;
        if (!books.has(key)) books.set(key, source.book(reference.bookId));
        const book = await books.get(key)!;
        options.signal?.throwIfAborted();
        if (book.id !== reference.bookId) throw new Error('The source book identity did not match the citation.');
        const chapter = book.chapters.find(item => item.number === reference.chapter);
        const verses = chapter?.verses.filter(verse => verse.number >= reference.verse && verse.number <= end) || [];
        if (verses.length !== end - reference.verse + 1 || verses.some((verse, index) => verse.number !== reference.verse + index || !verse.text.trim())) throw new Error('The source does not supply main-text wording at every cited verse number. No replacement wording was supplied.');
        const context = chapter!.verses.filter(verse => verse.number >= Math.max(1, reference.verse - 2) && verse.number <= end + 2);
        const exactSource = JSON.stringify({ editionId: edition.id, bookId: book.id, chapter: reference.chapter, verses });
        evidence.push({ reference, label: evidenceReferenceLabel(book, reference), editionName: edition.name, sourceUrl: edition.sourceUrl, license: edition.license, licenseUrl: edition.licenseUrl, attribution: edition.attribution || edition.name, ...(edition.sha256 ? { editionHash: edition.sha256 } : {}), passageHash: await sha256(exactSource), verses, context, match: quotation ? compareQuotation(quotation.text, verses.map(verse => verse.text).join(' ')) : 'not_compared' });
      } catch (error) {
        options.signal?.throwIfAborted();
        uncertainty.push(`${edition.name}: ${error instanceof Error ? error.message : 'Source wording could not be loaded.'}`);
      }
    }
    let category: FindingCategory = 'insufficient_evidence';
    let explanation = 'The checked sources cannot establish a quotation match. Correct the transcript or inspect other permitted editions before drawing a conclusion.';
    const explicitlyParaphrased = /\b(?:paraphras(?:e|ed|ing)|in (?:my|our|other) words|put (?:it )?(?:simply|another way))\b/i.test(span.text);
    if (evidence.length && explicitlyParaphrased) {
      category = 'explicit_paraphrase'; explanation = 'The transcript identifies a paraphrase. The wording is not treated as a verbatim quotation; faithfulness of its meaning needs human review.';
    } else if (evidence.length && !quotation) {
      category = 'missing_context_requiring_review'; explanation = 'This is a reference mention. No nearby text in double quotation marks was identified for wording comparison. Read the passage and surrounding chapter before assessing the claim.';
    } else if (evidence.some(item => item.match === 'exact_words')) {
      category = evidence.find(item => item.reference.editionId === sources[0].manifest.edition.id)?.match === 'exact_words' ? 'exact_quotation' : 'likely_alternative_edition';
      explanation = 'The quoted words occur in a checked passage in the same order, ignoring case, punctuation and spacing. This does not establish that the quotation is complete or that its interpretation follows from the passage.';
    } else if (evidence.some(item => item.match === 'approximate_words')) {
      category = 'approximate_quotation'; explanation = 'An ordered word comparison found similar wording. Even a small word change can alter meaning. A different edition, paraphrase or transcription error may explain the difference; inspect it yourself.';
    } else if (quotation && evidence.length) uncertainty.push('A non-match in these editions is not proof of misquotation. Other translations and legitimate paraphrases have not been ruled out.');
    if (evidence.length) uncertainty.push('The context excerpt is limited to two verses before and after the citation. The full chapter and wider literary setting may be needed.');
    findings.push({ id: `finding-${mention.span.start}-${mention.span.end}`, transcriptSpan: span, referenceSpan: mention.span, ...(mention.timestamp ? { timestamp: mention.timestamp } : {}), ...(quotation ? { quotation } : {}), claim: quotation?.text || span.text, references: evidence.map(item => item.reference), category, evidence, explanation, uncertainty });
    options.onProgress?.(findings.length, Math.min(mentions.length, MAX_SCAN_REFERENCES));
  }
  options.signal?.throwIfAborted();
  return { schemaVersion: 1, createdAt: new Date().toISOString(), transcriptHash: await sha256(transcript), checkedEditions: sources.map(({ manifest }) => ({ id: manifest.edition.id, name: manifest.edition.name, sourceUrl: manifest.edition.sourceUrl, ...(manifest.edition.sha256 ? { editionHash: manifest.edition.sha256 } : {}) })), findings, detectedReferences: mentions.length, scope: `Local transcript reference and quoted-word comparison; ${findings.length} of ${mentions.length} detected references checked. Explicit book chapter:verse citations only; quoted spans must use double quotation marks. English book names and common abbreviations are supported. No live audio, speech transcription, unreferenced-quotation search, theological judgment, intent assessment or automated interpretation check is performed.` };
}

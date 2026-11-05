import suppliedKey from '../../data/original-language/morphgnt-sblgnt/morphology.json' with { type: 'json' };

export const SOURCE_ID = 'morphgnt-sblgnt';
export const SOURCE_REVISION = 'aaed91e57c8e4a8dc9a2383e129ca5e75fe6393d';
export const TEXT_ATTRIBUTION = 'SBL Greek New Testament. Copyright 2010 by the Society of Biblical Literature and Logos Bible Software. Licensed under Creative Commons Attribution 4.0 International.';
export const ANNOTATION_ATTRIBUTION = 'Tauber, J. K., ed. (2017) MorphGNT: SBLGNT Edition. Version 6.12 [Data set]. https://github.com/morphgnt/sblgnt DOI: 10.5281/zenodo.376200';
export const BOOK_IDS = ['Mt','Mk','Lk','Jn','Ac','Ro','1Co','2Co','Ga','Eph','Php','Col','1Th','2Th','1Ti','2Ti','Tit','Phm','Heb','Jas','1Pe','2Pe','1Jn','2Jn','3Jn','Jud','Re'] as const;
export const NOTICE_PATHS = ['notices/CC-BY-4.0.txt','notices/CC-BY-SA-3.0.txt','notices/MorphGNT-README.md','notices/SBLGNT-About.md','notices/SBLGNT-README.md'] as const;
export const LEMMA_PAGE_SIZE = 25;

export interface FilePin { path: string; bytes: number; sha256: string }
export interface ChapterDescriptor { number: string; sourcePrefix: string; verseNumbers: string[]; verseCount: number; tokenCount: number }
export interface BookDescriptor extends FilePin {
  id: string; name: string; sourceBookNumber: string; sourcePath: string; sourceBytes: number; sourceSha256: string;
  chapterCount: number; verseCount: number; tokenCount: number; chapters: ChapterDescriptor[];
}
export interface SourceManifest {
  schemaVersion: 1; sourceId: string; sourceRevision: string; title: string; language: 'grc'; direction: 'ltr';
  textLicense: 'CC-BY-4.0'; annotationLicense: 'CC-BY-SA-3.0'; textAttribution: string; annotationAttribution: string;
  textLicenseUrl: string; annotationLicenseUrl: string; books: BookDescriptor[]; outputs: FilePin[]; noticePaths: string[];
  bookCount: number; chapterCount: number; verseCount: number; tokenCount: number; uniqueLemmaCount: number;
  humanEditorialApproval: false;
}
export interface SourceToken { sourceLine: number; ordinal: number; partOfSpeech: string; parsing: string; text: string; word: string; normalized: string; lemma: string }
export interface SourceVerse { number: string; reference: string; tokens: SourceToken[] }
export interface SourceChapter { number: string; sourcePrefix: string; verses: SourceVerse[] }
export interface SourceBook { schemaVersion: 1; sourceId: string; sourceRevision: string; book: string; name: string; sourceBookNumber: string; sourceFile: string; chapters: SourceChapter[] }
export interface Morphology { schemaVersion: 1; sourceId: string; sourceRevision: string; sourcePath: string; license: string; partOfSpeech: Record<string,string>; positions: { index: number; name: string; codes: Record<string,string> }[]; placeholder: string; placeholderPolicy: string; limitations: string }
export interface TokenLocation { chapter: string; verse: string; reference: string; token: SourceToken }

function valid(condition: unknown): asserts condition { if (!condition) throw new Error('The pinned Greek source has an invalid or incomplete schema. No altered source text was opened.'); }
function object(value: unknown): Record<string,unknown> { valid(value !== null && typeof value === 'object' && !Array.isArray(value)); return value as Record<string,unknown>; }
function list(value: unknown, maximum: number, minimum = 0): unknown[] { valid(Array.isArray(value) && value.length >= minimum && value.length <= maximum); return value; }
function text(value: unknown, maximum = 256): string { valid(typeof value === 'string' && value.length > 0 && value.length <= maximum); return value; }
function integer(value: unknown, minimum: number, maximum: number): number { valid(typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= maximum); return value; }
function decimal(value: unknown): string { valid(typeof value === 'string' && /^[1-9]\d{0,2}$/.test(value)); return value; }
function exactKeys(value: Record<string,unknown>, names: string[]) { valid(Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name))); }
function identity(value: Record<string,unknown>) { valid(value.schemaVersion === 1 && value.sourceId === SOURCE_ID && value.sourceRevision === SOURCE_REVISION); }
function output(value: unknown, pins: ReadonlyMap<string,FilePin>): FilePin {
  const row = object(value), path = text(row.path), expected = pins.get(path);
  valid(expected && row.bytes === expected.bytes && row.sha256 === expected.sha256);
  return value as FilePin;
}

export function validateManifest(value: unknown, pins: ReadonlyMap<string,FilePin>): SourceManifest {
  const root = object(value); identity(root);
  valid(root.title === 'MorphGNT: SBLGNT Edition' && root.language === 'grc' && root.direction === 'ltr');
  valid(root.textLicense === 'CC-BY-4.0' && root.annotationLicense === 'CC-BY-SA-3.0' && root.textAttribution === TEXT_ATTRIBUTION && root.annotationAttribution === ANNOTATION_ATTRIBUTION);
  valid(root.textLicenseUrl === 'https://creativecommons.org/licenses/by/4.0/' && root.annotationLicenseUrl === 'https://creativecommons.org/licenses/by-sa/3.0/');
  valid(root.sourcePinPath === 'source.json' && root.morphologyPath === 'morphology.json' && root.humanEditorialApproval === false);
  for (const name of ['alignment','glosses','transliteration','audio','alternativeReadings','strongs']) valid(root[name] === null);
  valid(JSON.stringify(root.noticePaths) === JSON.stringify(NOTICE_PATHS));
  valid(root.bookCount === 27 && root.chapterCount === 260 && root.verseCount === 7927 && root.tokenCount === 137554 && root.uniqueLemmaCount === 5461);
  const books = list(root.books, 27, 27); let chapters = 0, verses = 0, tokens = 0;
  books.forEach((value, index) => {
    const row = object(value), id = BOOK_IDS[index], prefix = String(index + 1).padStart(2, '0');
    valid(row.id === id && row.sourceBookNumber === prefix && row.path === `books/${id}.json` && row.sourcePath === `${61 + index}-${id}-morphgnt.txt`);
    text(row.name, 80); integer(row.sourceBytes, 1, 4 * 1024 * 1024); valid(/^[a-f0-9]{64}$/.test(text(row.sourceSha256, 64))); output(row, pins);
    const rows = list(row.chapters, 30, 1); valid(rows.length === row.chapterCount);
    let verseTotal = 0, tokenTotal = 0;
    rows.forEach((value, chapterIndex) => {
      const chapter = object(value); valid(chapter.number === String(chapterIndex + 1) && chapter.sourcePrefix === prefix + String(chapterIndex + 1).padStart(2, '0'));
      const numbers = list(chapter.verseNumbers, 200, 1); valid(numbers.length === chapter.verseCount);
      let previous = 0; for (const number of numbers) { const numeric = Number(decimal(number)); valid(numeric > previous && numeric < 100); previous = numeric; }
      verseTotal += numbers.length; tokenTotal += integer(chapter.tokenCount, 1, 10000);
    });
    valid(verseTotal === row.verseCount && tokenTotal === row.tokenCount); chapters += rows.length; verses += verseTotal; tokens += tokenTotal;
  });
  valid(chapters === root.chapterCount && verses === root.verseCount && tokens === root.tokenCount);
  const outputs = list(root.outputs, 33, 33), paths = new Set<string>();
  for (const entry of outputs) { const pin = output(entry, pins); valid(!paths.has(pin.path)); paths.add(pin.path); }
  for (const path of [...BOOK_IDS.map(id => `books/${id}.json`), 'morphology.json', ...NOTICE_PATHS]) valid(paths.has(path));
  return value as SourceManifest;
}

/** Structural validation supplements the compiled byte/hash pins; it never repairs source fields. */
export function validateBook(value: unknown, descriptor: BookDescriptor): SourceBook {
  const root = object(value); identity(root);
  exactKeys(root, ['schemaVersion','sourceId','sourceRevision','book','name','sourceBookNumber','sourceFile','chapters']);
  valid(root.book === descriptor.id && root.name === descriptor.name && root.sourceBookNumber === descriptor.sourceBookNumber && root.sourceFile === descriptor.sourcePath);
  const chapters = list(root.chapters, 30, 1); valid(chapters.length === descriptor.chapters.length);
  let sourceLine = 0, verseTotal = 0;
  chapters.forEach((value, chapterIndex) => {
    const chapter = object(value), expected = descriptor.chapters[chapterIndex]; exactKeys(chapter, ['number','sourcePrefix','verses']);
    valid(chapter.number === expected.number && chapter.sourcePrefix === expected.sourcePrefix);
    const verses = list(chapter.verses, 200, 1); valid(verses.length === expected.verseNumbers.length); let tokenTotal = 0;
    verses.forEach((value, verseIndex) => {
      const verse = object(value), number = expected.verseNumbers[verseIndex]; exactKeys(verse, ['number','reference','tokens']);
      valid(verse.number === number && verse.reference === expected.sourcePrefix + number.padStart(2, '0'));
      list(verse.tokens, 500, 1).forEach((value, tokenIndex) => {
        const token = object(value); exactKeys(token, ['sourceLine','ordinal','partOfSpeech','parsing','text','word','normalized','lemma']);
        valid(token.sourceLine === ++sourceLine && token.ordinal === tokenIndex + 1);
        valid(/^[A-Z-]{2}$/.test(text(token.partOfSpeech, 2)) && /^[A-Z1-3-]{8}$/.test(text(token.parsing, 8)));
        for (const field of ['text','word','normalized','lemma']) valid(!/[\s\u0000-\u001f\u007f]/u.test(text(token[field], 256)));
        tokenTotal++;
      });
    });
    valid(tokenTotal === expected.tokenCount); verseTotal += verses.length;
  });
  valid(sourceLine === descriptor.tokenCount && verseTotal === descriptor.verseCount);
  return value as SourceBook;
}

export function validateMorphology(value: unknown): Morphology {
  // The small build-time key is the exact README extraction. In particular it
  // does not define case V; a runtime key cannot invent that missing expansion.
  valid(JSON.stringify(value) === JSON.stringify(suppliedKey));
  return value as Morphology;
}
export function describeToken(token: SourceToken, morphology: Morphology) {
  return {
    partOfSpeech: Object.hasOwn(morphology.partOfSpeech, token.partOfSpeech) ? morphology.partOfSpeech[token.partOfSpeech] : null,
    positions: morphology.positions.map(position => ({ name: position.name, raw: token.parsing[position.index], description: Object.hasOwn(position.codes, token.parsing[position.index]) ? position.codes[token.parsing[position.index]] : null })),
  };
}
export function verseText(verse: SourceVerse): string { return verse.tokens.map(token => token.text).join(' '); }
export function* tokensInBook(book: SourceBook): Generator<TokenLocation> {
  for (const chapter of book.chapters) for (const verse of chapter.verses) for (const token of verse.tokens) yield { chapter: chapter.number, verse: verse.number, reference: verse.reference, token };
}
export function findToken(book: SourceBook, sourceLine: number): TokenLocation | undefined { for (const location of tokensInBook(book)) if (location.token.sourceLine === sourceLine) return location; }
export function lemmaPage(book: SourceBook, lemma: string, requestedPage = 0) {
  if (typeof lemma !== 'string' || lemma.length > 256 || !Number.isSafeInteger(requestedPage) || requestedPage < 0) throw new Error('Choose an exact supplied lemma field and a valid results page.');
  let occurrences = 0, distinctVerses = 0;
  for (const chapter of book.chapters) for (const verse of chapter.verses) {
    let represented = false; for (const token of verse.tokens) if (token.lemma === lemma) { occurrences++; represented = true; }
    if (represented) distinctVerses++;
  }
  const pages = Math.ceil(occurrences / LEMMA_PAGE_SIZE), page = Math.min(requestedPage, Math.max(0, pages - 1));
  const results: TokenLocation[] = []; let index = 0;
  for (const location of tokensInBook(book)) if (location.token.lemma === lemma) {
    if (index++ >= page * LEMMA_PAGE_SIZE) results.push(location);
    if (results.length === LEMMA_PAGE_SIZE) break;
  }
  return { occurrences, distinctVerses, pages, page, results };
}

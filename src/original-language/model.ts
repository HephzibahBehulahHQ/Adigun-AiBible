/** Exact OSHB source records: no normalization, alignment or inferred word meanings. */
export const OSHB_REVISION = '3d15126fb1ef74867fc1434be1942e837932691f';
export const OSHB_ATTRIBUTION = 'Original work of the Open Scriptures Hebrew Bible available at https://github.com/openscriptures/morphhb';
export const OSHB_BOOK_IDS = ['Gen','Exod','Lev','Num','Deut','Josh','Judg','Ruth','1Sam','2Sam','1Kgs','2Kgs','1Chr','2Chr','Ezra','Neh','Esth','Job','Ps','Prov','Eccl','Song','Isa','Jer','Lam','Ezek','Dan','Hos','Joel','Amos','Obad','Jonah','Mic','Nah','Hab','Zeph','Hag','Zech','Mal'] as const;
export const LEMMA_PAGE_SIZE = 25;
export type NodeTag = 'w' | 'seg' | 'note' | 'catchWord' | 'rdg';
export interface SourceNode { tag: NodeTag; attributes: Record<string, string>; content: SourceContent[] }
export type SourceContent = string | SourceNode;
export interface SourceVerse { osisId: string; number: string; content: SourceContent[] }
export interface SourceChapter { schemaVersion: 1; sourceId: 'oshb'; sourceRevision: string; osisId: string; book: string; number: string; verses: SourceVerse[] }
export interface SourceBook { schemaVersion: 1; sourceId: 'oshb'; sourceRevision: string; book: string; name: string; chapters: SourceChapter[] }
export interface FilePin { path: string; bytes: number; sha256: string }
export interface ChapterDescriptor { osisId: string; number: string; verseNumbers: string[]; verseCount: number }
export interface BookDescriptor extends FilePin { id: string; name: string; chapterCount: number; verseCount: number; chapters: ChapterDescriptor[] }
export interface SourceManifest { schemaVersion: 1; sourceId: 'oshb'; sourceRevision: string; title: string; attribution: string; books: BookDescriptor[]; outputs: FilePin[]; bookCount: number; chapterCount: number; verseCount: number }
export interface Morphology { schemaVersion: 1; sourceId: 'oshb'; sourceRevision: string; codes: Record<string, string> }
export interface WordLocation { chapter: string; verse: string; osisId: string; word: SourceNode; alternative: boolean }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function fail(part: string): never { throw new Error(`The pinned Hebrew source has an invalid ${part}. No changed source text was opened.`); }
const number = (value: unknown): value is string => typeof value === 'string' && /^[1-9]\d{0,2}$/.test(value);
const text = (value: unknown, limit = 4096): value is string => typeof value === 'string' && value.length <= limit;
const identity = (value: Record<string, unknown>): boolean => value.schemaVersion === 1 && value.sourceId === 'oshb' && value.sourceRevision === OSHB_REVISION;
const equalPin = (left: FilePin, right: FilePin | undefined): boolean => !!right && left.bytes === right.bytes && left.sha256 === right.sha256;

export function validateManifest(value: unknown, pins: ReadonlyMap<string, FilePin>): SourceManifest {
  if (!object(value) || !identity(value) || value.title !== 'Open Scriptures Hebrew Bible' || value.attribution !== OSHB_ATTRIBUTION
    || value.textLicense !== 'Public Domain (upstream declaration)' || value.annotationLicense !== 'CC-BY-4.0'
    || value.licenseUrl !== 'https://creativecommons.org/licenses/by/4.0/' || value.bookCount !== 39 || value.chapterCount !== 929 || value.verseCount !== 23213
    || value.direction !== 'rtl' || value.alignment !== null || !Array.isArray(value.books) || value.books.length !== 39 || !Array.isArray(value.outputs)) fail('manifest identity or coverage');
  let chapters = 0, verses = 0;
  const ids = new Set<string>();
  for (const book of value.books) {
    if (!object(book) || typeof book.id !== 'string' || !OSHB_BOOK_IDS.includes(book.id as typeof OSHB_BOOK_IDS[number]) || ids.has(book.id)
      || !text(book.name, 100) || book.path !== `books/${book.id}.json` || !equalPin(book as unknown as FilePin, pins.get(String(book.path)))
      || !Array.isArray(book.chapters) || !book.chapters.length || book.chapters.length > 150 || book.chapterCount !== book.chapters.length) fail('book descriptor');
    ids.add(book.id); const chapterIds = new Set<string>(); let bookVerses = 0;
    for (const chapter of book.chapters) {
      if (!object(chapter) || !number(chapter.number) || chapter.osisId !== `${book.id}.${chapter.number}` || chapterIds.has(chapter.number)
        || !Array.isArray(chapter.verseNumbers) || !chapter.verseNumbers.length || chapter.verseNumbers.length > 200 || chapter.verseCount !== chapter.verseNumbers.length
        || chapter.verseNumbers.some(verse => !number(verse)) || new Set(chapter.verseNumbers).size !== chapter.verseNumbers.length) fail('source chapter or verse numbering');
      chapterIds.add(chapter.number); bookVerses += chapter.verseNumbers.length;
    }
    if (book.verseCount !== bookVerses) fail('book verse count');
    chapters += book.chapters.length; verses += bookVerses;
  }
  if (chapters !== 929 || verses !== 23213) fail('complete source coverage');
  const outputPaths = new Set<string>();
  for (const output of value.outputs) {
    if (!object(output) || typeof output.path !== 'string' || outputPaths.has(output.path) || !equalPin(output as unknown as FilePin, pins.get(output.path))) fail('output checksum record');
    outputPaths.add(output.path);
  }
  if ([...pins.keys()].some(path => !['manifest.json','source.json','integrity.json'].includes(path) && !outputPaths.has(path))) fail('complete output inventory');
  return value as unknown as SourceManifest;
}

const CHILDREN: Record<string, readonly string[]> = { verse: ['w','seg','note'], w: ['seg'], seg: [], note: ['catchWord','rdg'], catchWord: [], rdg: ['w','seg'] };
const ATTRIBUTES: Record<NodeTag, readonly string[]> = { w: ['id','lemma','morph','n','type'], seg: ['type','subType'], note: ['n','type'], catchWord: [], rdg: ['type'] };
const TYPES: Record<NodeTag, readonly string[]> = { w: ['x-ketiv'], seg: ['x-large','x-maqqef','x-paseq','x-pe','x-reversednun','x-samekh','x-small','x-sof-pasuq','x-suspended'], note: ['alternative','exegesis','variant'], catchWord: [], rdg: ['x-accent','x-qere'] };

export function validateBook(value: unknown, descriptor: BookDescriptor): SourceBook {
  if (!object(value) || !identity(value) || value.book !== descriptor.id || value.name !== descriptor.name || !object(value.sourceHeader) || !object(value.sourceTextAttributes)
    || !Array.isArray(value.chapters) || value.chapters.length !== descriptor.chapters.length) fail('book identity or complete chapter list');
  const wordIds = new Set<string>(); let nodes = 0;
  function content(value: unknown, parent: string, depth = 0): void {
    if (!Array.isArray(value) || value.length > 2048 || depth > 6) fail('bounded source content');
    for (const node of value) {
      if (++nodes > 250000) fail('source node count');
      if (typeof node === 'string') { if (!text(node)) fail('source string'); continue; }
      if (!object(node) || typeof node.tag !== 'string' || !CHILDREN[parent].includes(node.tag) || !object(node.attributes)
        || Object.keys(node).some(key => !['tag','attributes','content'].includes(key))) fail('source node tag');
      const tag = node.tag as NodeTag;
      for (const [key, attribute] of Object.entries(node.attributes)) {
        if (!ATTRIBUTES[tag].includes(key) || !text(attribute, 256)) fail('source node attribute');
        if (key === 'type' && !TYPES[tag].includes(attribute)) fail('source node type');
        if (key === 'subType' && attribute !== 'x-ketiv') fail('source segment subtype');
      }
      if (tag === 'w') {
        if (!text(node.attributes.id, 32) || !node.attributes.id || wordIds.has(node.attributes.id) || !text(node.attributes.lemma, 256) || !node.attributes.lemma || !text(node.attributes.morph, 256) || !node.attributes.morph) fail('word identity, lemma or morphology');
        wordIds.add(node.attributes.id);
      }
      if (tag === 'seg' && !node.attributes.type) fail('source segment type');
      content(node.content, tag, depth + 1);
    }
  }
  value.chapters.forEach((chapter, index) => {
    const expected = descriptor.chapters[index];
    if (!object(chapter) || !identity(chapter) || chapter.book !== descriptor.id || chapter.osisId !== expected.osisId || chapter.number !== expected.number
      || !Array.isArray(chapter.verses) || chapter.verses.length !== expected.verseNumbers.length) fail('complete chapter identity');
    chapter.verses.forEach((verse, verseIndex) => {
      const expectedVerse = expected.verseNumbers[verseIndex];
      if (!object(verse) || verse.number !== expectedVerse || verse.osisId !== `${expected.osisId}.${expectedVerse}`) fail('complete verse identity');
      content(verse.content, 'verse');
    });
  });
  return value as unknown as SourceBook;
}

export function validateMorphology(value: unknown): Morphology {
  if (!object(value) || !identity(value) || value.license !== 'CC-BY-4.0' || !object(value.codes) || Object.keys(value.codes).length !== 3481
    || Object.entries(value.codes).some(([code, description]) => !/^[A-Za-z0-9/]{1,100}$/.test(code) || !text(description, 2048) || !description)) fail('morphology key');
  return value as unknown as Morphology;
}
export const sourceText = (node: SourceContent): string => typeof node === 'string' ? node : node.content.map(sourceText).join('');
export const mainContent = (verse: SourceVerse): SourceContent[] => verse.content.filter(node => typeof node === 'string' || node.tag !== 'note');
export const verseNotes = (verse: SourceVerse): SourceNode[] => verse.content.filter((node): node is SourceNode => typeof node !== 'string' && node.tag === 'note');
export function* wordsInBook(book: SourceBook, includeAlternatives = false): Generator<WordLocation> {
  function* inContent(content: SourceContent[], chapter: string, verse: SourceVerse, alternative = false): Generator<WordLocation> {
    for (const node of content) {
      if (typeof node === 'string') continue;
      if (node.tag === 'w') yield { chapter, verse: verse.number, osisId: verse.osisId, word: node, alternative };
      else if (includeAlternatives && (node.tag === 'note' || node.tag === 'rdg')) yield* inContent(node.content, chapter, verse, true);
    }
  }
  for (const chapter of book.chapters) for (const verse of chapter.verses) yield* inContent(verse.content, chapter.number, verse);
}
export function findWord(book: SourceBook, id: string): WordLocation | undefined {
  for (const location of wordsInBook(book, true)) if (location.word.attributes.id === id) return location;
}
export function lemmaPage(book: SourceBook, lemma: string, requestedPage = 0, includeAlternatives = false): { occurrences: number; distinctVerses: number; page: number; pages: number; results: WordLocation[] } {
  if (typeof lemma !== 'string' || lemma.length > 256 || !Number.isSafeInteger(requestedPage) || requestedPage < 0) throw new Error('Choose a supplied lemma field and a valid result page.');
  let occurrences = 0; const verses = new Set<string>();
  for (const location of wordsInBook(book, includeAlternatives)) if (lemma && location.word.attributes.lemma === lemma) { occurrences++; verses.add(location.osisId); }
  const pages = Math.ceil(occurrences / LEMMA_PAGE_SIZE), page = Math.min(requestedPage, Math.max(0, pages - 1)), results: WordLocation[] = [];
  let position = 0;
  for (const location of wordsInBook(book, includeAlternatives)) if (lemma && location.word.attributes.lemma === lemma) {
    if (position++ < page * LEMMA_PAGE_SIZE) continue;
    if (results.length === LEMMA_PAGE_SIZE) break;
    results.push(location);
  }
  return { occurrences, distinctVerses: verses.size, page, pages, results };
}

import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const PINNED_ARCHIVE = '37a8ccecfbc765a2305ae64f3b5e88d1d01bafceb9a33e8d191f6ee551a437b9';
const PINNED_PROVENANCE = '431cc977d5215baf5d1a7990ba7363451b3e26f35245d531c558f1694a245116';
const key = (bookId, chapter, verse) => `${bookId}.${chapter}.${verse}`;
const check = (condition, message) => { if (!condition) throw new Error(message); };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

export async function validateCorpus({ dataDir = resolve(root, 'data'), curationPath = resolve(root, 'src/curation.ts') } = {}) {
  const provenanceBytes = await readFile(resolve(dataDir, 'provenance.json'));
  // Windows checkouts may normalize the single final line ending. Verify the
  // canonical JSON bytes used for the reviewed source pin, not checkout style.
  const canonicalProvenanceBytes = Buffer.from(provenanceBytes.toString('utf8').replace(/\r\n/g, '\n'));
  check(sha(canonicalProvenanceBytes) === PINNED_PROVENANCE, 'Provenance does not match the reviewed import. Reimport the pinned archive.');
  const provenance = JSON.parse(canonicalProvenanceBytes);
  check(provenance.archiveSha256 === PINNED_ARCHIVE, 'Unexpected source archive.');
  const files = Object.entries(provenance.generatedFileSha256);
  check(files.length === 68, 'Expected 66 books, one manifest, and one search index.');
  const documents = new Map();
  for (const [relative, expected] of files) {
    check(/^(books\/[1-3]?[A-Z]{2,3}|manifest|search-index)\.json$/.test(relative), 'Unsafe or unexpected content path.');
    const raw = await readFile(resolve(dataDir, relative));
    const canonicalBytes = Buffer.from(raw.toString('utf8').replace(/\r\n/g, '\n'));
    check(sha(canonicalBytes) === expected, `Source integrity failed: ${relative}`);
    documents.set(relative, JSON.parse(canonicalBytes));
  }
  const bookFiles = await readdir(resolve(dataDir, 'books'));
  check(bookFiles.length === 66 && bookFiles.every(file => documents.has(`books/${file}`)), 'Unexpected, missing, or duplicate book files.');
  const manifest = documents.get('manifest.json');
  check(manifest.schemaVersion === 1 && manifest.edition.id === 'eng-web' && manifest.edition.language === 'en', 'Incorrect edition identity.');
  check(manifest.edition.sha256 === PINNED_ARCHIVE && manifest.edition.license === 'Public domain', 'Incorrect source identity or rights metadata.');
  check(manifest.books.length === 66, 'The source manifest must cover all 66 books.');
  const sourceEmpty = new Set(provenance.sourceEmptyReferences.map(r => key(r.bookId, r.chapter, r.verse)));
  const encounteredEmpty = new Set(), references = new Map(), rebuiltIndex = [];
  let chapters = 0;
  for (const [i, info] of manifest.books.entries()) {
    const expected = provenance.canonicalBooks[i];
    check(info.id === expected.id && info.name === expected.name && info.chapters === expected.chapters, `Canonical inventory mismatch at book ${i + 1}.`);
    const book = documents.get(`books/${info.id}.json`);
    check(book.id === info.id && book.name === info.name && book.chapters.length === info.chapters, `Book metadata mismatch: ${info.id}`);
    check(info.verseCounts.length === info.chapters, `Incomplete chapter inventory: ${info.id}`);
    for (const [c, chapter] of book.chapters.entries()) {
      check(chapter.number === c + 1 && chapter.verses.length === info.verseCounts[c] && chapter.verses.length > 0, `Chapter coverage mismatch: ${info.id} ${c + 1}`);
      chapters++;
      for (const [v, verse] of chapter.verses.entries()) {
        const id = key(info.id, chapter.number, verse.number);
        check(verse.number === v + 1 && typeof verse.text === 'string' && !references.has(id), `Invalid or duplicate verse: ${id}`);
        check(!verse.text.includes('\ufffd') && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(verse.text), `Invalid text encoding: ${id}`);
        if (!verse.text) { check(sourceEmpty.has(id), `Unexpected empty verse: ${id}`); encounteredEmpty.add(id); }
        else check(verse.text.trim() === verse.text, `Unexpected boundary whitespace: ${id}`);
        references.set(id, verse.text);
        rebuiltIndex.push({ bookId: info.id, chapter: chapter.number, verse: verse.number, text: verse.text });
      }
    }
  }
  check(encounteredEmpty.size === 5 && encounteredEmpty.size === sourceEmpty.size, 'The publisher’s five note-only records must remain explicit.');
  check(chapters === 1189 && references.size === 31103, 'Pinned edition coverage is incomplete.');
  check(manifest.totals.books === 66 && manifest.totals.chapters === chapters && manifest.totals.verses === references.size, 'Manifest totals do not match the imported corpus.');
  check(JSON.stringify(documents.get('search-index.json')) === JSON.stringify(rebuiltIndex), 'Search index does not match every imported source record.');
  const curation = await readFile(curationPath, 'utf8');
  const selections = [...curation.matchAll(/reference\('([1-3]?[A-Z]{2,3})'\s*,\s*(\d+)(?:\s*,\s*(\d+))?(?:\s*,\s*(\d+))?\)/g)];
  check(selections.length > 0, 'No literal curated references were found to validate.');
  for (const [, book, chapter, first = '1', last = first] of selections) {
    check(Number(last) >= Number(first), `Reversed curated range: ${book} ${chapter}:${first}-${last}`);
    for (let verse = Number(first); verse <= Number(last); verse++) {
      const id = key(book, Number(chapter), verse);
      check(references.has(id) && references.get(id), `Curated reference has no source text: ${id}`);
    }
  }
  return { edition: manifest.edition.name, books: 66, chapters, numberedRecords: references.size, recordsWithText: references.size - encounteredEmpty.size, sourceEmptyRecords: encounteredEmpty.size, curatedReferences: selections.length, archiveSha256: PINNED_ARCHIVE };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try { console.log(JSON.stringify(await validateCorpus(), null, 2)); }
  catch (error) { console.error(`Content validation failed: ${error.message}`); process.exitCode = 1; }
}

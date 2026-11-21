import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const sourceManifest = JSON.parse(await readFile(resolve(root, 'data/manifest.json'), 'utf8'));
const sourceHash = sourceManifest.edition.sha256;

// Only complete, reviewed chapters are installed. Add a chapter here after its
// candidate file exists and passes the exact source-reference and verse-count checks.
const portion = {
  GEN: { testament: 'ot', chapters: 50 },
  EXO: { testament: 'ot', chapters: 40 },
  LEV: { testament: 'ot', chapters: 27 },
  NUM: { testament: 'ot', chapters: 36 },
  DEU: { testament: 'ot', chapters: 34 },
  JOS: { testament: 'ot', chapters: 24 },
  MAT: { testament: 'nt', chapters: 28 },
};
const editionBooks = [];
for (const sourceBook of sourceManifest.books.filter(book => portion[book.id])) {
  const chapters = [];
  const { testament, chapters: chapterCount } = portion[sourceBook.id];
  for (let chapterNumber = 1; chapterNumber <= chapterCount; chapterNumber += 1) {
    const contentRoot = `content/genz/${testament}`;
    const path = resolve(root, contentRoot, sourceBook.id, `${String(chapterNumber).padStart(2, '0')}.json`);
    const candidate = JSON.parse(await readFile(path, 'utf8'));
    const sourceVerseCount = sourceBook.verseCounts[chapterNumber - 1];
    if (candidate.editionId !== 'adigun-genz' || candidate.sourceEditionId !== 'eng-web'
      || candidate.sourceManifestSha256 !== sourceHash || candidate.bookId !== sourceBook.id
      || candidate.bookName !== sourceBook.name || candidate.chapterNumber !== chapterNumber
      || !Array.isArray(candidate.verses) || candidate.verses.length !== sourceVerseCount
      || candidate.verses.some((verse, index) => verse.number !== index + 1
        || verse.sourceRef !== `eng-web:${sourceBook.id}:${chapterNumber}:${index + 1}` || !verse.text?.trim())) {
      throw new Error(`Adigun ${sourceBook.name} chapter ${chapterNumber} is incomplete or misaligned.`);
    }
    chapters.push({ number: chapterNumber, verses: candidate.verses.map(({ number, text }) => ({ number, text })) });
  }
  editionBooks.push({ id: sourceBook.id, name: sourceBook.name, chapters });
}
if (!editionBooks.length) throw new Error('No complete Adigun chapters are available.');

const totals = {
  books: editionBooks.length,
  chapters: editionBooks.reduce((sum, book) => sum + book.chapters.length, 0),
  verses: editionBooks.reduce((sum, book) => sum + book.chapters.reduce((chapterSum, chapter) => chapterSum + chapter.verses.length, 0), 0),
};
const revision = editionBooks.map(book => `${book.name} ${book.chapters[0].number}–${book.chapters.at(-1).number}`).join('; ');
const edition = {
  id: 'adigun-edition', name: 'Adigun Edition', language: 'en', scope: 'portion', revision,
  license: 'Project-authorized original edition',
  sourceUrl: 'https://adigun-aibible.hephzibahbehulah.com/',
  licenseUrl: 'https://github.com/HephzibahBehulahHQ/Adigun-AiBible/blob/main/data/editions/adigun-edition/NOTICE.txt',
  sha256: createHash('sha256').update(JSON.stringify({ sourceHash, books: editionBooks })).digest('hex'),
  attribution: 'Adigun Edition. Original project wording based on the public-domain World English Bible source.',
  rights: { redistribute: true, adapt: true, offline: true, audio: false, export: true },
  conditions: ['Keep the Adigun Edition identity and project notice with redistributed copies.'],
  noticePath: 'adigun-edition/NOTICE.txt',
};
const verseCounts = book => book.chapters.map(chapter => chapter.verses.length);
const manifest = {
  schemaVersion: 1,
  edition,
  sourceEditionId: 'eng-web',
  sourceManifestSha256: sourceHash,
  books: editionBooks.map(book => ({
    id: book.id, name: book.name, chapters: book.chapters.length,
    verseCounts: verseCounts(book), verseRecordCounts: verseCounts(book),
  })),
  totals,
};
const searchIndex = editionBooks.flatMap(book => book.chapters.flatMap(chapter => chapter.verses.map(verse => ({
  bookId: book.id, chapter: chapter.number, verse: verse.number, text: verse.text, editionId: edition.id,
}))));
const out = resolve(root, 'data/editions/adigun-edition');
const bookDirectory = resolve(out, 'books');
await mkdir(bookDirectory, { recursive: true });
const installed = new Set(editionBooks.map(book => `${book.id}.json`));
for (const file of await readdir(bookDirectory)) if (file.endsWith('.json') && !installed.has(file)) await rm(resolve(bookDirectory, file));
for (const book of editionBooks) await writeFile(resolve(bookDirectory, `${book.id}.json`), `${JSON.stringify(book)}\n`);
await writeFile(resolve(out, 'manifest.json'), `${JSON.stringify(manifest)}\n`);
await writeFile(resolve(out, 'search-index.json'), `${JSON.stringify(searchIndex)}\n`);

const catalogPath = resolve(root, 'data/editions/catalog.json');
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
const catalogEdition = catalog.editions.find(row => row.id === edition.id);
if (!catalogEdition) throw new Error('Adigun Edition is missing from the installed edition catalog.');
Object.assign(catalogEdition, { sha256: edition.sha256, revision, totals });
await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);

const rightsPath = resolve(root, 'data/editions/rights-register.json');
const rightsRegister = JSON.parse(await readFile(rightsPath, 'utf8'));
const rightsEdition = rightsRegister.editions.find(row => row.editionId === edition.id);
if (!rightsEdition) throw new Error('Adigun Edition is missing from the rights register.');
rightsEdition.sourceSha256 = edition.sha256;
await writeFile(rightsPath, `${JSON.stringify(rightsRegister, null, 2)}\n`);

console.log(`Built ${edition.name}: ${totals.books} books, ${totals.chapters} chapters, ${totals.verses} verses; ${edition.sha256}`);


import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const sourceManifest = JSON.parse(await readFile(resolve(root, 'data/manifest.json'), 'utf8'));
const sourceBook = sourceManifest.books.find(book => book.id === 'GEN');
if (!sourceBook) throw new Error('The pinned source manifest has no Genesis record.');
const sourceHash = sourceManifest.edition.sha256;
const candidateDirectory = resolve(root, 'content/genz/ot/GEN');
// This first reader release is intentionally pinned to the 21 chapters already
// integrated on main. New chapters enter after their metadata and rights hash
// are reviewed together; a later PR cannot silently expand the installed text.
const candidateFiles = (await readdir(candidateDirectory)).filter(name => /^\d{2}\.json$/.test(name) && Number(name.slice(0, 2)) <= 21).sort();
if (!candidateFiles.length) throw new Error('No completed Adigun Genesis chapters are available.');

const chapters = [];
for (let index = 0; index < candidateFiles.length; index++) {
  const candidate = JSON.parse(await readFile(resolve(candidateDirectory, candidateFiles[index]), 'utf8'));
  const chapterNumber = index + 1;
  const sourceVerseCount = sourceBook.verseCounts[index];
  if (candidate.editionId !== 'adigun-genz' || candidate.sourceEditionId !== 'eng-web'
    || candidate.sourceManifestSha256 !== sourceHash || candidate.bookId !== 'GEN'
    || candidate.chapterNumber !== chapterNumber || !Array.isArray(candidate.verses)
    || candidate.verses.length !== sourceVerseCount
    || candidate.verses.some((verse, verseIndex) => verse.number !== verseIndex + 1
      || verse.sourceRef !== `eng-web:GEN:${chapterNumber}:${verseIndex + 1}` || !verse.text?.trim())) {
    throw new Error(`Adigun Genesis chapter ${chapterNumber} is not complete and aligned to the pinned source.`);
  }
  chapters.push({ number: chapterNumber, verses: candidate.verses.map(({ number, text }) => ({ number, text })) });
}

const edition = {
  id: 'adigun-edition', name: 'Adigun Edition', language: 'en', scope: 'portion',
  license: 'Project-authorized original edition',
  sourceUrl: 'https://adigun-aibible.hephzibahbehulah.com/',
  licenseUrl: 'https://github.com/HephzibahBehulahHQ/Adigun-AiBible/blob/main/data/editions/adigun-edition/NOTICE.txt',
  sha256: createHash('sha256').update(JSON.stringify({ sourceHash, chapters })).digest('hex'),
  attribution: 'Adigun Edition. Original project wording based on the public-domain World English Bible source.',
  rights: { redistribute: true, adapt: true, offline: true, audio: false, export: true },
  conditions: ['Keep the Adigun Edition identity and project notice with redistributed copies.'],
  noticePath: 'adigun-edition/NOTICE.txt',
};
const book = { id: 'GEN', name: sourceBook.name, chapters };
const bookBytes = `${JSON.stringify(book)}\n`;
const verseCounts = chapters.map(chapter => chapter.verses.length);
const manifest = {
  schemaVersion: 1,
  edition,
  sourceEditionId: 'eng-web',
  sourceManifestSha256: sourceHash,
  books: [{ id: 'GEN', name: sourceBook.name, chapters: chapters.length, verseCounts, verseRecordCounts: verseCounts }],
  totals: {
    books: 1,
    chapters: chapters.length,
    verses: verseCounts.reduce((sum, count) => sum + count, 0),
  },
};
const searchIndex = chapters.flatMap(chapter => chapter.verses.map(verse => ({
  bookId: 'GEN', chapter: chapter.number, verse: verse.number, text: verse.text, editionId: edition.id,
})));
const out = resolve(root, 'data/editions/adigun-edition');
await mkdir(resolve(out, 'books'), { recursive: true });
await writeFile(resolve(out, 'books/GEN.json'), bookBytes);
await writeFile(resolve(out, 'manifest.json'), `${JSON.stringify(manifest)}\n`);
await writeFile(resolve(out, 'search-index.json'), `${JSON.stringify(searchIndex)}\n`);
console.log(`Built ${edition.name}: Genesis ${chapters.length} chapters, ${manifest.totals.verses} verses; ${edition.sha256}`);

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publisherSpeeches } from './model.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const readJSON = async path => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const catalog = await readJSON('data/editions/catalog.json');
const ids = ['eng-web', ...catalog.editions.filter(edition => edition.corpus === 'bible').map(edition => edition.id)];
const editions = [];
for (const editionId of ids) {
  const prefix = editionId === 'eng-web' ? 'data' : `data/editions/${editionId}`, manifest = await readJSON(`${prefix}/manifest.json`);
  const books = [];
  for (const entry of manifest.books) {
    const result = publisherSpeeches(await readJSON(`${prefix}/books/${entry.id}.json`), manifest.edition);
    books.push({ bookId: entry.id, spans: result.speeches.length, verses: new Set(result.speeches.map(speech => `${speech.reference.chapter}:${speech.reference.verse}`)).size, rejectedMetadata: result.issues.length });
  }
  editions.push({ editionId, sourceSha256: manifest.edition.sha256, status: 'publisher-metadata', marker: 'wj', offsetUnit: 'unicode-codepoint', totalSpans: books.reduce((sum, book) => sum + book.spans, 0), totalVerses: books.reduce((sum, book) => sum + book.verses, 0), books });
}
await mkdir(resolve(root, 'data/speakers'), { recursive: true });
await writeFile(resolve(root, 'data/speakers/publisher-coverage.json'), `${JSON.stringify({ schemaVersion: 1, generatedOn: new Date().toISOString().slice(0, 10), editions }, null, 2)}\n`);
console.log(JSON.stringify(editions.map(({ editionId, totalSpans, totalVerses }) => ({ editionId, totalSpans, totalVerses }))));

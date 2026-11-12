import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { publisherSpeeches } from '../src/speakers/model.ts';

const root = resolve(import.meta.dirname, '..');
const json = async path => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const catalog = await json('data/editions/catalog.json');
const ids = [...new Set(['eng-web', ...catalog.editions.filter(edition => edition.corpus === 'bible').map(edition => edition.id)])];
const editions = [];
for (const editionId of ids) {
  const prefix = editionId === 'eng-web' ? 'data' : `data/editions/${editionId}`;
  const manifest = await json(`${prefix}/manifest.json`);
  if (manifest.edition.id !== editionId || !/^[a-f0-9]{64}$/.test(manifest.edition.sha256 || '')) throw new Error(`Missing exact source identity: ${editionId}`);
  const books = [];
  for (const book of manifest.books) {
    const extracted = publisherSpeeches(await json(`${prefix}/books/${book.id}.json`), manifest.edition);
    books.push({ bookId: book.id, spans: extracted.speeches.length, verses: new Set(extracted.speeches.map(speech => `${speech.reference.chapter}:${speech.reference.verse}`)).size, rejectedMetadata: extracted.issues.length });
  }
  const totalSpans = books.reduce((sum, book) => sum + book.spans, 0);
  const marker = totalSpans === 0 ? 'none' : 'wj';
  editions.push({ editionId, sourceSha256: manifest.edition.sha256, status: 'publisher-metadata', marker, offsetUnit: marker === 'none' ? 'not-applicable' : 'unicode-codepoint', totalSpans, totalVerses: books.reduce((sum, book) => sum + book.verses, 0), books });
}
await writeFile(resolve(root, 'data/speakers/publisher-coverage.json'), JSON.stringify({ schemaVersion: 1, generatedOn: new Date().toISOString().slice(0, 10), editions }, null, 2) + '\n');
console.log(JSON.stringify({ editions: editions.length, publisherSpans: editions.reduce((sum, edition) => sum + edition.totalSpans, 0) }));

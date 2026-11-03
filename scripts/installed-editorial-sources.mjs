import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { hashSourceText } from '../src/editorial.ts';

const readJSON = async path => JSON.parse(await readFile(path, 'utf8'));

/** Canonical editorial evidence comes from the installed, attributed source files. */
export async function installedEditorialSources(root, needed = new Set()) {
  let catalog;
  try { catalog = await readJSON(resolve(root, 'data/editions/catalog.json')); }
  catch (error) { if (error.code === 'ENOENT') return { inventory: [], sources: [] }; throw error; }
  if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.editions)) throw new Error('Invalid installed edition catalog.');
  const inventory = [], sources = [], ids = new Set();
  for (const edition of catalog.editions) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(edition.id) || ids.has(edition.id) || !['bible','quran'].includes(edition.corpus) || !/^[a-f0-9]{64}$/.test(edition.sha256) || !edition.referenceSystemId || !edition.rights || !edition.licenseUrl) throw new Error('Invalid or duplicate installed source identity.');
    ids.add(edition.id);
    const base = resolve(root, 'data/editions', edition.id), works = [];
    if (edition.corpus === 'bible') {
      const manifest = await readJSON(resolve(base, 'manifest.json'));
      if (manifest.edition.id !== edition.id || manifest.edition.sha256 !== edition.sha256 || !Array.isArray(manifest.books)) throw new Error('Installed Bible identity does not match the catalog.');
      for (const entry of manifest.books) {
        if (!/^[1-3]?[A-Z]{2,3}$/.test(entry.id)) throw new Error('Invalid installed book identity.');
        const book = await readJSON(resolve(base, 'books', `${entry.id}.json`));
        if (book.id !== entry.id) throw new Error('Installed book identity mismatch.');
        works.push({ id: book.id, chapters: book.chapters.map(chapter => ({ chapter: chapter.number, units: chapter.verses.map(verse => String(verse.number)) })) });
        for (const chapter of book.chapters) for (const verse of chapter.verses) await addSource(book.id, chapter.number, verse);
      }
    } else {
      const corpus = await readJSON(resolve(base, 'quran.json'));
      if (corpus.editionId !== edition.id || !Array.isArray(corpus.surahs)) throw new Error('Installed Quran identity does not match the catalog.');
      works.push({ id: 'QUR', chapters: corpus.surahs.map(surah => ({ chapter: surah.number, units: surah.verses.map(verse => String(verse.number)) })) });
      for (const surah of corpus.surahs) for (const verse of surah.verses) await addSource('QUR', surah.number, verse);
    }
    inventory.push({ id: edition.id, corpus: edition.corpus, version: edition.sha256, referenceSystemId: edition.referenceSystemId, rights: { redistribute: edition.rights.redistribute === true, adapt: edition.rights.adapt === true }, rightsEvidence: [edition.licenseUrl], works });
    async function addSource(workId, chapter, verse) {
      const id = `${edition.id}:${workId}:${chapter}:${verse.number}`;
      if (!needed.has(id)) return;
      if (typeof verse.text !== 'string' || !Number.isSafeInteger(verse.number) || verse.number < 1) throw new Error('Invalid installed source unit.');
      sources.push({ id, ref: { corpus: edition.corpus, workId, editionId: edition.id, referenceSystemId: edition.referenceSystemId, start: { chapter, unit: String(verse.number) } }, editionVersion: edition.sha256, text: verse.text, sourceContentHash: await hashSourceText(verse.text) });
    }
  }
  return { inventory, sources };
}

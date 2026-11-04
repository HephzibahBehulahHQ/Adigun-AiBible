/** Trusted, read-only server source pack; no database, URL, or private study reads. */
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { validateEditionRightsRegister, decideEditionOperation } from '../src/edition-rights.ts';

export function createFileSourceResolver({ dataRoot } = {}) {
  if (typeof dataRoot !== 'string' || !dataRoot) return undefined;
  const root = resolve(dataRoot);
  async function json(path, signal) {
    const bytes = await readFile(path, { signal });
    if (bytes.length > 2_000_000) throw new Error('Source file exceeds limit');
    return JSON.parse(bytes.toString('utf8'));
  }
  return async (ref, { signal } = {}) => {
    if (!ref || typeof ref.editionId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(ref.editionId) || !/^[A-Z0-9]{3}$/.test(ref.bookId)
      || !Number.isInteger(ref.chapter) || !Number.isInteger(ref.verse)
      || !Number.isInteger(ref.endVerse) || ref.verse < 1 || ref.endVerse < ref.verse || ref.endVerse - ref.verse >= 20) throw new Error('Invalid canonical reference');
    const dir = ref.editionId === 'eng-web' ? root : join(root, 'editions', ref.editionId);
    const manifest = await json(join(dir, 'manifest.json'), signal);
    if (manifest.edition?.id !== ref.editionId) throw new Error('Edition identity mismatch');
    const rights = validateEditionRightsRegister(await json(join(root, 'editions', 'rights-register.json'), signal));
    const permission = decideEditionOperation(rights.editions.find(edition => edition.editionId === ref.editionId), 'aiRetrieval', {
      sourceSha256: manifest.edition.sha256, aiProductEnabled: true,
    });
    if (!permission.allowed) throw new Error(`Source is not licensed for this AI operation: ${permission.reason}`);
    let verses;
    if (ref.editionId === 'eng-clearquran') {
      if (ref.corpus !== 'quran' || ref.bookId !== 'QUR') throw new Error('Corpus mismatch');
      const quran = await json(join(dir, 'quran.json'), signal);
      verses = quran.surahs.find(surah => surah.number === ref.chapter)?.verses;
    } else {
      if (ref.corpus !== 'bible' || !manifest.books.some(book => book.id === ref.bookId)) throw new Error('Book unavailable');
      const book = await json(join(dir, 'books', `${ref.bookId}.json`), signal);
      if (book.id !== ref.bookId) throw new Error('Book identity mismatch');
      verses = book.chapters.find(chapter => chapter.number === ref.chapter)?.verses;
    }
    if (!verses) throw new Error('Source chapter unavailable');
    const selected = [];
    for (let number = ref.verse; number <= ref.endVerse; number++) {
      const verse = verses.find(item => item.number === number);
      if (!verse || typeof verse.text !== 'string' || !verse.text.trim()) throw new Error('Source verse unavailable');
      selected.push(verse.text); // Preserve exact source spelling and Unicode.
    }
    const text = selected.join('\n');
    const edition = manifest.edition;
    return {
      text, sha256: createHash('sha256').update(text, 'utf8').digest('hex'),
      sourceUrl: edition.sourceUrl,
      attribution: edition.attribution || `${edition.name}. ${edition.license}. Source: ${edition.sourceUrl}`,
    };
  };
}

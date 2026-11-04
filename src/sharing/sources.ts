import type { Book, Edition, Manifest, Reference } from '../types';
import { assertCompletePassage } from '../print.ts';
import type { CardPassage, CardSource } from './pagination';

export interface CardSourceDependencies {
  getManifest: (editionId: string) => Promise<Manifest>;
  getBook: (bookId: string, editionId: string) => Promise<Book>;
  requirePermission: (edition: Edition, operation: 'imageExport') => Promise<void>;
  sourceCredit: (edition: Edition) => string;
}
export interface PreparedCardSources { title: string; passages: CardPassage[]; sources: CardSource[]; editions: Edition[]; wholeChapter: boolean }

/** Resolve every numbered position and permission before exposing an exportable selection. */
export async function loadCardSources(reference: Reference, secondEdition: string, wholeChapter: boolean, dependencies: CardSourceDependencies): Promise<PreparedCardSources> {
  const firstEdition = reference.editionId || 'eng-web';
  const ids = [...new Set([firstEdition, secondEdition].filter(Boolean))];
  const manifests = await Promise.all(ids.map(id => dependencies.getManifest(id)));
  await Promise.all(manifests.map(manifest => dependencies.requirePermission(manifest.edition, 'imageExport')));
  const books = await Promise.all(ids.map(id => dependencies.getBook(reference.bookId, id)));
  const chapters = books.map((book, index) => {
    const chapter = book.chapters.find(value => value.number === reference.chapter);
    if (!chapter) throw new Error(`${manifests[index].edition.name} has no available chapter at this reference. No cards were created.`);
    return chapter;
  });
  const first = wholeChapter ? 1 : reference.verse;
  const last = wholeChapter ? chapters[0].verses.at(-1)?.number ?? 0 : reference.endVerse ?? reference.verse;
  const selections = chapters.map((chapter, index) => {
    const verses = chapter.verses.filter(verse => verse.number >= first && verse.number <= last);
    try { assertCompletePassage(verses, { verse: first, endVerse: last }); }
    catch {
      const missing = Number.isSafeInteger(first) && Number.isSafeInteger(last) && first > 0 && last >= first && last - first < 1000
        ? Array.from({ length: last - first + 1 }, (_, offset) => first + offset).filter(number => !verses.some(verse => verse.number === number && verse.text.trim())) : [];
      throw new Error(`${manifests[index].edition.name}: ${missing.length ? `source wording is missing at ${reference.bookId} ${reference.chapter}:${missing.join(', ')}.` : 'this passage range is not complete or valid.'} Choose another range or edition. Numbering differences are not automatically aligned; no cards were created.`);
    }
    return verses;
  });
  const passages: CardPassage[] = [];
  for (let index = 0; index < selections[0].length; index++) {
    for (let source = 0; source < manifests.length; source++) {
      const edition = manifests[source].edition, verse = selections[source][index];
      passages.push({ id: `${edition.id}:${reference.bookId}:${reference.chapter}:${verse.number}`, editionId: edition.id, editionName: edition.name, language: edition.language, reference: `${books[source].name} ${reference.chapter}:${verse.number}`, text: verse.text });
    }
  }
  return {
    title: `${books[0].name} ${reference.chapter}:${first}${last === first ? '' : `–${last}`}`,
    passages,
    sources: manifests.map(manifest => ({ id: manifest.edition.id, name: manifest.edition.name, credit: dependencies.sourceCredit(manifest.edition) })),
    editions: manifests.map(manifest => manifest.edition), wholeChapter,
  };
}

import { validateReference } from '../domain.ts';
import { assertCompletePassage } from '../print.ts';
import type { Book, Manifest, Reference } from '../types';
import { validateSavedPassage, type SavedPassage, type ReadingSessionState } from './model.ts';

export interface ReadingSourceReader {
  getManifest: (editionId: string) => Promise<Manifest>;
  getBook: (bookId: string, editionId: string) => Promise<Book>;
}
export async function resolveReadingPassage(reference: Reference, sources: ReadingSourceReader, loadedManifest?: Manifest, expectedSha256?: string): Promise<SavedPassage> {
  const editionId = reference.editionId || 'eng-web';
  const manifest = loadedManifest?.edition.id === editionId ? loadedManifest : await sources.getManifest(editionId);
  const normalized = { ...reference, editionId, endVerse: reference.endVerse ?? reference.verse };
  if (manifest.edition.id !== editionId || !validateReference(normalized, manifest.books, editionId)) throw new Error('This passage is unavailable in the selected edition.');
  if (!manifest.edition.sha256 || (expectedSha256 && manifest.edition.sha256 !== expectedSha256)) throw new Error('The saved source revision is unavailable. Open the current edition from the reader instead.');
  const book = await sources.getBook(reference.bookId, editionId);
  const chapter = book.chapters.find(c => c.number === reference.chapter);
  if (book.id !== reference.bookId || !chapter) throw new Error('This saved chapter is unavailable.');
  const verses = chapter.verses.filter(v => v.number >= normalized.verse && v.number <= normalized.endVerse);
  assertCompletePassage(verses, normalized);
  return validateSavedPassage({ reference: normalized, sourceSha256: manifest.edition.sha256, editionName: manifest.edition.name, bookName: book.name });
}
export async function checkReadingSessionSources(state: ReadingSessionState, sources: ReadingSourceReader): Promise<ReadingSessionState> {
  const manifests = new Map<string, Promise<Manifest>>(), books = new Map<string, Promise<Book>>();
  const cached: ReadingSourceReader = {
    getManifest: edition => { if (!manifests.has(edition)) manifests.set(edition, sources.getManifest(edition)); return manifests.get(edition)!; },
    getBook: (book, edition) => { const key = `${edition}:${book}`; if (!books.has(key)) books.set(key, sources.getBook(book, edition)); return books.get(key)!; },
  };
  const resolve = (passage: SavedPassage) => resolveReadingPassage(passage.reference, cached, undefined, passage.sourceSha256);
  const history = [];
  for (const visit of state.history) history.push({ ...visit, passage: await resolve(visit.passage) });
  const tabs = [];
  for (const tab of state.tabs) tabs.push({ ...tab, passage: await resolve(tab.passage) });
  return { ...state, history, tabs };
}

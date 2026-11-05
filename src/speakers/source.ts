import coverage from '../../data/speakers/publisher-coverage.json' with { type: 'json' };
import type { Book, Edition, Manifest } from '../types';
import { publisherSpeeches, checkSpeakerSource, publishedSpeakerAnnotations } from './model.ts';
import type { PublisherSpeech, SpeakerAnnotation } from './model';
import type { PublishedEditorial } from '../publication';

export { coverage as publisherCoverage };
export interface SpeakerDependencies {
  getManifest: (editionId: string) => Promise<Manifest>;
  getBook: (bookId: string, editionId: string) => Promise<Book>;
  requirePermission: (edition: Edition, operation: 'display' | 'searchIndex') => Promise<void>;
}
export interface PublisherStudy { edition: Edition; speeches: PublisherSpeech[]; issues: string[]; examinedBooks: number; inventoryBooks: number }

export async function loadPublisherStudy(editionId: string, bookId: string, dependencies: SpeakerDependencies, signal?: AbortSignal, onProgress?: (done: number, total: number) => void): Promise<PublisherStudy> {
  const check = () => { if (signal?.aborted) throw new Error('Speech loading cancelled.'); };
  check();
  const manifest = await dependencies.getManifest(editionId);
  check();
  if (manifest.edition.id !== editionId) throw new Error('The selected source edition does not match.');
  await dependencies.requirePermission(manifest.edition, 'searchIndex');
  await dependencies.requirePermission(manifest.edition, 'display');
  check();
  const index = coverage.editions.find(row => row.editionId === editionId);
  if (!index || index.sourceSha256 !== manifest.edition.sha256) throw new Error('Publisher speech coverage has not been verified for this source revision. No substitute annotation has been used.');
  if (bookId && !manifest.books.some(book => book.id === bookId)) throw new Error('This book is absent from the selected edition.');
  const expected = index.books.filter(book => (!bookId || book.bookId === bookId) && book.spans > 0);
  const speeches: PublisherSpeech[] = [], issues: string[] = [];
  onProgress?.(0, expected.length);
  for (const [position, entry] of expected.entries()) {
    check();
    const book = await dependencies.getBook(entry.bookId, editionId);
    check();
    if (book.id !== entry.bookId) throw new Error('A downloaded book has the wrong source identity.');
    const result = publisherSpeeches(book, manifest.edition);
    if (result.speeches.length !== entry.spans || new Set(result.speeches.map(speech => `${speech.reference.chapter}:${speech.reference.verse}`)).size !== entry.verses) throw new Error('Publisher annotations differ from the verified coverage record. Reconnect for matching source files.');
    speeches.push(...result.speeches); issues.push(...result.issues);
    onProgress?.(position + 1, expected.length);
  }
  return { edition: manifest.edition, speeches, issues, examinedBooks: expected.length, inventoryBooks: bookId ? 1 : manifest.books.length };
}

export async function loadReviewedSpeakers(publication: PublishedEditorial | null, editionId: string, dependencies: SpeakerDependencies): Promise<{ records: (SpeakerAnnotation & { text: string })[]; blocked: number }> {
  const annotations = publishedSpeakerAnnotations(publication).filter(annotation => annotation.reference.editionId === editionId);
  if (!annotations.length) return { records: [], blocked: 0 };
  const manifest = await dependencies.getManifest(editionId);
  await dependencies.requirePermission(manifest.edition, 'display');
  const records: (SpeakerAnnotation & { text: string })[] = []; let blocked = 0;
  for (const annotation of annotations) {
    try {
      const book = await dependencies.getBook(annotation.reference.bookId, editionId);
      const text = book.chapters.find(chapter => chapter.number === annotation.reference.chapter)?.verses.find(verse => verse.number === annotation.reference.verse)?.text;
      if (!text) throw new Error('Source wording unavailable.');
      records.push({ ...annotation, text: await checkSpeakerSource(annotation, manifest.edition, text) });
    } catch { blocked++; }
  }
  return { records, blocked };
}

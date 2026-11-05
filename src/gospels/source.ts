import type { Book, Edition, Manifest, Verse } from '../types';
import { validateGospelReference } from './model.ts';
import type { GospelReference } from './model';

export interface GospelSources {
  getManifest: (editionId: string) => Promise<Manifest>;
  getBook: (bookId: string, editionId: string) => Promise<Book>;
  requirePermission: (edition: Edition, operation: 'display') => Promise<void>;
}
export interface GospelExcerpt {
  reference: GospelReference; edition: Edition; sourceSha256: string; bookName: string;
  verses: Verse[]; gaps: { number: number; reason: 'absent' | 'empty' }[]; context: Verse[]; attribution: string;
}
const hashPattern = /^[a-f0-9]{64}$/;
function sourceMetadata(reference: GospelReference, manifest: Manifest, expectedSha256?: string): number {
  const edition = manifest?.edition;
  if (manifest?.schemaVersion !== 1 || !edition || edition.id !== reference.editionId || (edition.corpus !== undefined && edition.corpus !== 'bible')) throw new Error('The Gospel source does not match the selected Bible edition. No replacement text was loaded.');
  if (!edition.sha256 || !hashPattern.test(edition.sha256) || (expectedSha256 !== undefined && (!hashPattern.test(expectedSha256) || edition.sha256 !== expectedSha256))) throw new Error('The exact Gospel source revision is unavailable or has changed. No newer wording was substituted.');
  if (typeof edition.name !== 'string' || !edition.name.trim() || typeof edition.license !== 'string' || !edition.license.trim()
    || typeof edition.sourceUrl !== 'string' || !edition.sourceUrl.trim() || typeof edition.licenseUrl !== 'string' || !edition.licenseUrl.trim()) throw new Error('This source edition is missing its identity or required attribution.');
  const descriptors = manifest.books?.filter(value => value.id === reference.bookId);
  if (!descriptors || descriptors.length !== 1) throw new Error('This Gospel book is absent from the selected edition or its inventory is invalid.');
  const descriptor = descriptors[0];
  if (!Number.isSafeInteger(descriptor.chapters) || !Array.isArray(descriptor.verseCounts) || descriptor.verseCounts.length !== descriptor.chapters
    || reference.chapter > descriptor.chapters) throw new Error('This Gospel chapter is absent from the selected edition.');
  const maximum = descriptor.verseCounts[reference.chapter - 1];
  if (!Number.isSafeInteger(maximum) || maximum < 1 || reference.endVerse > maximum) throw new Error('The complete requested Gospel range is outside this edition’s numbered coverage. The range has not been shortened.');
  return maximum;
}

/** Keep source records and ordering intact; missing wording is evidence, never repaired text. */
export function extractGospelExcerpt(value: GospelReference, manifest: Manifest, book: Book): GospelExcerpt {
  const reference = validateGospelReference(value), maximum = sourceMetadata(reference, manifest);
  if (!book || book.id !== reference.bookId || typeof book.name !== 'string' || !book.name.trim() || !Array.isArray(book.chapters)) throw new Error('The loaded Gospel book does not match the requested source.');
  const chapters = book.chapters.filter(value => value.number === reference.chapter);
  if (chapters.length !== 1 || !Array.isArray(chapters[0].verses)) throw new Error('The requested source chapter is unavailable or duplicated.');
  const chapter = chapters[0]; let previous = 0;
  for (const verse of chapter.verses) {
    if (!verse || !Number.isSafeInteger(verse.number) || verse.number <= previous || verse.number > maximum || typeof verse.text !== 'string') throw new Error('The Gospel source contains duplicate, unordered or invalid verse records. No text has been reordered or repaired.');
    previous = verse.number;
  }
  const verses = chapter.verses.filter(verse => verse.number >= reference.verse && verse.number <= reference.endVerse);
  const byNumber = new Map(verses.map(verse => [verse.number, verse]));
  const gaps: GospelExcerpt['gaps'] = [];
  for (let number = reference.verse; number <= reference.endVerse; number++) {
    const verse = byNumber.get(number);
    if (!verse) gaps.push({ number, reason: 'absent' });
    else if (!verse.text.trim()) gaps.push({ number, reason: 'empty' });
  }
  const edition = manifest.edition;
  return { reference, edition, sourceSha256: edition.sha256!, bookName: book.name, verses, gaps, context: chapter.verses,
    attribution: [edition.attribution || edition.name, edition.license, edition.licenseUrl, edition.licenseDeedUrl, edition.sourceUrl, ...(edition.conditions || [])].filter(Boolean).join('\n') };
}

export async function loadGospelExcerpt(value: GospelReference, sources: GospelSources, expectedSha256?: string): Promise<GospelExcerpt> {
  const reference = validateGospelReference(value), manifest = await sources.getManifest(reference.editionId);
  sourceMetadata(reference, manifest, expectedSha256);
  const sourceSha256 = manifest.edition.sha256;
  await sources.requirePermission(manifest.edition, 'display');
  const book = await sources.getBook(reference.bookId, reference.editionId);
  if (manifest.edition.sha256 !== sourceSha256) throw new Error('The source revision changed while this Gospel passage was loading. Retry the exact selection.');
  return extractGospelExcerpt(reference, manifest, book);
}

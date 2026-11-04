import { validateReference } from '../domain.ts';
import type { Manifest, Reference } from '../types.ts';

export interface SourceCrossReference { location: string; label: string }

/** Read only explicit publisher reference nodes; prose is never guessed into a link. */
export function sourceReferences(content: unknown): SourceCrossReference[] {
  if (!Array.isArray(content)) return [];
  const references: SourceCrossReference[] = [];
  let visited = 0;
  function plain(value: unknown, depth: number): string {
    if (++visited > 10000 || depth > 24) throw new Error('Source reference markup exceeds the supported bounds.');
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(item => plain(item, depth + 1)).join('');
    if (!value || typeof value !== 'object') return '';
    const node = value as Record<string, unknown>;
    if (node.type === 'note' || node.type === 'verse') return '';
    return plain(node.content, depth + 1);
  }
  function walk(value: unknown, depth: number) {
    if (++visited > 10000 || depth > 24) throw new Error('Source reference markup exceeds the supported bounds.');
    if (Array.isArray(value)) { value.forEach(item => walk(item, depth + 1)); return; }
    if (!value || typeof value !== 'object') return;
    const node = value as Record<string, unknown>;
    if (node.type === 'note') return;
    if (node.type === 'ref' && typeof node.loc === 'string' && node.loc.length <= 160) {
      const label = plain(node.content, depth + 1);
      if (label && label.length <= 1000) references.push({ location: node.loc, label });
    } else walk(node.content, depth + 1);
  }
  walk(content, 0);
  return [...new Map(references.map(ref => [`${ref.location}\0${ref.label}`, ref])).values()];
}

/** Canonical USJ locations only. Cross-chapter ranges keep every chapter. */
export function sourceReferenceRanges(location: string, manifest: Manifest): Reference[] | null {
  const match = location.match(/^([1-3]?[A-Z]{2,3}) (\d{1,3})(?::(\d{1,3})(?:-(?:(\d{1,3}):)?(\d{1,3}))?)?$/);
  if (!match) return null;
  const [, bookId, firstChapter, firstVerse, lastChapter, lastVerse] = match;
  const startChapter = Number(firstChapter), endChapter = lastChapter ? Number(lastChapter) : startChapter;
  const book = manifest.books.find(candidate => candidate.id === bookId);
  if (!book || startChapter < 1 || endChapter < startChapter || endChapter > book.chapters) return null;
  const ranges: Reference[] = [];
  for (let chapter = startChapter; chapter <= endChapter; chapter++) {
    const verse = chapter === startChapter ? Number(firstVerse || 1) : 1;
    const endVerse = chapter === endChapter && lastVerse ? Number(lastVerse) : (firstVerse && !lastVerse ? verse : book.verseCounts[chapter - 1]);
    const reference = { bookId, chapter, verse, ...(endVerse === verse ? {} : { endVerse }), editionId: manifest.edition.id };
    if (!validateReference(reference, manifest.books, manifest.edition.id)) return null;
    ranges.push(reference);
  }
  return ranges;
}

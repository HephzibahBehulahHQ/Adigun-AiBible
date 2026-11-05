import type { SourceManifest } from './model.ts';
export interface SourceSelection { book: string; chapter: string; verse: string }
const keys = ['greekBook','greekChapter','greekVerse'] as const;
/** Independent source keys; preserve every Bible path, edition and full verse range. */
export function sourceSelectionFromHash(hash: string, manifest: SourceManifest): SourceSelection {
  const separator = hash.indexOf('?'), params = new URLSearchParams(separator < 0 ? '' : hash.slice(separator + 1));
  if (keys.some(key => params.getAll(key).length > 1)) throw new Error('The source link repeats a Greek selection field. Choose a valid source passage.');
  const id = params.get('greekBook') ?? manifest.books[0].id, book = manifest.books.find(row => row.id === id);
  if (!book) throw new Error('The source link names an unknown Greek book. Choose one of the 27 installed source books.');
  const number = params.get('greekChapter') ?? book.chapters[0].number, chapter = book.chapters.find(row => row.number === number);
  if (!chapter) throw new Error('This chapter is absent from the pinned Greek source book. No Bible numbering was substituted.');
  const verse = params.get('greekVerse') ?? chapter.verseNumbers[0];
  if (!chapter.verseNumbers.includes(verse)) throw new Error('This verse is absent from the pinned Greek source chapter. John 7:53 and 8:1–11 are not represented in this snapshot; no replacement wording is supplied.');
  return { book: id, chapter: number, verse };
}
export function withSourceSelection(hash: string, selection: SourceSelection): string {
  const separator = hash.indexOf('?'), path = separator < 0 ? hash : hash.slice(0, separator), query = separator < 0 ? '' : hash.slice(separator + 1);
  const parts = query ? query.split('&').filter(part => {
    try { return !(keys as readonly string[]).includes(decodeURIComponent(part.split('=')[0].replace(/\+/g, ' '))); }
    catch { return true; }
  }) : [];
  const source = new URLSearchParams({ greekBook: selection.book, greekChapter: selection.chapter, greekVerse: selection.verse });
  return `${path}?${[...parts, source.toString()].join('&')}`;
}

import type { SourceManifest } from './model.ts';
export interface SourceSelection { book: string; chapter: string; verse: string }
const keys = ['oshbBook','oshbChapter','oshbVerse'] as const;
/** Source-only query keys; the Bible path, edition and complete passage range are independent. */
export function sourceSelectionFromHash(hash: string, manifest: SourceManifest): SourceSelection {
  const separator = hash.indexOf('?'), params = new URLSearchParams(separator < 0 ? '' : hash.slice(separator + 1));
  if (keys.some(key => params.getAll(key).length > 1)) throw new Error('The source link repeats a Hebrew selection field. Choose a valid source passage.');
  const bookId = params.get('oshbBook') ?? manifest.books[0].id, book = manifest.books.find(row => row.id === bookId);
  if (!book) throw new Error('The source link names an unknown Hebrew source book. Choose one of the 39 installed source books.');
  const chapterNumber = params.get('oshbChapter') ?? book.chapters[0].number, chapter = book.chapters.find(row => row.number === chapterNumber);
  if (!chapter) throw new Error('The source link names a chapter absent from this Hebrew source book. No translation numbering was substituted.');
  const verse = params.get('oshbVerse') ?? chapter.verseNumbers[0];
  if (!chapter.verseNumbers.includes(verse)) throw new Error('The source link names a verse absent from this Hebrew source chapter. No translation numbering was substituted.');
  return { book: book.id, chapter: chapter.number, verse };
}
export function withSourceSelection(hash: string, selection: SourceSelection): string {
  const separator = hash.indexOf('?'), path = separator < 0 ? hash : hash.slice(0, separator), query = separator < 0 ? '' : hash.slice(separator + 1);
  const parts = query ? query.split('&').filter(part => {
    try { return !(keys as readonly string[]).includes(decodeURIComponent(part.split('=')[0].replace(/\+/g, ' '))); }
    catch { return true; }
  }) : [];
  const source = new URLSearchParams({ oshbBook: selection.book, oshbChapter: selection.chapter, oshbVerse: selection.verse });
  return `${path}?${[...parts, source.toString()].join('&')}`;
}

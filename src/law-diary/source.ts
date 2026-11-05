import type { Book, Edition, Manifest, QuranSource, Verse } from '../types';
import type { BibleCitation, QuranCitation } from './model';

export interface LawExcerpt { edition: Edition; verses: Verse[]; context: Verse[]; missing: number[] }

export function bibleExcerpt(book: Book, manifest: Manifest, citation: BibleCitation): LawExcerpt {
  if (book.id !== citation.bookId || !manifest.books.some(item => item.id === book.id)) throw new Error('The requested source book does not match this citation.');
  const chapter = book.chapters.find(item => item.number === citation.chapter);
  if (!chapter) throw new Error('This chapter is absent from the selected edition.');
  const end = citation.endVerse ?? citation.verse;
  if (!Number.isSafeInteger(citation.verse) || !Number.isSafeInteger(end) || citation.verse < 1 || end < citation.verse || end - citation.verse > 200) throw new Error('The source range is invalid.');
  const numbers = new Set(chapter.verses.map(verse => verse.number));
  const missing = Array.from({ length: end - citation.verse + 1 }, (_, index) => citation.verse + index).filter(number => !numbers.has(number));
  const verses = chapter.verses.filter(verse => verse.number >= citation.verse && verse.number <= end);
  return { edition: manifest.edition, verses, missing, context: chapter.verses.filter(verse => verse.number >= Math.max(1, citation.verse - 2) && verse.number <= end + 2) };
}

export function quranExcerpt(source: QuranSource, citation: QuranCitation): LawExcerpt {
  const surah = source.surahs.find(item => item.number === citation.surah);
  const end = citation.endAyah ?? citation.ayah;
  if (!surah || !Number.isSafeInteger(citation.ayah) || !Number.isSafeInteger(end) || citation.ayah < 1 || end < citation.ayah || end > surah.verses.length) throw new Error('This Quran citation is absent from the installed source.');
  const verses = surah.verses.filter(verse => verse.number >= citation.ayah && verse.number <= end);
  if (verses.length !== end - citation.ayah + 1) throw new Error('The Quran source is missing an expected verse.');
  return { edition: source.edition, verses, missing: [], context: surah.verses.filter(verse => verse.number >= Math.max(1, citation.ayah - 2) && verse.number <= end + 2) };
}

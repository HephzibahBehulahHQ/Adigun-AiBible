import { fold } from './domain.ts';
import { compileSearch } from './search-query.ts';
import type { SearchMode } from './search-query';
import type { QuranSource } from './types';

export type QuranSearchMode = SearchMode;
export interface QuranSearchOptions { mode: QuranSearchMode; surah: number | ''; exclude: string }
export interface QuranSearchResult { chapter: number; number: number; text: string }
const words = (value: string) => fold(value).match(/[\p{L}\p{N}]+/gu) || [];

export function searchQuran(source: Pick<QuranSource, 'surahs'>, query: string, options: QuranSearchOptions): { total: number; results: QuranSearchResult[] } {
  const predicate = compileSearch(query, options.mode);
  const surahFilter = options.surah;
  if (surahFilter !== '' && (!Number.isSafeInteger(surahFilter) || !source.surahs.some(item => item.number === surahFilter))) {
    throw new Error('Choose a surah included in this Quran edition.');
  }
  const excluded = words(options.exclude);
  const found = source.surahs
    .filter(surah => surahFilter === '' || surah.number === surahFilter)
    .flatMap(surah => surah.verses.map(verse => ({ chapter: surah.number, number: verse.number, text: verse.text })))
    .filter(verse => {
      const normalized = fold(verse.text);
      const wordSet = new Set(words(verse.text));
      return !excluded.some(word => wordSet.has(word)) && predicate(normalized, wordSet);
    });
  return { total: found.length, results: found.slice(0, 100) };
}

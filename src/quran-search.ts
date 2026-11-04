import { fold } from './domain.ts';
import { compileSearch } from './search-query';
import type { SearchMode } from './search-query';
import type { QuranSource } from './types';

export type QuranSearchMode = SearchMode;
export interface QuranSearchOptions { mode: QuranSearchMode; surah: number | ''; exclude: string }
export interface QuranSearchResult { chapter: number; number: number; text: string }
const words = (value: string) => fold(value).match(/[\p{L}\p{N}]+/gu) || [];

export function searchQuran(source: Pick<QuranSource, 'surahs'>, query: string, options: QuranSearchOptions): { total: number; results: QuranSearchResult[] } {
  const predicate = compileSearch(query, options.mode);
  if (options.surah !== '' && (!Number.isSafeInteger(options.surah) || !source.surahs.some(item => item.number === options.surah))) {
    throw new Error('Choose a surah included in this Quran edition.');
  }
  const excluded = words(options.exclude);
  const found = source.surahs
    .filter(surah => options.surah === '' || surah.number === options.surah)
    .flatMap(surah => surah.verses.map(verse => ({ chapter: surah.number, number: verse.number, text: verse.text })))
    .filter(verse => {
      const normalized = fold(verse.text);
      const wordSet = new Set(words(verse.text));
      return !excluded.some(word => wordSet.has(word)) && predicate(normalized, wordSet);
    });
  return { total: found.length, results: found.slice(0, 100) };
}

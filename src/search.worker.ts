/// <reference lib="webworker" />
import { bibleEditionIds, getManifest } from './data';
import { requirePermission } from './permissions';
import { defaultSearchOptions, searchRows } from './search-query';
import type { SearchOptions } from './search-query';
import type { SearchResult } from './types';
import { AsyncLruCache, SEARCH_INDEX_CACHE_LIMIT, SequentialTaskQueue } from './source-cache.ts';
const indexes = new AsyncLruCache<string, SearchResult[]>(SEARCH_INDEX_CACHE_LIMIT);
const searches = new SequentialTaskQueue();
type SearchRequest = { query: string; bookId: string; id: number; base: string; editionId?: string; options?: SearchOptions };
async function respond(data: SearchRequest): Promise<void> {
  try {
    const editionId = data.editionId || 'eng-web';
    if (!bibleEditionIds.includes(editionId)) throw new Error('Search is unavailable for this edition.');
    const manifest=await getManifest(editionId); await requirePermission(manifest.edition,'searchIndex');
    const key = JSON.stringify([data.base, editionId, manifest.edition.sha256]);
    const rows = await indexes.getOrLoad(key, async () => {
      const path = editionId === 'eng-web' ? 'data/search-index.json' : `data/editions/${editionId}/search-index.json`;
      const response = await fetch(`${data.base}${path}`);
      if (!response.ok) throw new Error('Download this edition and its search index while online to search it.');
      const rows = await response.json();
      if (!Array.isArray(rows) || rows.some(v => typeof v.text !== 'string' || typeof v.bookId !== 'string')) throw new Error('The search index failed validation.');
      return rows as SearchResult[];
    });
    const options=data.options || {...defaultSearchOptions,bookId:data.bookId||''};
    const matches=searchRows(rows,data.query,options,manifest.books.map(book=>book.id)).map(row=>({...row,editionId}));
    self.postMessage({ id: data.id, results: matches.slice(0,100), total: matches.length });
  } catch (error) { self.postMessage({ id: data.id, error: error instanceof Error ? error.message : 'Search is unavailable.' }); }
}
self.onmessage = ({ data }: MessageEvent<SearchRequest>) => { void searches.run(() => respond(data)); };

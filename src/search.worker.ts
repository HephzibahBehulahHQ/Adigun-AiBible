/// <reference lib="webworker" />
import { bibleEditionIds, getManifest } from './data';
import { requirePermission } from './permissions';
import { defaultSearchOptions, searchRows } from './search-query';
import type { SearchOptions } from './search-query';
import type { SearchResult } from './types';
const indexes = new Map<string, SearchResult[]>();
self.onmessage = async ({ data }: MessageEvent<{ query: string; bookId: string; id: number; base: string; editionId?: string; options?: SearchOptions }>) => {
  try {
    const editionId = data.editionId || 'eng-web';
    if (!bibleEditionIds.includes(editionId)) throw new Error('Search is unavailable for this edition.');
    const manifest=await getManifest(editionId); await requirePermission(manifest.edition,'searchIndex');
    if (!indexes.has(editionId)) { const path = editionId === 'eng-web' ? 'data/search-index.json' : `data/editions/${editionId}/search-index.json`; const response = await fetch(`${data.base}${path}`); if (!response.ok) throw new Error('Download this edition and its search index while online to search it.'); const rows = await response.json(); if (!Array.isArray(rows) || rows.some(v => typeof v.text !== 'string' || typeof v.bookId !== 'string')) throw new Error('The search index failed validation.'); indexes.set(editionId, rows); }
    const options=data.options || {...defaultSearchOptions,bookId:data.bookId||''};
    const matches=searchRows(indexes.get(editionId)!,data.query,options,manifest.books.map(book=>book.id)).map(row=>({...row,editionId}));
    self.postMessage({ id: data.id, results: matches.slice(0,100), total: matches.length });
  } catch (error) { self.postMessage({ id: data.id, error: error instanceof Error ? error.message : 'Search is unavailable.' }); }
};

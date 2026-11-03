/// <reference lib="webworker" />
import { fold } from './domain';
import type { SearchResult } from './types';
let index: SearchResult[] | null = null;
self.onmessage = async ({ data }: MessageEvent<{ query: string; bookId: string; id: number; base: string }>) => {
  try {
    if (!index) { const response = await fetch(`${data.base}data/search-index.json`); if (!response.ok) throw new Error('Download the search index while online to search the full Bible.'); index = await response.json() as SearchResult[]; }
    const q = fold(data.query); if (q.length < 2) { self.postMessage({ id: data.id, results: [] }); return; }
    const matches = index!.filter(v => (!data.bookId || v.bookId === data.bookId) && fold(v.text).includes(q));
    self.postMessage({ id: data.id, results: matches.slice(0, 100), total: matches.length });
  } catch (e) { self.postMessage({ id: data.id, error: e instanceof Error ? e.message : 'Search is unavailable.' }); }
};

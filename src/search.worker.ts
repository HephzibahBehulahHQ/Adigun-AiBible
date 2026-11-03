/// <reference lib="webworker" />
import { fold } from './domain';
import type { SearchResult } from './types';
const indexes = new Map<string, SearchResult[]>();
self.onmessage = async ({ data }: MessageEvent<{ query: string; bookId: string; id: number; base: string; editionId?: string }>) => {
  try {
    const editionId = data.editionId || 'eng-web';
    if (!['eng-web','deu1912','yor'].includes(editionId)) throw new Error('Search is unavailable for this edition.');
    if (!indexes.has(editionId)) { const path = editionId === 'eng-web' ? 'data/search-index.json' : `data/editions/${editionId}/search-index.json`; const response = await fetch(`${data.base}${path}`); if (!response.ok) throw new Error('Download this edition and its search index while online to search it.'); const rows = await response.json(); if (!Array.isArray(rows) || rows.some(v => typeof v.text !== 'string' || typeof v.bookId !== 'string')) throw new Error('The search index failed validation.'); indexes.set(editionId, rows); }
    const q = fold(data.query); if (q.length < 2) { self.postMessage({ id: data.id, results: [] }); return; }
    const matches = indexes.get(editionId)!.filter(v => (!data.bookId || v.bookId === data.bookId) && fold(v.text).includes(q)).map(v => ({...v, editionId}));
    self.postMessage({ id: data.id, results: matches.slice(0, 100), total: matches.length });
  } catch (e) { self.postMessage({ id: data.id, error: e instanceof Error ? e.message : 'Search is unavailable.' }); }
};

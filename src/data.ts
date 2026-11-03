import type { Book, Manifest } from './types';
const base = import.meta.env.BASE_URL;
export const assetUrl = (path: string) => `${base}${path}`;
export async function getManifest(): Promise<Manifest> {
  const response = await fetch(assetUrl('data/manifest.json'));
  if (!response.ok) throw new Error('The edition manifest could not be loaded. Reconnect and try again.');
  const data = await response.json() as Manifest;
  if (!Array.isArray(data.books) || !data.edition || !data.totals) throw new Error('This edition manifest is invalid.');
  return data;
}
const books = new Map<string, Promise<Book>>();
export function getBook(id: string): Promise<Book> {
  if (!/^[1-3]?[A-Z]{2,3}$/.test(id)) return Promise.reject(new Error('Invalid book identifier.'));
  if (!books.has(id)) books.set(id, fetch(assetUrl(`data/books/${id}.json`)).then(async r => {
    if (!r.ok) throw new Error('This book is not available offline yet. Reconnect or open a downloaded book.');
    const b = await r.json() as Book;
    if (b.id !== id || !Array.isArray(b.chapters)) throw new Error('The downloaded book failed validation.');
    return b;
  }).catch(e => { books.delete(id); throw e; }));
  return books.get(id)!;
}

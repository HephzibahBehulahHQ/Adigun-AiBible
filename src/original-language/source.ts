import ledger from '../../data/original-language/oshb/integrity.json' with { type: 'json' };
import { OSHB_REVISION, validateBook, validateManifest, validateMorphology } from './model.ts';
import type { BookDescriptor, FilePin, Morphology, SourceBook, SourceManifest } from './model.ts';

export const SOURCE_PREFIX = 'data/original-language/oshb/';
export const MAX_SOURCE_BYTES = 4 * 1024 * 1024;
export const BOOK_CACHE_LIMIT = 2;
export const sourcePins: ReadonlyMap<string, FilePin> = new Map([
  ...ledger.files.map(file => [file.path, file] as [string, FilePin]),
  ['source.json', { path: 'source.json', bytes: 10658, sha256: '3bf2206cf8dcfca974183b441c77a389a704c3439a86c025e7b2d0e5383fd46b' }],
  ['integrity.json', { path: 'integrity.json', bytes: 7245, sha256: '67fd2b904ead3513736d13a1d424a0ea5416ddbbb377564185b61676c392f75e' }],
]);
if (ledger.sourceRevision !== OSHB_REVISION || sourcePins.get('manifest.json')?.sha256 !== 'effcc95ce66eb9a1dde1fbe5692f99caa0d66b6a86c2ea8de7e57b0d33b918b9') throw new Error('The Hebrew source trust anchor is inconsistent.');
export const sourceAbort = (signal?: AbortSignal): void => { if (signal?.aborted) throw new DOMException('Hebrew source operation cancelled.', 'AbortError'); };
export function sourceBase(value: string): URL {
  const base = new URL(value);
  if (!['https:','http:'].includes(base.protocol) || base.username || base.password || base.hash || base.search || !base.pathname.endsWith('/')) throw new Error('The Hebrew source application location is invalid.');
  return base;
}
export function pinFor(path: string): FilePin {
  const pin = sourcePins.get(path);
  if (!pin || !Number.isSafeInteger(pin.bytes) || pin.bytes < 1 || pin.bytes > MAX_SOURCE_BYTES || !/^[a-f0-9]{64}$/.test(pin.sha256)) throw new Error('This file is not in the pinned Hebrew source.');
  return pin;
}
export async function verifiedSourceBytes(response: Response, pin: FilePin, signal?: AbortSignal): Promise<Uint8Array> {
  sourceAbort(signal);
  if (!response.ok || response.type === 'opaque') throw new Error('The Hebrew source is unavailable. Reconnect or download this source book and its notices, then retry.');
  if (!Number.isSafeInteger(pin.bytes) || pin.bytes < 1 || pin.bytes > MAX_SOURCE_BYTES || !/^[a-f0-9]{64}$/.test(pin.sha256)) throw new Error('The Hebrew source file size or checksum record is invalid.');
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > pin.bytes)) { if (response.body) void response.body.cancel().catch(() => undefined); throw new Error('The Hebrew source response exceeds its pinned byte length.'); }
  if (!response.body) throw new Error('This browser cannot read the Hebrew source response.');
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let total = 0, complete = false;
  const cancel = () => { void reader.cancel().catch(() => undefined); }; signal?.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      sourceAbort(signal); const next = await reader.read(); sourceAbort(signal);
      if (next.done) { complete = true; break; }
      total += next.value.byteLength;
      if (total > pin.bytes || total > MAX_SOURCE_BYTES) throw new Error('The Hebrew source response changed or exceeds its bounded byte length.');
      chunks.push(next.value);
    }
  } finally { signal?.removeEventListener('abort', cancel); if (!complete) void reader.cancel().catch(() => undefined); reader.releaseLock(); }
  if (total !== pin.bytes) throw new Error('The Hebrew source byte length changed. Update the application before opening this source.');
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.buffer)), byte => byte.toString(16).padStart(2, '0')).join('');
  sourceAbort(signal);
  if (hash !== pin.sha256) throw new Error('The Hebrew source checksum changed. No changed source text was opened; update the application and retry.');
  return bytes;
}
export function parseSourceBytes(bytes: Uint8Array): unknown {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new Error('The verified Hebrew source is not valid UTF-8 JSON.'); }
}
export type SourceFetch = (url: URL, options: RequestInit) => Promise<Response>;
export class HebrewSourceLoader {
  private books = new Map<string, SourceBook>();
  private manifest: SourceManifest | null = null;
  private morphology: Morphology | null = null;
  private generation = 0;
  private base: URL;
  private fetcher: SourceFetch;
  constructor(baseUrl: string, fetcher: SourceFetch = (url, options) => fetch(url, options)) { this.base = sourceBase(baseUrl); this.fetcher = fetcher; }
  get cachedBookCount(): number { return this.books.size; }
  clear(): void { this.generation++; this.books.clear(); this.manifest = null; this.morphology = null; }
  private async read(path: string, signal?: AbortSignal): Promise<unknown> {
    sourceAbort(signal);
    const response = await this.fetcher(new URL(SOURCE_PREFIX + path, this.base), { signal, cache: 'no-cache' });
    const bytes = await verifiedSourceBytes(response, pinFor(path), signal); sourceAbort(signal);
    return parseSourceBytes(bytes);
  }
  async loadManifest(signal?: AbortSignal): Promise<SourceManifest> {
    sourceAbort(signal); if (this.manifest) return this.manifest;
    const generation = this.generation, result = validateManifest(await this.read('manifest.json', signal), sourcePins); sourceAbort(signal);
    if (generation === this.generation) this.manifest = result;
    return result;
  }
  async loadMorphology(signal?: AbortSignal): Promise<Morphology> {
    sourceAbort(signal); if (this.morphology) return this.morphology;
    const generation = this.generation, result = validateMorphology(await this.read('morphology.json', signal)); sourceAbort(signal);
    if (generation === this.generation) this.morphology = result;
    return result;
  }
  async loadBook(id: string, signal?: AbortSignal): Promise<SourceBook> {
    sourceAbort(signal); const generation = this.generation, manifest = await this.loadManifest(signal); sourceAbort(signal);
    const descriptor: BookDescriptor | undefined = manifest.books.find(book => book.id === id);
    if (!descriptor) throw new Error('Choose one of the 39 installed Hebrew source books.');
    const cached = this.books.get(id);
    if (cached) { this.books.delete(id); this.books.set(id, cached); return cached; }
    const result = validateBook(await this.read(descriptor.path, signal), descriptor); sourceAbort(signal);
    if (generation === this.generation) {
      this.books.delete(id); this.books.set(id, result);
      while (this.books.size > BOOK_CACHE_LIMIT) this.books.delete(this.books.keys().next().value!);
    }
    return result;
  }
}
export function requiredSourcePaths(bookId: string): string[] {
  pinFor(`books/${bookId}.json`);
  return [...sourcePins.keys()].filter(path => !path.startsWith('books/') || path === `books/${bookId}.json`).map(path => SOURCE_PREFIX + path);
}

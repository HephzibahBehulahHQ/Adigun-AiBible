import ledger from '../../data/original-language/morphgnt-sblgnt/integrity.json' with { type: 'json' };
import { readSourceBytes } from '../source-codec.ts';
import { SOURCE_ID, SOURCE_REVISION, validateBook, validateManifest, validateMorphology } from './model.ts';
import type { FilePin, Morphology, SourceBook, SourceManifest } from './model.ts';

export const SOURCE_PREFIX = 'data/original-language/morphgnt-sblgnt/';
export const MAX_SOURCE_BYTES = 4 * 1024 * 1024;
export const BOOK_CACHE_LIMIT = 2;
export const sourcePins: ReadonlyMap<string,FilePin> = new Map([
  ...ledger.files.map(file => [file.path, Object.freeze(file)] as [string,FilePin]),
  ['source.json', Object.freeze({ path: 'source.json', bytes: 10198, sha256: 'f2e3ebfdad44002721c9070899abcad10c02d785cc27ff50ac08202db66d3c12' })],
  ['integrity.json', Object.freeze({ path: 'integrity.json', bytes: 5396, sha256: '3b697fa13ff75150020cc727d188d8d6f11502ffcf5a39b2411f0424db5cd694' })],
]);
if (ledger.sourceId !== SOURCE_ID || ledger.sourceRevision !== SOURCE_REVISION || ledger.sourcePinSha256 !== sourcePins.get('source.json')?.sha256 || sourcePins.get('manifest.json')?.sha256 !== 'fcae63c6558b426c5e03497b28617171f330051cc2c5482a220574c381412d80' || sourcePins.size !== 36) throw new Error('The compiled Greek source trust anchors are inconsistent.');
export const sourceAbort = (signal?: AbortSignal): void => { if (signal?.aborted) throw new DOMException('Greek source operation cancelled.', 'AbortError'); };
export function sourceBase(value: string): URL {
  const base = new URL(value);
  if (!['http:','https:'].includes(base.protocol) || base.username || base.password || base.hash || base.search || !base.pathname.endsWith('/')) throw new Error('The Greek source application location is invalid.');
  return base;
}
export function pinFor(path: string): FilePin {
  const pin = sourcePins.get(path);
  if (!pin || !Number.isSafeInteger(pin.bytes) || pin.bytes < 1 || pin.bytes > MAX_SOURCE_BYTES || !/^[a-f0-9]{64}$/.test(pin.sha256)) throw new Error('This file is not in the compiled Greek source inventory.');
  return pin;
}
export async function verifiedSourceBytes(response: Response, pin: FilePin, signal?: AbortSignal): Promise<Uint8Array> {
  if (signal?.aborted || !response.ok || response.type === 'opaque' || !Number.isSafeInteger(pin.bytes) || pin.bytes < 1 || pin.bytes > MAX_SOURCE_BYTES || !/^[a-f0-9]{64}$/.test(pin.sha256)) {
    if (response.body) void response.body.cancel().catch(() => undefined);
    sourceAbort(signal); throw new Error('The Greek source response or its compiled integrity record is unavailable. Reconnect or retry the selected source.');
  }
  // Only the bounded raw-byte reader is shared. Greek books never enter the
  // translated-Bible envelope decoder or its normalization/search pipeline.
  const bytes = await readSourceBytes(response, pin.bytes, signal);
  if (bytes.byteLength !== pin.bytes) throw new Error('The Greek source byte length changed. Update the application before opening this source.');
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
  sourceAbort(signal);
  if (hash !== pin.sha256) throw new Error('The Greek source checksum changed. No changed source text was opened; update the application and retry.');
  return bytes;
}
export function parseSourceBytes(bytes: Uint8Array): unknown {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new Error('The verified Greek source is not valid UTF-8 JSON.'); }
}
export type SourceFetch = (url: URL, options: RequestInit) => Promise<Response>;
export class GreekSourceLoader {
  private books = new Map<string,SourceBook>();
  private manifest: SourceManifest | null = null;
  private morphology: Morphology | null = null;
  private generation = 0;
  private base: URL;
  private fetcher: SourceFetch;
  constructor(baseUrl: string, fetcher: SourceFetch = (url, options) => fetch(url, options)) { this.base = sourceBase(baseUrl); this.fetcher = fetcher; }
  get cachedBookCount(): number { return this.books.size; }
  clear(): void { this.generation++; this.books.clear(); this.manifest = null; this.morphology = null; }
  private async read(path: string, signal?: AbortSignal): Promise<unknown> {
    sourceAbort(signal); const response = await this.fetcher(new URL(SOURCE_PREFIX + path, this.base), { signal, cache: 'no-cache' });
    const bytes = await verifiedSourceBytes(response, pinFor(path), signal); sourceAbort(signal); return parseSourceBytes(bytes);
  }
  async loadManifest(signal?: AbortSignal): Promise<SourceManifest> {
    sourceAbort(signal); if (this.manifest) return this.manifest;
    const generation = this.generation, result = validateManifest(await this.read('manifest.json', signal), sourcePins); sourceAbort(signal);
    if (generation === this.generation) this.manifest = result; return result;
  }
  async loadMorphology(signal?: AbortSignal): Promise<Morphology> {
    sourceAbort(signal); if (this.morphology) return this.morphology;
    const generation = this.generation, result = validateMorphology(await this.read('morphology.json', signal)); sourceAbort(signal);
    if (generation === this.generation) this.morphology = result; return result;
  }
  async loadBook(id: string, signal?: AbortSignal): Promise<SourceBook> {
    sourceAbort(signal); const generation = this.generation, manifest = await this.loadManifest(signal); sourceAbort(signal);
    const descriptor = manifest.books.find(book => book.id === id);
    if (!descriptor) throw new Error('Choose one of the 27 installed Greek source books.');
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

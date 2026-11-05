import { downloadOfflineFiles, getOfflineManifest, removeOfflineDownloads } from '../offline.ts';
import type { OfflineManifest } from '../offline.ts';
import { SOURCE_PREFIX, pinFor, requiredSourcePaths, sourceAbort, sourceBase, verifiedSourceBytes } from './source.ts';

export function assertSourceInventory(inventory: OfflineManifest, paths: readonly string[]): void {
  for (const path of paths) {
    if (!path.startsWith(SOURCE_PREFIX)) throw new Error('Choose files from the pinned Hebrew source.');
    const expected = pinFor(path.slice(SOURCE_PREFIX.length)), actual = inventory.files[path];
    if (!actual || actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) throw new Error('The application inventory does not match this pinned Hebrew source. Update before downloading or verifying it.');
  }
}

/** Read a bounded local pack marker. It grants eligibility only; every source byte is checked below. */
async function markerPaths(response: Response, base: URL, inventory: OfflineManifest, signal?: AbortSignal): Promise<string[] | null> {
  if (!response.ok || !response.body) return null;
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0, done = false;
  const cancel = () => { void reader.cancel().catch(() => undefined); }; signal?.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      sourceAbort(signal); const next = await reader.read(); sourceAbort(signal);
      if (next.done) { done = true; break; }
      size += next.value.byteLength; if (size > 2 * 1024 * 1024) return null; chunks.push(next.value);
    }
  } finally { signal?.removeEventListener('abort', cancel); if (!done) void reader.cancel().catch(() => undefined); reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (value.schemaVersion !== 1 || value.appId !== 'adigun-aibible' || value.basePath !== base.pathname || value.contentVersion !== inventory.contentVersion
      || typeof value.packId !== 'string' || !Array.isArray(value.paths) || value.paths.length > 16384
      || value.paths.some((path: unknown) => typeof path !== 'string' || path.length > 512 || !Object.hasOwn(inventory.files, path))) return null;
    return value.paths;
  } catch { return null; }
}

export interface OfflineSourceStatus { verified: boolean; missing: string[]; bytes: number }
/** Checks only current committed packs/content caches, without fetching missing source files. */
export async function verifySourceDownload(baseUrl: string, bookId: string, signal?: AbortSignal, storage: CacheStorage = caches, inventory?: OfflineManifest): Promise<OfflineSourceStatus> {
  const base = sourceBase(baseUrl), paths = requiredSourcePaths(bookId), current = inventory ?? await getOfflineManifest(base.href); sourceAbort(signal);
  if (current.basePath !== base.pathname) throw new Error('The offline inventory belongs to another application path.');
  assertSourceInventory(current, paths);
  const eligible: { cache: Cache; paths: Set<string> | null }[] = [];
  for (const name of await storage.keys()) {
    sourceAbort(signal);
    if (name === `${current.cachePrefix}content-${current.contentVersion}`) eligible.push({ cache: await storage.open(name), paths: null });
    else if (name.startsWith(`${current.cachePrefix}pack-${current.contentVersion}-`)) {
      const cache = await storage.open(name), marker = await cache.match(new URL('__adigun_offline_pack__.json', base).href);
      if (!marker) continue;
      const members = await markerPaths(marker, base, current, signal);
      if (members) eligible.push({ cache, paths: new Set(members) });
    }
  }
  const missing: string[] = [];
  for (const path of paths) {
    sourceAbort(signal); let verified = false;
    for (const candidate of eligible) {
      if (candidate.paths && !candidate.paths.has(path)) continue;
      const response = await candidate.cache.match(new URL(path, base).href); if (!response) continue;
      try { await verifiedSourceBytes(response, pinFor(path.slice(SOURCE_PREFIX.length)), signal); verified = true; break; }
      catch (reason) { sourceAbort(signal); if (reason instanceof DOMException && reason.name === 'AbortError') throw reason; }
    }
    if (!verified) missing.push(path);
  }
  return { verified: missing.length === 0, missing, bytes: paths.reduce((total, path) => total + pinFor(path.slice(SOURCE_PREFIX.length)).bytes, 0) };
}

export async function downloadSourceBook(baseUrl: string, bookId: string, signal?: AbortSignal, onProgress?: (done: number, total: number) => void): Promise<OfflineSourceStatus> {
  const paths = requiredSourcePaths(bookId), inventory = await getOfflineManifest(baseUrl); sourceAbort(signal); assertSourceInventory(inventory, paths);
  await downloadOfflineFiles(baseUrl, paths, { packId: `oshb-${bookId}`, signal, onProgress }); sourceAbort(signal);
  const status = await verifySourceDownload(baseUrl, bookId, signal);
  if (!status.verified) throw new Error('The complete source book and notices could not be verified in device storage. Reconnect and retry.');
  return status;
}
export async function removeSourceBook(baseUrl: string, bookId: string): Promise<void> {
  pinFor(`books/${bookId}.json`);
  await removeOfflineDownloads(baseUrl, { prefix: `${SOURCE_PREFIX}books/${bookId}.json` });
}

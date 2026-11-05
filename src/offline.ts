export interface OfflineFile { sha256: string; bytes: number }
export interface OfflineManifest {
  schemaVersion: 1;
  appId: 'adigun-aibible';
  basePath: string;
  cachePrefix: string;
  contentVersion: string;
  buildVersion: string;
  files: Record<string, OfflineFile>;
}
export interface OfflineDownloadOptions {
  packId?: string;
  onProgress?: (completed: number, total: number) => void;
  signal?: AbortSignal;
}
interface Pack {
  schemaVersion: 1;
  appId: 'adigun-aibible';
  basePath: string;
  contentVersion: string;
  packId: string;
  paths: string[];
  createdAt: string;
}
interface OpenPack { name: string; cache: Cache; record: Pack }
const MARKER = '__adigun_offline_pack__.json';
const locks = new Map<string, Promise<unknown>>();
const validPath = (path: string) => /^data\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(path)
  && !path.split('/').some(segment => segment === '..' || segment === '.' || segment === '');
const essential = (path: string) => path.endsWith('/manifest.json') || path === 'data/editions/catalog.json' || path === 'data/editions/rights-register.json';

function baseURL(value: string): URL {
  const base = new URL(value, typeof location === 'undefined' ? 'https://offline.invalid/' : location.href);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash || !base.pathname.endsWith('/')) {
    throw new Error('Offline storage requires the application’s public base URL.');
  }
  return base;
}
async function sha256(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const input = bytes instanceof Uint8Array ? new Uint8Array(bytes).buffer : bytes;
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', input)), n => n.toString(16).padStart(2, '0')).join('');
}
function cacheStorage(): CacheStorage {
  if (typeof caches === 'undefined') throw new Error('Offline downloads are unavailable in this browser.');
  return caches;
}
function abortIfNeeded(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Download cancelled. Existing downloads were preserved.', 'AbortError');
}
async function exclusive<T>(key: string, action: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request(key, action);
  const previous = locks.get(key) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(action);
  locks.set(key, current);
  try { return await current; }
  finally { if (locks.get(key) === current) locks.delete(key); }
}

export async function getOfflineManifest(baseUrl: string): Promise<OfflineManifest> {
  const base = baseURL(baseUrl);
  const response = await fetch(new URL('offline-manifest.json', base), { cache: 'no-cache' });
  if (!response.ok) throw new Error('Offline metadata is unavailable. Reconnect and update the application before downloading.');
  const value = await response.json() as Partial<OfflineManifest>;
  const prefix = `adigun-bible-${(await sha256(new TextEncoder().encode(base.pathname))).slice(0, 12)}-`;
  if (value.schemaVersion !== 1 || value.appId !== 'adigun-aibible' || value.basePath !== base.pathname || value.cachePrefix !== prefix
    || !/^[a-f0-9]{16,64}$/.test(value.contentVersion ?? '') || !/^[a-f0-9]{12,64}$/.test(value.buildVersion ?? '')
    || !value.files || typeof value.files !== 'object' || Array.isArray(value.files)) {
    throw new Error('The offline metadata is invalid. Existing downloads were preserved.');
  }
  const entries = Object.entries(value.files);
  if (!entries.length || entries.length > 4096 || entries.some(([path, file]) => !validPath(path) || !file
    || !/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || file.bytes > 64 * 1024 * 1024)) {
    throw new Error('The offline file inventory is invalid. Existing downloads were preserved.');
  }
  return value as OfflineManifest;
}

async function validateResponse(response: Response, file: OfflineFile, path: string): Promise<Response> {
  if (!response.ok || response.type === 'opaque') throw new Error(`Could not download ${path}. Existing downloads were preserved.`);
  const bytes = await response.clone().arrayBuffer();
  if (bytes.byteLength !== file.bytes || await sha256(bytes) !== file.sha256) {
    throw new Error('Source files changed during the download. Save and update the application, then retry. Existing downloads were preserved.');
  }
  if (path.endsWith('.json')) {
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!value || typeof value !== 'object') throw new Error(`The source file ${path} is invalid. Existing downloads were preserved.`);
  }
  return response;
}
async function openPacks(storage: CacheStorage, base: URL, manifest: OfflineManifest): Promise<OpenPack[]> {
  const prefix = `${manifest.cachePrefix}pack-${manifest.contentVersion}-`;
  const result: OpenPack[] = [];
  for (const name of await storage.keys()) {
    if (!name.startsWith(prefix)) continue;
    const cache = await storage.open(name);
    const marker = await cache.match(new URL(MARKER, base).href);
    if (!marker) continue; // A staging cache is deliberately invisible until its final marker is written.
    try {
      const record = await marker.json() as Pack;
      if (record.schemaVersion === 1 && record.appId === 'adigun-aibible' && record.basePath === base.pathname
        && record.contentVersion === manifest.contentVersion && typeof record.packId === 'string'
        && Array.isArray(record.paths) && record.paths.every(path => validPath(path) && !!manifest.files[path])) {
        result.push({ name, cache, record });
      }
    } catch { /* Incomplete or corrupt metadata never makes a pack available. */ }
  }
  return result;
}
async function existingResponse(storage: CacheStorage, base: URL, manifest: OfflineManifest, packs: OpenPack[], path: string): Promise<Response | undefined> {
  const url = new URL(path, base).href;
  for (const pack of packs) {
    if (!pack.record.paths.includes(path)) continue;
    const response = await pack.cache.match(url);
    if (response) {
      try { return await validateResponse(response, manifest.files[path], path); }
      catch { /* Fetch a clean copy instead of propagating corrupt local bytes. */ }
    }
  }
  const content = `${manifest.cachePrefix}content-${manifest.contentVersion}`;
  if ((await storage.keys()).includes(content)) {
    const response = await (await storage.open(content)).match(url);
    if (response) {
      try { return await validateResponse(response, manifest.files[path], path); }
      catch { /* A failed validation must not replace an existing good pack. */ }
    }
  }
  return undefined;
}

export async function inspectOfflineDownloads(baseUrl: string): Promise<string[]> {
  const base = baseURL(baseUrl), storage = cacheStorage(), manifest = await getOfflineManifest(base.href);
  const paths = new Set<string>();
  for (const pack of await openPacks(storage, base, manifest)) {
    for (const path of pack.record.paths) if (await pack.cache.match(new URL(path, base).href)) paths.add(path);
  }
  const content = `${manifest.cachePrefix}content-${manifest.contentVersion}`;
  if ((await storage.keys()).includes(content)) {
    for (const request of await (await storage.open(content)).keys()) {
      const url = new URL(request.url);
      const path = url.pathname.slice(base.pathname.length);
      if (url.origin === base.origin && url.pathname.startsWith(base.pathname) && manifest.files[path]) paths.add(path);
    }
  }
  return [...paths].sort();
}

export async function downloadOfflineFiles(baseUrl: string, paths: string[], options: OfflineDownloadOptions = {}): Promise<{ contentVersion: string; paths: string[]; bytes: number }> {
  const base = baseURL(baseUrl), storage = cacheStorage();
  const packId = options.packId ?? 'reader';
  if (!/^[A-Za-z0-9][A-Za-z0-9:_-]{0,79}$/.test(packId)) throw new Error('The offline edition identifier is invalid.');
  if (!paths.length || paths.some(path => !validPath(path))) throw new Error('Choose public scripture files from this application to download.');
  return exclusive(`adigun-bible-offline:${base.href}`, async () => {
    abortIfNeeded(options.signal);
    const manifest = await getOfflineManifest(base.href);
    const targets = [...new Set(paths)];
    if (targets.some(path => !manifest.files[path])) throw new Error('This edition is not in the current offline inventory. Update the application before downloading.');
    const packs = await openPacks(storage, base, manifest);
    const previous = packs.filter(pack => pack.record.packId === packId);
    const retained = [...new Set(previous.flatMap(pack => pack.record.paths))];
    const publishedPaths = [...new Set([...retained, ...targets])].sort();
    const name = `${manifest.cachePrefix}pack-${manifest.contentVersion}-${crypto.randomUUID()}`;
    const staged = await storage.open(name);
    try {
      let completed = 0;
      options.onProgress?.(0, targets.length);
      for (const path of publishedPaths) {
        abortIfNeeded(options.signal);
        const url = new URL(path, base).href;
        const cached = await existingResponse(storage, base, manifest, packs, path);
        const response = cached ?? await validateResponse(await fetch(url, { cache: 'no-store', signal: options.signal }), manifest.files[path], path);
        await staged.put(url, response);
        if (targets.includes(path)) options.onProgress?.(++completed, targets.length);
      }
      abortIfNeeded(options.signal);
      const record: Pack = { schemaVersion: 1, appId: 'adigun-aibible', basePath: base.pathname, contentVersion: manifest.contentVersion, packId, paths: publishedPaths, createdAt: new Date().toISOString() };
      await staged.put(new URL(MARKER, base).href, new Response(JSON.stringify(record), { headers: { 'Content-Type': 'application/json' } }));
      // The marker is the atomic publication point. Cleanup cannot turn a committed download into a reported failure.
      await Promise.allSettled(previous.map(pack => storage.delete(pack.name)));
      return { contentVersion: manifest.contentVersion, paths: publishedPaths, bytes: publishedPaths.reduce((sum, path) => sum + manifest.files[path].bytes, 0) };
    } catch (error) {
      await storage.delete(name).catch(() => false);
      if (error instanceof DOMException && error.name === 'QuotaExceededError') throw new Error('There is not enough device storage to stage this download. Existing downloads and personal study data were preserved.');
      throw error;
    }
  });
}

export async function removeOfflineDownloads(baseUrl: string, options: { prefix?: string } = {}): Promise<number> {
  const base = baseURL(baseUrl), storage = cacheStorage();
  const prefix = options.prefix ?? 'data/';
  if (!prefix.startsWith('data/') || prefix.includes('..') || /[?#\\]/.test(prefix)) throw new Error('Only this application’s public scripture downloads can be removed.');
  return exclusive(`adigun-bible-offline:${base.href}`, async () => {
    const manifest = await getOfflineManifest(base.href);
    const selected = (path: string) => path.startsWith(prefix) && !!manifest.files[path] && !essential(path);
    const removed = new Set<string>();
    for (const pack of await openPacks(storage, base, manifest)) {
      for (const path of pack.record.paths.filter(selected)) {
        if (await pack.cache.delete(new URL(path, base).href)) removed.add(path);
      }
      const remaining = pack.record.paths.filter(path => !selected(path));
      if (!remaining.length) await storage.delete(pack.name);
      else if (remaining.length !== pack.record.paths.length) {
        await pack.cache.put(new URL(MARKER, base).href, new Response(JSON.stringify({ ...pack.record, paths: remaining }), { headers: { 'Content-Type': 'application/json' } }));
      }
    }
    const content = `${manifest.cachePrefix}content-${manifest.contentVersion}`;
    if ((await storage.keys()).includes(content)) {
      const cache = await storage.open(content);
      for (const request of await cache.keys()) {
        const url = new URL(request.url), path = url.pathname.slice(base.pathname.length);
        if (url.origin === base.origin && url.pathname.startsWith(base.pathname) && selected(path) && await cache.delete(request)) removed.add(path);
      }
    }
    return removed.size;
  });
}

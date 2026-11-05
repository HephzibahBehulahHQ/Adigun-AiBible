import type { Edition } from '../types';
import type { OfflineFile, OfflineManifest } from '../offline';
import { validateConcordanceManifest, validateConcordanceRows } from './model.ts';
import type { ConcordanceSource } from './model.ts';

const MAX_INDEX_BYTES = 32 * 1024 * 1024;
export interface ConcordanceSourceServices {
  installedBibleIds: readonly string[];
  getInventory: (baseUrl: string) => Promise<OfflineManifest>;
  fetch: (url: URL, options: RequestInit) => Promise<Response>;
  requirePermission: (edition: Edition, operation: 'display' | 'searchIndex') => Promise<void>;
}
const abort = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException('Concordance cancelled.', 'AbortError');
};
function descriptor(value: OfflineFile | undefined, label: string): OfflineFile {
  if (!value || !/^[a-f0-9]{64}$/.test(value.sha256) || !Number.isSafeInteger(value.bytes) || value.bytes < 1 || value.bytes > MAX_INDEX_BYTES) {
    throw new Error(`${label} is absent from the current verified file inventory or exceeds this tool’s 32 MB file limit. Counts are unavailable.`);
  }
  return value;
}

/** One byte-verification boundary for the current raw JSON contract and any future codec. */
export async function readVerifiedConcordanceJson(url: URL, file: OfflineFile, fetcher: ConcordanceSourceServices['fetch'], signal?: AbortSignal): Promise<unknown> {
  abort(signal);
  const response = await fetcher(url, { cache: 'no-cache', signal });
  if (!response.ok || response.type === 'opaque') throw new Error('This edition’s source index or inventory is unavailable. Download the edition while online, then retry.');
  const declaredLength = response.headers.get('content-length');
  if (declaredLength && Number(declaredLength) > MAX_INDEX_BYTES) throw new Error('The source response exceeds the concordance file limit.');
  const bytes = await response.arrayBuffer(); abort(signal);
  if (bytes.byteLength !== file.bytes || bytes.byteLength > MAX_INDEX_BYTES) throw new Error('The source file size changed. Update the application before counting occurrences.');
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
  abort(signal);
  if (digest !== file.sha256) throw new Error('The source file checksum changed. No concordance count is available; update the application and retry.');
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new Error('The verified source file is not valid UTF-8 JSON. No concordance count is available.'); }
}

/** Retain at most one complete edition index in this worker; never persist private state. */
export class ConcordanceSourceLoader {
  private cached: { key: string; source: ConcordanceSource } | null = null;
  private services: ConcordanceSourceServices;
  constructor(services: ConcordanceSourceServices) { this.services = services; }
  clear(): void { this.cached = null; }
  async load(editionId: string, baseUrl: string, signal?: AbortSignal, onStatus?: (message: string) => void): Promise<ConcordanceSource> {
    abort(signal);
    if (!this.services.installedBibleIds.includes(editionId) || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(editionId)) throw new Error('Concordance is available only for installed Bible editions. Quran sources use their separate workspace.');
    const base = new URL(baseUrl);
    if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password || base.hash || base.search || !base.pathname.endsWith('/')) throw new Error('The application source location is invalid.');
    onStatus?.('Checking the current source inventory and permissions…');
    const inventory = await this.services.getInventory(base.href); abort(signal);
    if (inventory.basePath !== base.pathname) throw new Error('This source inventory belongs to another application path.');
    const prefix = editionId === 'eng-web' ? 'data' : `data/editions/${editionId}`;
    const manifestPath = `${prefix}/manifest.json`, indexPath = `${prefix}/search-index.json`;
    const manifestFile = descriptor(inventory.files[manifestPath], 'The edition manifest');
    const indexFile = descriptor(inventory.files[indexPath], 'The edition search index');
    const key = JSON.stringify([base.href, editionId, inventory.contentVersion, manifestFile.sha256, indexFile.sha256]);
    if (this.cached?.key === key) {
      await this.services.requirePermission(this.cached.source.manifest.edition, 'display');
      await this.services.requirePermission(this.cached.source.manifest.edition, 'searchIndex');
      abort(signal); return this.cached.source;
    }
    // Switching editions releases the previous corpus before allocating another one.
    this.cached = null;
    const manifest = validateConcordanceManifest(await readVerifiedConcordanceJson(new URL(manifestPath, base), manifestFile, this.services.fetch, signal), editionId);
    await this.services.requirePermission(manifest.edition, 'display');
    await this.services.requirePermission(manifest.edition, 'searchIndex'); abort(signal);
    onStatus?.('Verifying the exact source index and complete verse coverage…');
    const rows = validateConcordanceRows(await readVerifiedConcordanceJson(new URL(indexPath, base), indexFile, this.services.fetch, signal), manifest);
    abort(signal);
    const source = { manifest, rows, indexSha256: indexFile.sha256, contentVersion: inventory.contentVersion };
    this.cached = { key, source }; return source;
  }
}

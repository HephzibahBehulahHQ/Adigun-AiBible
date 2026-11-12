import type { Edition, Manifest } from '../types';
import type { OfflineManifest } from '../offline';
import type { HistoricalManifest } from '../historical/model';
import type { EditionRightsRegister } from '../edition-rights';
import { decideEditionOperation } from '../edition-rights.ts';

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const id = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,99}$/.test(value);
const path = (value: string) => /^data\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value) && !value.split('/').some(part => !part || part === '.' || part === '..');

export interface PublisherInventoryRow { editionId: string; sourceSha256: string; totalSpans: number; totalVerses: number; books: { bookId: string; spans: number; verses: number }[] }
export function publisherInventory(value: unknown): PublisherInventoryRow[] {
  if (!object(value) || value.schemaVersion !== 1 || !Array.isArray(value.editions) || !value.editions.length) throw new Error('Publisher speaker inventory is unavailable or malformed.');
  const ids = new Set<string>();
  return value.editions.map(raw => {
    const noPublisherMarkers = object(raw) && raw.marker === 'none' && raw.offsetUnit === 'not-applicable' && raw.totalSpans === 0 && raw.totalVerses === 0;
    if (!object(raw) || !id(raw.editionId) || ids.has(raw.editionId) || !hash(raw.sourceSha256) || raw.status !== 'publisher-metadata' || !(raw.marker === 'wj' && raw.offsetUnit === 'unicode-codepoint' || noPublisherMarkers) || !count(raw.totalSpans) || !count(raw.totalVerses) || !Array.isArray(raw.books) || !raw.books.length) throw new Error('Publisher speaker counts have invalid identity or provenance.');
    ids.add(raw.editionId);
    const books = raw.books.map(book => {
      if (!object(book) || typeof book.bookId !== 'string' || !/^[1-3]?[A-Z]{2,3}$/.test(book.bookId) || !count(book.spans) || !count(book.verses) || book.verses > book.spans) throw new Error('Publisher speaker book counts are inconsistent.');
      return { bookId: book.bookId, spans: book.spans, verses: book.verses };
    });
    if (new Set(books.map(book => book.bookId)).size !== books.length || books.reduce((sum, book) => sum + book.spans, 0) !== raw.totalSpans || books.reduce((sum, book) => sum + book.verses, 0) !== raw.totalVerses) throw new Error('Publisher speaker totals do not match their book inventory.');
    return { editionId: raw.editionId, sourceSha256: raw.sourceSha256, totalSpans: raw.totalSpans, totalVerses: raw.totalVerses, books };
  });
}
export function matchedPublisherInventory(rows: PublisherInventoryRow[], manifests: Manifest[]) {
  return rows.map(row => {
    const manifest = manifests.find(item => item.edition.id === row.editionId);
    const matched = !!manifest && manifest.edition.sha256 === row.sourceSha256 && manifest.books.length === row.books.length && row.books.every(book => manifest.books.some(item => item.id === book.bookId));
    return { ...row, name: manifest?.edition.name || row.editionId, matched, sourceUnits: matched ? manifest.totals.verses : null };
  });
}

export interface DictionaryInventoryRow { id: string; title: string; path: string; records: number; headwords: number; dataSha256: string; sourceSha256: string; license: string; sourceUrl: string; languageCounts: Record<string, number> }
export interface DictionaryInventory { sourceCommit: string; totalRecords: number; dictionaries: DictionaryInventoryRow[] }
export function dictionaryInventory(value: unknown): DictionaryInventory {
  if (!object(value) || value.schemaVersion !== 1 || typeof value.sourceCommit !== 'string' || !/^[a-f0-9]{40}$/.test(value.sourceCommit) || !count(value.totalRecords) || !Array.isArray(value.dictionaries) || !value.dictionaries.length) throw new Error('The dictionary inventory is unavailable or malformed.');
  const dictionaries = value.dictionaries.map(raw => {
    if (!object(raw) || !id(raw.id) || typeof raw.title !== 'string' || !raw.title.trim() || typeof raw.path !== 'string' || !/^[a-z0-9-]+\.json$/.test(raw.path) || !count(raw.records) || !count(raw.headwords) || raw.headwords > raw.records || !hash(raw.dataSha256) || !hash(raw.sourceSha256) || typeof raw.license !== 'string' || !raw.license.trim() || typeof raw.sourceUrl !== 'string' || !object(raw.languageCounts) || !Object.values(raw.languageCounts).every(count)) throw new Error('Dictionary coverage lacks valid source metadata.');
    try { const url = new URL(raw.sourceUrl); if (url.protocol !== 'https:' || url.username || url.password) throw new Error(); } catch { throw new Error('Dictionary rights evidence has an unsafe or missing source link.'); }
    const languageCounts = raw.languageCounts as Record<string, number>;
    if (Object.values(languageCounts).reduce((sum, total) => sum + total, 0) !== raw.records) throw new Error('Dictionary language counts do not match its records.');
    return { id: raw.id, title: raw.title, path: raw.path, records: raw.records, headwords: raw.headwords, sourceSha256: raw.sourceSha256, dataSha256: raw.dataSha256, license: raw.license, sourceUrl: raw.sourceUrl, languageCounts };
  });
  if (new Set(dictionaries.map(row => row.id)).size !== dictionaries.length || dictionaries.reduce((sum, row) => sum + row.records, 0) !== value.totalRecords) throw new Error('Dictionary totals are duplicated or inconsistent.');
  return { sourceCommit: value.sourceCommit, totalRecords: value.totalRecords, dictionaries };
}

export interface CatalogOnlyWork { id: string; title: string }
export function catalogOnlyCount(works: readonly CatalogOnlyWork[] | undefined): number | null {
  if (!works) return null;
  if (works.some(work => !id(work.id) || !work.title.trim()) || new Set(works.map(work => work.id)).size !== works.length) throw new Error('Historical catalog-only inventory is malformed or duplicated.');
  return works.length;
}

export interface OfflinePackDefinition { id: string; title: string; paths: string[]; permission: 'allowed' | 'denied' | 'unknown'; reason?: string }
export type OfflinePackStatus = 'complete' | 'partial' | 'missing' | 'invalid' | 'unknown' | 'blocked';
export interface OfflinePackCoverage extends OfflinePackDefinition { status: OfflinePackStatus; present: number; required: number; detail: string }
const essential = ['data/manifest.json', 'data/editions/catalog.json', 'data/editions/rights-register.json'];
function permission(edition: Edition, register: EditionRightsRegister | null): Pick<OfflinePackDefinition, 'permission' | 'reason'> {
  if (!register) return { permission: 'unknown', reason: 'Current source permissions could not be verified.' };
  const decisions = (['display', 'offline'] as const).map(operation => decideEditionOperation(register.editions.find(row => row.editionId === edition.id), operation, { sourceSha256: edition.sha256, aiProductEnabled: false }));
  const denied = decisions.find(decision => !decision.allowed);
  return denied ? { permission: 'denied', reason: denied.reason } : { permission: 'allowed' };
}
export function offlinePackDefinitions(manifests: Manifest[], editions: Edition[], historical: HistoricalManifest | null, dictionaries: DictionaryInventory | null, register: EditionRightsRegister | null): OfflinePackDefinition[] {
  const packs: OfflinePackDefinition[] = manifests.map(manifest => {
    const edition = manifest.edition, base = edition.id === 'eng-web' ? 'data' : `data/editions/${edition.id}`;
    return { id: `bible-${edition.id}`, title: `${edition.name} · complete text and search`, paths: [...new Set([...essential, `${base}/manifest.json`, `${base}/search-index.json`, 'data/editorial.json', ...manifest.books.map(book => `${base}/books/${book.id}.json`), ...(edition.noticePath ? [`data/editions/${edition.noticePath}`] : [])])], ...permission(edition, register) };
  });
  for (const edition of editions.filter(row => row.corpus === 'bible' && !manifests.some(manifest => manifest.edition.id === row.id))) packs.push({ id: `bible-${edition.id}`, title: `${edition.name} · complete text and search`, paths: [], permission: 'unknown', reason: 'The exact edition manifest is unavailable; required files cannot be counted.' });
  for (const edition of editions.filter(row => row.corpus === 'quran')) packs.push({ id: `quran-${edition.id}`, title: `${edition.name} · separate Quran corpus`, paths: [...essential, `data/editions/${edition.id}/manifest.json`, `data/editions/${edition.id}/quran.json`, ...(edition.noticePath ? [`data/editions/${edition.noticePath}`] : [])], ...permission(edition, register) });
  for (const edition of historical?.editions || []) packs.push({ id: `historical-${edition.id}`, title: edition.title, paths: ['data/historical/manifest.json', edition.path, edition.noticePath], permission: edition.rights.display && edition.rights.offline ? 'allowed' : 'denied', reason: 'The historical edition does not permit this offline use.' });
  if (dictionaries) {
    const permitted = dictionaries.dictionaries.every(row => row.license === 'Public domain (source XML statement)');
    packs.push({ id: 'historical-lexicons', title: 'Both historical dictionaries and source notices', paths: ['data/linguistics/manifest.json', 'data/linguistics/NOTICE.txt', ...dictionaries.dictionaries.map(row => `data/linguistics/${row.path}`)], permission: permitted ? 'allowed' : 'unknown', ...(!permitted ? { reason: 'The dictionary source grant differs from the supported public-domain XML import; offline permission needs verification.' } : {}) });
  }
  return packs;
}

export interface CachedInventory { paths: Set<string>; read: (path: string) => Promise<Response | undefined> }
/** Reads only this app's current content caches; staging, older releases and private databases are excluded. */
export async function currentCachedInventory(storage: CacheStorage, base: URL, manifest: OfflineManifest): Promise<CachedInventory> {
  if (base.pathname !== manifest.basePath || base.search || base.hash) throw new Error('The offline inventory does not belong to this application.');
  const available = new Map<string, Cache[]>(), names = await storage.keys(), current = `${manifest.cachePrefix}content-${manifest.contentVersion}`, prefix = `${manifest.cachePrefix}pack-${manifest.contentVersion}-`;
  for (const name of names) {
    if (name !== current && !name.startsWith(prefix)) continue;
    const cache = await storage.open(name); let listed: Set<string> | null = null;
    if (name !== current) {
      const marker = await cache.match(new URL('__adigun_offline_pack__.json', base));
      if (!marker) continue;
      let raw: unknown; try { raw = await marker.json(); } catch { continue; }
      if (!object(raw) || raw.schemaVersion !== 1 || raw.appId !== 'adigun-aibible' || raw.basePath !== base.pathname || raw.contentVersion !== manifest.contentVersion || !Array.isArray(raw.paths) || raw.paths.some(value => typeof value !== 'string' || !path(value) || !manifest.files[value])) continue;
      listed = new Set(raw.paths as string[]);
    }
    for (const request of await cache.keys()) {
      const url = new URL(request.url), relative = url.pathname.slice(base.pathname.length);
      if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname) || url.search || url.hash || !path(relative) || !manifest.files[relative] || (listed && !listed.has(relative))) continue;
      available.set(relative, [...(available.get(relative) || []), cache]);
    }
  }
  return { paths: new Set(available.keys()), read: async relative => { for (const cache of available.get(relative) || []) { const response = await cache.match(new URL(relative, base)); if (response) return response; } return undefined; } };
}
export async function verifyOfflinePacks(packs: OfflinePackDefinition[], manifest: OfflineManifest, cached: CachedInventory, signal?: AbortSignal): Promise<OfflinePackCoverage[]> {
  const verified = new Map<string, Promise<boolean>>();
  const check = () => { if (signal?.aborted) throw new Error('Coverage inspection cancelled.'); };
  const verify = (file: string) => {
    if (!verified.has(file)) verified.set(file, (async () => {
      check(); const response = await cached.read(file); if (!response?.ok) return false;
      const bytes = await response.arrayBuffer(); check();
      const expected = manifest.files[file]; if (bytes.byteLength !== expected.bytes) return false;
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('');
      check(); return digest === expected.sha256;
    })());
    return verified.get(file)!;
  };
  const rows: OfflinePackCoverage[] = [];
  for (const pack of packs) {
    check(); const files = [...new Set(pack.paths)], present = files.filter(file => cached.paths.has(file)).length;
    let status: OfflinePackStatus, detail: string;
    if (!files.length || files.some(file => !path(file) || !manifest.files[file])) { status = 'unknown'; detail = pack.reason || 'Required source files are absent from this build inventory.'; }
    else if (pack.permission === 'unknown') { status = 'unknown'; detail = pack.reason || 'Source permission is unknown.'; }
    else if (pack.permission === 'denied') { status = 'blocked'; detail = pack.reason || 'Source permission is unavailable.'; }
    else if (present < files.length) { status = present ? 'partial' : 'missing'; detail = `${present} of ${files.length} required source and notice files are present.`; }
    else {
      let valid = true; for (const file of files) if (!await verify(file)) { valid = false; break; }
      status = valid ? 'complete' : 'invalid'; detail = valid ? `All ${files.length} required files match this build’s byte counts and checksums.` : 'A cached file is missing or differs from this build. It is not counted as complete.';
    }
    rows.push({ ...pack, status, present, required: files.length, detail });
  }
  return rows;
}

/** Build declarations match the current local-only client. They are not remote health checks. */
export const buildServiceInventory = [
  { id: 'accounts', title: 'Accounts and authentication', configured: false },
  { id: 'sync', title: 'Cloud study synchronization', configured: false },
  { id: 'circles', title: 'Connected private circles', configured: false },
  { id: 'assistant', title: 'Generative assistant gateway', configured: false },
] as const;

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { assertSourceInventory, downloadSourceBook, removeSourceBook, verifySourceDownload } from '../src/original-language/offline.ts';
import { sourcePins, SOURCE_PREFIX, requiredSourcePaths, HebrewSourceLoader, verifiedSourceBytes, pinFor } from '../src/original-language/source.ts';

const BASE = 'https://example.test/Adigun-AiBible/', ROOT = new URL('../data/original-language/oshb/', import.meta.url);
const key = input => input instanceof Request ? input.url : String(input);
class MemoryCache {
  entries = new Map();
  async match(input) { return this.entries.get(key(input))?.clone(); }
  async put(input, response) { this.entries.set(key(input), response.clone()); }
  async delete(input) { return this.entries.delete(key(input)); }
  async keys() { return [...this.entries.keys()].map(url => new Request(url)); }
}
class MemoryStorage {
  entries = new Map();
  async keys() { return [...this.entries.keys()]; }
  async open(name) { if (!this.entries.has(name)) this.entries.set(name, new MemoryCache()); return this.entries.get(name); }
  async delete(name) { return this.entries.delete(name); }
}
function fixture() {
  const storage = new MemoryStorage(), failures = new Map(), requests = [];
  const inventory = { schemaVersion: 1, appId: 'adigun-aibible', basePath: '/Adigun-AiBible/', cachePrefix: `adigun-bible-${createHash('sha256').update('/Adigun-AiBible/').digest('hex').slice(0, 12)}-`, contentVersion: '1'.repeat(24), buildVersion: '2'.repeat(24), files: Object.fromEntries([...sourcePins].map(([path, pin]) => [SOURCE_PREFIX + path, { bytes: pin.bytes, sha256: pin.sha256 }])) };
  const fetcher = async (input, options = {}) => {
    if (options.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    const path = new URL(key(input)).pathname.slice(inventory.basePath.length); requests.push(path);
    if (path === 'offline-manifest.json') return Response.json(inventory);
    if (failures.has(path)) throw failures.get(path);
    return new Response(await readFile(new URL(path.slice(SOURCE_PREFIX.length), ROOT)));
  };
  return { storage, inventory, fetcher, failures, requests };
}
async function withBrowser(f, action) {
  const originalFetch = globalThis.fetch, descriptor = Object.getOwnPropertyDescriptor(globalThis, 'caches');
  globalThis.fetch = f.fetcher; Object.defineProperty(globalThis, 'caches', { value: f.storage, configurable: true });
  try { return await action(); }
  finally { globalThis.fetch = originalFetch; if (descriptor) Object.defineProperty(globalThis, 'caches', descriptor); else delete globalThis.caches; }
}

test('selected source book atomically includes all exact provenance, morphology and notice bytes and can reopen from cache', async () => {
  const f = fixture(); await withBrowser(f, async () => {
    assert.equal((await verifySourceDownload(BASE, 'Gen')).verified, false);
    const result = await downloadSourceBook(BASE, 'Gen'); assert.equal(result.verified, true);
    const paths = requiredSourcePaths('Gen'); assert.equal(paths.length, 10);
    for (const required of ['source.json','integrity.json','manifest.json','morphology.json','notices/LICENSE.md','notices/README.md','notices/parsing-README.md','notices/Oshm.xml.txt','notices/HebrewMorphologyCodes.html.txt']) assert.ok(paths.includes(SOURCE_PREFIX + required));
    const names = await f.storage.keys(); assert.equal(names.length, 1);
    const cache = await f.storage.open(names[0]);
    const loader = new HebrewSourceLoader(BASE, async url => {
      const response = await cache.match(url.href); if (!response) throw new Error('Offline and not downloaded'); return response;
    });
    assert.equal((await loader.loadBook('Gen')).chapters[0].verses[0].osisId, 'Gen.1.1');
    assert.equal(Object.keys((await loader.loadMorphology()).codes).length, 3481);
    await assert.rejects(() => loader.loadBook('Exod'), /Offline and not downloaded/);
  });
});

test('cached filenames, unfinished staging and previous content versions cannot count as verified downloads', async () => {
  const f = fixture(); await withBrowser(f, async () => {
    const staging = await f.storage.open(`${f.inventory.cachePrefix}pack-${f.inventory.contentVersion}-staging`);
    for (const path of requiredSourcePaths('Gen')) await staging.put(new URL(path, BASE).href, await f.fetcher(new URL(path, BASE)));
    assert.equal((await verifySourceDownload(BASE, 'Gen')).verified, false);
    const previous = await f.storage.open(`${f.inventory.cachePrefix}content-${'0'.repeat(24)}`);
    for (const path of requiredSourcePaths('Gen')) await previous.put(new URL(path, BASE).href, await f.fetcher(new URL(path, BASE)));
    assert.equal((await verifySourceDownload(BASE, 'Gen')).verified, false);
    const oversizedMarker = new Response(' '.repeat(2 * 1024 * 1024 + 1));
    await staging.put(new URL('__adigun_offline_pack__.json', BASE).href, oversizedMarker);
    assert.equal((await verifySourceDownload(BASE, 'Gen')).verified, false);
    await downloadSourceBook(BASE, 'Gen');
    const name = (await f.storage.keys()).find(value => value.startsWith(`${f.inventory.cachePrefix}pack-${f.inventory.contentVersion}-`) && !value.endsWith('-staging'));
    const committed = await f.storage.open(name), path = SOURCE_PREFIX + 'notices/LICENSE.md', damaged = await readFile(new URL('notices/LICENSE.md', ROOT)); damaged[0] ^= 1;
    await committed.put(new URL(path, BASE).href, new Response(damaged));
    const result = await verifySourceDownload(BASE, 'Gen'); assert.equal(result.verified, false); assert.deepEqual(result.missing, [path]);
  });
});

test('changed inventory fails closed before download, and cancelled/failed new packs preserve an existing verified book', async () => {
  const f = fixture(); await withBrowser(f, async () => {
    await downloadSourceBook(BASE, 'Gen'); const names = await f.storage.keys();
    const altered = structuredClone(f.inventory); altered.files[SOURCE_PREFIX + 'books/Gen.json'].sha256 = 'f'.repeat(64);
    assert.throws(() => assertSourceInventory(altered, requiredSourcePaths('Gen')), /does not match/);
    const controller = new AbortController();
    await assert.rejects(() => downloadSourceBook(BASE, 'Exod', controller.signal, done => { if (done === 1) controller.abort(); }), { name: 'AbortError' });
    assert.deepEqual(await f.storage.keys(), names); assert.equal((await verifySourceDownload(BASE, 'Gen')).verified, true);
    f.failures.set(SOURCE_PREFIX + 'books/Lev.json', new Error('Connection interrupted'));
    await assert.rejects(() => downloadSourceBook(BASE, 'Lev'), /Connection interrupted/);
    assert.deepEqual(await f.storage.keys(), names); assert.equal((await verifySourceDownload(BASE, 'Gen')).verified, true);
  });
});

test('source-book removal preserves other verified source books and shared notices', async () => {
  const f = fixture(); await withBrowser(f, async () => {
    await downloadSourceBook(BASE, 'Gen'); await downloadSourceBook(BASE, 'Ruth');
    await removeSourceBook(BASE, 'Gen');
    assert.equal((await verifySourceDownload(BASE, 'Gen')).verified, false); assert.equal((await verifySourceDownload(BASE, 'Ruth')).verified, true);
    const missing = (await verifySourceDownload(BASE, 'Gen')).missing; assert.deepEqual(missing, [SOURCE_PREFIX + 'books/Gen.json']);
    assert.ok((await f.storage.keys()).length > 0);
  });
});

test('streamed source data enforces the exact pin before allocation and cancellation stops a pending reader', async () => {
  const pin = pinFor('notices/LICENSE.md'); let cancelled = false;
  const oversized = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(pin.bytes + 1)); }, cancel() { cancelled = true; } });
  await assert.rejects(() => verifiedSourceBytes(new Response(oversized), pin), /bounded byte length/); assert.equal(cancelled, true);
  const cloned = new Response('x'.repeat(pin.bytes + 1)).clone();
  await assert.rejects(() => verifiedSourceBytes(cloned, pin), /bounded byte length/);
  const abort = new AbortController(); let cancelPending;
  const pending = new ReadableStream({ cancel() { cancelPending = true; } });
  const request = verifiedSourceBytes(new Response(pending), pin, abort.signal); abort.abort();
  await assert.rejects(request, { name: 'AbortError' }); assert.equal(cancelPending, true);
  await assert.rejects(() => verifiedSourceBytes(new Response('x', { headers: { 'content-length': String(pin.bytes + 1) } }), pin), /pinned byte length/);
});

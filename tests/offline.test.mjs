import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { createServiceWorkerSource, finalizeBuild } from '../scripts/finalize-build.mjs';
import { downloadOfflineFiles, getOfflineManifest, inspectOfflineDownloads, removeOfflineDownloads } from '../src/offline.ts';

// These short text records are synthetic tests, never included in production corpus files.
const BASE = 'https://example.test/Adigun-AiBible/';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const staticEdition = id => ({ id, sha256: hash(Buffer.from(`fixture-${id}`)) });
const staticRights = id => ({ editionId: id, sourceSha256: staticEdition(id).sha256, territory: { scope: 'worldwide', countries: [] }, withdrawn: false, expiresOn: null, operations: { display: { state: 'allowed' } } });
const book = (id, text) => JSON.stringify({ id, name: id, chapters: [{ number: 1, verses: [{ number: 1, text }] }] });
const key = input => input instanceof Request ? input.url : String(input);
class MemoryCache {
  constructor(name, storage) { this.name = name; this.storage = storage; this.entries = new Map(); }
  async match(input) { return this.entries.get(key(input))?.clone(); }
  async put(input, response) {
    if (this.storage.rejectPut?.(this.name, key(input))) throw new DOMException('Test storage is full.', 'QuotaExceededError');
    this.entries.set(key(input), response.clone());
  }
  async delete(input) { return this.entries.delete(key(input)); }
  async keys() { return [...this.entries.keys()].map(url => new Request(url)); }
}
class MemoryCacheStorage {
  constructor() { this.entries = new Map(); this.deleted = []; }
  async keys() { return [...this.entries.keys()]; }
  async open(name) {
    if (!this.entries.has(name)) this.entries.set(name, new MemoryCache(name, this));
    return this.entries.get(name);
  }
  async delete(name) { this.deleted.push(name); return this.entries.delete(name); }
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'aibible-offline-'));
  const files = {
    'index.html': '<!doctype html><title>Offline test fixture</title>',
    'manifest.webmanifest': JSON.stringify({ name: 'Test fixture', start_url: './' }),
    'assets/app.js': '/* test-only application asset */',
    'data/manifest.json': JSON.stringify({ edition: { id: 'eng-web' }, books: [{ id: 'GEN' }, { id: 'EXO' }] }),
    'data/editions/catalog.json': JSON.stringify({ schemaVersion: 1, editions: ['eng-web', 'yor'].map(staticEdition) }),
    'data/editions/rights-register.json': JSON.stringify({ schemaVersion: 1, editions: ['eng-web', 'yor'].map(staticRights) }),
    'data/books/GEN.json': book('GEN', 'Synthetic source version one.'),
    'data/books/EXO.json': book('EXO', 'Another synthetic record.'),
    'data/search-index.json': JSON.stringify([{ bookId: 'GEN', text: 'Synthetic search data.' }]),
    'data/editions/yor/manifest.json': JSON.stringify({ edition: { id: 'yor' }, books: [{ id: 'GEN' }] }),
    'data/editions/yor/books/GEN.json': book('GEN', 'Àpẹẹrẹ ìdánwò.'),
  };
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(root, 'dist', path, '..'), { recursive: true });
    await writeFile(join(root, 'dist', path), content);
  }
  const { manifest } = await finalizeBuild({ root, base: new URL(BASE).pathname, sourceCommit: 'test-only-revision' });
  const cache = new MemoryCacheStorage(), failures = new Map(), requests = [];
  const fetch = async (input, options = {}) => {
    if (options.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    const url = new URL(key(input)), path = url.pathname.slice(new URL(BASE).pathname.length);
    requests.push({ path, cache: options.cache });
    if (failures.has(path)) {
      const failure = failures.get(path);
      if (failure instanceof Error) throw failure;
      return new Response(failure.text ?? 'Unavailable', { status: failure.status ?? 503 });
    }
    try { return new Response(await readFile(join(root, 'dist', path)), { headers: { 'Content-Type': path.endsWith('.json') ? 'application/json' : 'text/plain' } }); }
    catch { return new Response('Not found', { status: 404 }); }
  };
  return { root, manifest, files, cache, fetch, failures, requests, close: () => rm(root, { recursive: true, force: true }) };
}
async function withBrowser(f, action) {
  const cacheDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'caches');
  const originalFetch = globalThis.fetch;
  Object.defineProperty(globalThis, 'caches', { configurable: true, value: f.cache });
  globalThis.fetch = f.fetch;
  try { return await action(); }
  finally {
    globalThis.fetch = originalFetch;
    if (cacheDescriptor) Object.defineProperty(globalThis, 'caches', cacheDescriptor);
    else delete globalThis.caches;
  }
}
async function worker(f, source) {
  const handlers = new Map();
  let waitingRequests = 0, claimed = 0;
  const self = { location: { origin: new URL(BASE).origin }, addEventListener: (name, handler) => handlers.set(name, handler),
    skipWaiting: () => { waitingRequests++; }, clients: { claim: async () => { claimed++; } } };
  vm.runInNewContext(source ?? await readFile(join(f.root, 'dist/sw.js'), 'utf8'), { self, caches: f.cache, fetch: f.fetch, crypto: globalThis.crypto, URL, Request, Response, TextDecoder, Uint8Array, Date, console });
  return {
    async lifecycle(name) { let promise; handlers.get(name)({ waitUntil: value => { promise = value; } }); return promise; },
    async request(path, options = {}) { let promise; handlers.get('fetch')({ request: new Request(new URL(path, BASE), options), respondWith: value => { promise = value; } }); return promise; },
    message(data) { handlers.get('message')({ data }); },
    get waitingRequests() { return waitingRequests; }, get claimed() { return claimed; },
  };
}

test('a corpus-only edit changes its offline version and worker, with stable versions for unchanged bytes', async () => {
  const f = await fixture();
  try {
    const first = f.manifest, originalWorker = await readFile(join(f.root, 'dist/sw.js'), 'utf8');
    const unchanged = await finalizeBuild({ root: f.root, base: new URL(BASE).pathname, sourceCommit: 'different-metadata-only-revision' });
    assert.equal(unchanged.manifest.contentVersion, first.contentVersion);
    assert.equal(unchanged.manifest.buildVersion, first.buildVersion);
    await writeFile(join(f.root, 'dist/data/books/GEN.json'), book('GEN', 'Synthetic source version two.'));
    const changed = await finalizeBuild({ root: f.root, base: new URL(BASE).pathname, sourceCommit: 'test-only-revision-two' });
    assert.notEqual(changed.manifest.contentVersion, first.contentVersion);
    assert.notEqual(changed.manifest.buildVersion, first.buildVersion);
    assert.notEqual(await readFile(join(f.root, 'dist/sw.js'), 'utf8'), originalWorker);
    const bytes = await readFile(join(f.root, 'dist/data/books/GEN.json'));
    assert.deepEqual(changed.manifest.files['data/books/GEN.json'], { sha256: hash(bytes), bytes: bytes.length });
  } finally { await f.close(); }
});

test('a failed or corrupt download leaves the previous committed set available, with no partial new files', async () => {
  const f = await fixture();
  try { await withBrowser(f, async () => {
    await downloadOfflineFiles(BASE, ['data/manifest.json', 'data/books/GEN.json'], { packId: 'eng-web' });
    const before = await f.cache.keys();
    f.failures.set('data/books/EXO.json', { status: 200, text: '<html>Upstream error</html>' });
    await assert.rejects(() => downloadOfflineFiles(BASE, ['data/books/EXO.json', 'data/search-index.json'], { packId: 'eng-web' }), /changed|preserved/);
    assert.deepEqual(await f.cache.keys(), before);
    assert.deepEqual(await inspectOfflineDownloads(BASE), ['data/books/GEN.json', 'data/manifest.json']);
    f.failures.clear();
    const result = await downloadOfflineFiles(BASE, ['data/books/EXO.json'], { packId: 'eng-web' });
    assert.deepEqual(result.paths, ['data/books/EXO.json', 'data/books/GEN.json', 'data/manifest.json']);
    assert.ok(f.requests.filter(r => r.path === 'data/books/EXO.json').every(r => r.cache === 'no-store'));
  }); } finally { await f.close(); }
});

test('cancellation and a failed final storage commit preserve the previous download', async () => {
  const f = await fixture();
  try { await withBrowser(f, async () => {
    await downloadOfflineFiles(BASE, ['data/books/GEN.json'], { packId: 'eng-web' });
    const before = await f.cache.keys(), controller = new AbortController();
    await assert.rejects(() => downloadOfflineFiles(BASE, ['data/books/EXO.json', 'data/search-index.json'], {
      packId: 'eng-web', signal: controller.signal, onProgress: completed => { if (completed === 1) controller.abort(); },
    }), { name: 'AbortError' });
    assert.deepEqual(await f.cache.keys(), before);
    f.cache.rejectPut = (_name, url) => url.endsWith('__adigun_offline_pack__.json');
    await assert.rejects(() => downloadOfflineFiles(BASE, ['data/books/EXO.json'], { packId: 'eng-web' }), /not enough device storage/);
    assert.deepEqual(await f.cache.keys(), before);
    assert.deepEqual(await inspectOfflineDownloads(BASE), ['data/books/GEN.json']);
  }); } finally { await f.close(); }
});

test('edition-scoped removal retains other editions, manifests, and unrelated origin storage', async () => {
  const f = await fixture();
  try { await withBrowser(f, async () => {
    const unrelated = await f.cache.open('other-project-private-assets');
    await unrelated.put('https://example.test/other/private', new Response('private sentinel'));
    await downloadOfflineFiles(BASE, ['data/books/GEN.json', 'data/manifest.json'], { packId: 'eng-web' });
    await downloadOfflineFiles(BASE, ['data/editions/yor/books/GEN.json', 'data/editions/yor/manifest.json'], { packId: 'yor' });
    assert.equal(await removeOfflineDownloads(BASE, { prefix: 'data/editions/yor/' }), 1);
    assert.deepEqual(await inspectOfflineDownloads(BASE), ['data/books/GEN.json', 'data/editions/yor/manifest.json', 'data/manifest.json']);
    assert.equal(await (await unrelated.match('https://example.test/other/private')).text(), 'private sentinel');
    await assert.rejects(() => downloadOfflineFiles(BASE, ['../other/private']), /public scripture/);
    await assert.rejects(() => downloadOfflineFiles(BASE, ['data/private.json']), /not in the current offline inventory/);
    await assert.rejects(() => removeOfflineDownloads(BASE, { prefix: '../other/' }), /Only this application/);
    assert.ok(!f.cache.deleted.includes('other-project-private-assets'));
  }); } finally { await f.close(); }
});

test('uncommitted staging files and a previous release are excluded from download counts', async () => {
  const f = await fixture();
  try { await withBrowser(f, async () => {
    const uncommitted = await f.cache.open(`${f.manifest.cachePrefix}pack-${f.manifest.contentVersion}-interrupted`);
    await uncommitted.put(new URL('data/books/GEN.json', BASE).href, new Response(f.files['data/books/GEN.json']));
    const previous = await f.cache.open(`${f.manifest.cachePrefix}content-${'0'.repeat(24)}`);
    await previous.put(new URL('data/books/EXO.json', BASE).href, new Response(f.files['data/books/EXO.json']));
    assert.deepEqual(await inspectOfflineDownloads(BASE), []);
    const manifest = await getOfflineManifest(BASE);
    assert.equal(manifest.contentVersion, f.manifest.contentVersion);
  }); } finally { await f.close(); }
});

test('a worker stages changed downloaded books before user-controlled activation and preserves unrelated caches', async () => {
  const f = await fixture();
  try {
    const legacy = await f.cache.open('adigun-bible-content-v1');
    await legacy.put(new URL('data/books/GEN.json', BASE).href, new Response(book('GEN', 'Old source content.')));
    const unrelated = await f.cache.open('another-application-cache');
    await unrelated.put('https://example.test/unrelated', new Response('unchanged'));
    const sw = await worker(f);
    await sw.lifecycle('install');
    assert.equal(sw.waitingRequests, 0);
    assert.ok((await f.cache.keys()).includes('adigun-bible-content-v1'));
    assert.equal(await (await legacy.match(new URL('data/books/GEN.json', BASE).href)).text(), book('GEN', 'Old source content.'));
    sw.message({ type: 'ACTIVATE_UPDATE' });
    assert.equal(sw.waitingRequests, 1);
    await sw.lifecycle('activate');
    assert.equal(sw.claimed, 1);
    assert.ok(!(await f.cache.keys()).includes('adigun-bible-content-v1'));
    f.failures.set('data/books/GEN.json', new Error('Offline'));
    f.failures.set('data/manifest.json', new Error('Offline'));
    f.failures.set('offline-manifest.json', new Error('Offline'));
    assert.equal(await (await sw.request('data/books/GEN.json')).text(), f.files['data/books/GEN.json']);
    assert.equal(await (await sw.request('data/manifest.json')).text(), f.files['data/manifest.json']);
    assert.equal((await (await sw.request('offline-manifest.json')).json()).contentVersion, f.manifest.contentVersion);
    assert.equal(await (await unrelated.match('https://example.test/unrelated')).text(), 'unchanged');
    assert.equal(await sw.request('api/private-notes'), undefined);
    assert.equal(await sw.request('data/books/GEN.json?private=value'), undefined);
    assert.equal(await sw.request('https://other.test/data/books/GEN.json'), undefined);
    assert.equal(await sw.request('data/books/GEN.json', { method: 'POST' }), undefined);
  } finally { await f.close(); }
});

test('a failed worker upgrade leaves the original downloaded edition intact and can retry safely', async () => {
  const f = await fixture();
  try {
    const legacy = await f.cache.open('adigun-bible-content-v1');
    await legacy.put(new URL('data/books/GEN.json', BASE).href, new Response(book('GEN', 'Previous working edition.')));
    f.failures.set('data/books/GEN.json', { status: 503 });
    const sw = await worker(f);
    await assert.rejects(() => sw.lifecycle('install'), /Unavailable source/);
    assert.deepEqual(await f.cache.keys(), ['adigun-bible-content-v1']);
    assert.equal(await (await legacy.match(new URL('data/books/GEN.json', BASE).href)).text(), book('GEN', 'Previous working edition.'));
    f.failures.clear();
    await sw.lifecycle('install');
    assert.equal(sw.waitingRequests, 0);
    assert.equal(await (await sw.request('data/books/GEN.json')).text(), f.files['data/books/GEN.json']);
  } finally { await f.close(); }
});

test('explicit staged fetches do not leak partial downloads, and a controlled shell stays coherent until update', async () => {
  const f = await fixture();
  try { await withBrowser(f, async () => {
    const sw = await worker(f);
    await sw.lifecycle('install');
    await sw.lifecycle('activate');
    const direct = await sw.request('data/books/GEN.json', { cache: 'no-store' });
    assert.equal(await direct.text(), f.files['data/books/GEN.json']);
    assert.ok(!(await inspectOfflineDownloads(BASE)).includes('data/books/GEN.json'));
    await sw.request('data/books/GEN.json');
    assert.ok((await inspectOfflineDownloads(BASE)).includes('data/books/GEN.json'));
    await writeFile(join(f.root, 'dist/index.html'), '<html>Next deployment</html>');
    assert.equal(await (await sw.request('')).text(), f.files['index.html']);
    f.failures.set('data/books/EXO.json', { status: 200, text: book('EXO', 'An unverified newer edition.') });
    assert.equal((await sw.request('data/books/EXO.json')).status, 503);
    assert.ok(!(await inspectOfflineDownloads(BASE)).includes('data/books/EXO.json'));
  }); } finally { await f.close(); }
});

test('first installation retains permission metadata offline after source downloads are removed', async () => {
  const f = await fixture();
  try { await withBrowser(f, async () => {
    const sw = await worker(f);
    await sw.lifecycle('install');
    await sw.lifecycle('activate');
    f.failures.set('data/editions/rights-register.json', new Error('Offline'));
    assert.equal(await (await sw.request('data/editions/rights-register.json')).text(), f.files['data/editions/rights-register.json']);
    await removeOfflineDownloads(BASE);
    assert.equal(await (await sw.request('data/editions/rights-register.json')).text(), f.files['data/editions/rights-register.json']);
  }); } finally { await f.close(); }
});

test('offline source validation stops an oversized stream at the pinned cap and preserves the previous complete pack', async () => {
  const f = await fixture();
  try { await withBrowser(f, async () => {
    await downloadOfflineFiles(BASE, ['data/books/GEN.json'], { packId: 'existing' });
    const before = await f.cache.keys(), fetcher = globalThis.fetch, cap = f.manifest.files['data/books/EXO.json'].bytes;
    let chunks = 0, cancelled = false, sourceResponse;
    globalThis.fetch = async (input, options) => key(input).endsWith('/data/books/EXO.json') ? (sourceResponse = new Response(new ReadableStream({
      pull(controller) { chunks++; controller.enqueue(new Uint8Array(cap + 1)); }, cancel() { cancelled = true; },
    }), { headers: { 'content-length': '1' } })) : fetcher(input, options);
    await assert.rejects(downloadOfflineFiles(BASE, ['data/books/EXO.json'], { packId: 'new' }), /byte limit/);
    assert.equal(cancelled, true); assert.ok(chunks <= 2, `read ${chunks} oversized chunks`); assert.equal(sourceResponse.body.locked, false);
    assert.deepEqual(await f.cache.keys(), before);
    const committed = await f.cache.open(before[0]);
    assert.equal(await (await committed.match(new URL('data/books/GEN.json', BASE))).text(), f.files['data/books/GEN.json']);
  }); } finally { await f.close(); }
});

test('cancelling an offline source body or metadata read stops the stream and removes only its staging pack', async () => {
  const f = await fixture();
  try { await withBrowser(f, async () => {
    await downloadOfflineFiles(BASE, ['data/books/GEN.json'], { packId: 'existing' });
    const before = await f.cache.keys(), fetcher = globalThis.fetch;
    for (const target of ['data/books/EXO.json', 'offline-manifest.json']) {
      const controller = new AbortController(); let started, cancelled = false, sourceResponse;
      const reading = new Promise(resolve => { started = resolve; });
      globalThis.fetch = async (input, options) => key(input).endsWith('/' + target) ? (sourceResponse = new Response(new ReadableStream({
        pull() { started(); }, cancel() { cancelled = true; },
      }))) : fetcher(input, options);
      const pending = downloadOfflineFiles(BASE, ['data/books/EXO.json'], { packId: 'new', signal: controller.signal });
      const rejected = assert.rejects(pending, { name: 'AbortError' });
      await reading; controller.abort(); await rejected;
      assert.equal(cancelled, true); assert.equal(sourceResponse.body.locked, false); assert.deepEqual(await f.cache.keys(), before);
    }
  }); } finally { await f.close(); }
});

test('service-worker source validation stops oversized streams early and returns intact verified bodies on success', async () => {
  const f = await fixture();
  try {
    const fetcher = f.fetch, cap = f.manifest.files['data/books/EXO.json'].bytes;
    let chunks = 0, cancelled = false, sourceResponse;
    f.fetch = async (input, options) => key(input).endsWith('/data/books/EXO.json') ? (sourceResponse = new Response(new ReadableStream({
      pull(controller) { chunks++; controller.enqueue(new Uint8Array(cap + 1)); }, cancel() { cancelled = true; },
    }), { headers: { 'content-length': '1' } })) : fetcher(input, options);
    const sw = await worker(f);
    assert.equal((await sw.request('data/books/EXO.json', { cache: 'no-store' })).status, 503);
    assert.equal(cancelled, true); assert.ok(chunks <= 2, `read ${chunks} oversized chunks`); assert.equal(sourceResponse.body.locked, false);
    const response = await sw.request('data/books/GEN.json', { cache: 'no-store' });
    assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'application/json');
    assert.equal(await response.text(), f.files['data/books/GEN.json']);
  } finally { await f.close(); }
});

test('service-worker validation follows request cancellation and enforces its independent 64 MiB ceiling', async () => {
  const f = await fixture();
  try {
    const fetcher = f.fetch, controller = new AbortController(); let started, cancelled = false, sourceResponse, observedSignal;
    const reading = new Promise(resolve => { started = resolve; });
    f.fetch = async (input, options) => {
      if (!key(input).endsWith('/data/books/EXO.json')) return fetcher(input, options);
      observedSignal = options.signal;
      return sourceResponse = new Response(new ReadableStream({ pull() { started(); }, cancel() { cancelled = true; } }));
    };
    const sw = await worker(f), pending = sw.request('data/books/EXO.json', { cache: 'no-store', signal: controller.signal });
    await reading; controller.abort(); assert.equal((await pending).status, 503);
    assert.equal(observedSignal.aborted, true); assert.equal(cancelled, true); assert.equal(sourceResponse.body.locked, false);
    const invalid = structuredClone(f.manifest); invalid.files['data/books/EXO.json'].bytes = 64 * 1024 * 1024 + 1; cancelled = false;
    const bounded = await worker(f, createServiceWorkerSource(invalid, {}));
    assert.equal((await bounded.request('data/books/EXO.json', { cache: 'no-store' })).status, 503); assert.equal(cancelled, true);
  } finally { await f.close(); }
});

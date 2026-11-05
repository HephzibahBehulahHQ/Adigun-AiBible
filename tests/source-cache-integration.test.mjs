import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { SOURCE_BOOK_CACHE_LIMIT } from '../src/source-cache.ts';
import { defaultSearchOptions, searchRows } from '../src/search-query.ts';

const root = new URL('../', import.meta.url);
const json = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
let importId = 0;
const permissionModule = moduleUrl('export async function requirePermission(edition, operation) { return globalThis.__sourceCacheHarness.permission(edition, operation); }');
function deferred() { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; }

// Execute the production module bodies. Only network/permission imports are adapted;
// TypeScript removes types without copying loader or worker logic into this test.
async function productionModule(path, replacements) {
  let source = await readFile(new URL(path, root), 'utf8');
  for (const [before, after] of replacements) { assert.ok(source.includes(before), `Missing test adapter: ${before}`); source = source.replace(before, after); }
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return import(`${moduleUrl(output)}#${++importId}`);
}
function harnessFor(t) {
  const previous = { fetch: globalThis.fetch, self: globalThis.self, harness: globalThis.__sourceCacheHarness };
  const harness = { permission: async () => {}, calls: new Map() };
  globalThis.__sourceCacheHarness = harness;
  t.after(() => { globalThis.fetch = previous.fetch; globalThis.self = previous.self; globalThis.__sourceCacheHarness = previous.harness; });
  return harness;
}
async function dataModule(t) {
  const harness = harnessFor(t);
  globalThis.fetch = async address => {
    const path = String(address).replace(/^\/Adigun-AiBible\//, '');
    harness.calls.set(path, (harness.calls.get(path) || 0) + 1);
    return Response.json(await json(path));
  };
  const source = await productionModule('src/data.ts', [
    ["from '../data/editions/catalog.json'", `from '${new URL('data/editions/catalog.json', root).href}' with { type: 'json' }`],
    ["from './permissions'", `from '${permissionModule}'`],
    ["from './source-cache.ts'", `from '${new URL('src/source-cache.ts', root).href}'`],
    ["from './source-codec.ts'", `from '${new URL('src/source-codec.ts', root).href}'`],
  ]);
  return { source, harness };
}

test('production book loading retains exact source results through cache churn and shares requests', async t => {
  const { source, harness } = await dataModule(t);
  const manifest = await source.getManifest(), books = manifest.books.slice(0, SOURCE_BOOK_CACHE_LIMIT + 1);
  const first = source.getBook(books[0].id);
  assert.equal(source.getBook(books[0].id), first);
  const original = await first;
  for (const book of books.slice(1, SOURCE_BOOK_CACHE_LIMIT)) await source.getBook(book.id);
  assert.equal(await source.getBook(books[0].id), original, 'access refreshes the oldest book');
  await source.getBook(books[SOURCE_BOOK_CACHE_LIMIT].id);
  assert.equal(await source.getBook(books[0].id), original);
  const reloaded = await source.getBook(books[1].id), path = `data/books/${books[1].id}.json`;
  assert.equal(harness.calls.get(path), 2, 'least-recently-used book was actually fetched again');
  assert.deepEqual(reloaded, await json(path), 'cache eviction cannot alter source text');
  assert.equal(harness.calls.get('data/manifest.json'), 1);
});

test('production source permission failures remain closed and failed loads can be retried', async t => {
  const { source, harness } = await dataModule(t);
  harness.permission = async (_edition, operation) => { assert.equal(operation, 'display'); throw new Error('display denied'); };
  await assert.rejects(source.getBook('GEN'), /display denied/);
  assert.equal(harness.calls.has('data/books/GEN.json'), false);
  harness.permission = async () => {};
  assert.deepEqual(await source.getBook('GEN'), await json('data/books/GEN.json'));
  await assert.rejects(source.getBook('../GEN'), /Invalid book/);
  await assert.rejects(source.getBook('GEN', 'not-installed'), /not installed/);
});

async function workerModule(t) {
  const harness = harnessFor(t), editions = ['eng-web', 'deu1912', 'yor'];
  harness.manifests = {}; harness.rows = {}; harness.replies = []; harness.waiting = new Map();
  harness.beforeFetch = async () => {}; harness.invalid = false; harness.active = 0; harness.maxActive = 0;
  for (const edition of editions) {
    const base = edition === 'eng-web' ? 'data' : `data/editions/${edition}`;
    harness.manifests[edition] = await json(`${base}/manifest.json`);
    const book = await json(`${base}/books/GEN.json`);
    harness.rows[edition] = book.chapters.flatMap(chapter => chapter.verses.map(verse => ({ bookId: book.id, chapter: chapter.number, verse: verse.number, text: verse.text }))).slice(0, 200);
  }
  globalThis.fetch = async address => {
    const edition = String(address).match(/editions\/([^/]+)\//)?.[1] || 'eng-web';
    harness.calls.set(edition, (harness.calls.get(edition) || 0) + 1);
    harness.active++; harness.maxActive = Math.max(harness.maxActive, harness.active);
    try { await harness.beforeFetch(edition); return Response.json(harness.invalid ? [{ bookId: 'GEN', text: 42 }] : harness.rows[edition]); }
    finally { harness.active--; }
  };
  globalThis.self = { postMessage(reply) { harness.replies.push(reply); harness.waiting.get(reply.id)?.(reply); harness.waiting.delete(reply.id); } };
  const data = moduleUrl(`export const bibleEditionIds = ${JSON.stringify(editions)}; export async function getManifest(id) { return globalThis.__sourceCacheHarness.manifests[id]; }`);
  await productionModule('src/search.worker.ts', [
    ["from './data'", `from '${data}'`],
    ["from './permissions'", `from '${permissionModule}'`],
    ["from './search-query'", `from '${new URL('src/search-query.ts', root).href}'`],
    ["from './source-cache.ts'", `from '${new URL('src/source-cache.ts', root).href}'`],
    ["from './source-codec.ts'", `from '${new URL('src/source-codec.ts', root).href}'`],
  ]);
  harness.request = (id, editionId = 'eng-web', extra = {}) => new Promise(resolve => {
    harness.waiting.set(id, resolve);
    self.onmessage({ data: { id, editionId, query: 'a', bookId: '', base: '/app/', ...extra } });
  });
  harness.expected = edition => searchRows(harness.rows[edition], 'a', defaultSearchOptions, harness.manifests[edition].books.map(book => book.id)).map(row => ({ ...row, editionId: edition }));
  return harness;
}

test('production worker evicts old indexes without changing results or skipping per-request permission checks', async t => {
  const harness = await workerModule(t), permissions = [];
  harness.permission = async (edition, operation) => { permissions.push([edition.id, operation]); };
  const editions = ['eng-web', 'deu1912', 'eng-web', 'yor', 'eng-web', 'deu1912'];
  for (const [index, edition] of editions.entries()) {
    const response = await harness.request(index, edition), expected = harness.expected(edition);
    assert.deepEqual(response, { id: index, results: expected.slice(0, 100), total: expected.length });
  }
  assert.deepEqual(Object.fromEntries(harness.calls), { 'eng-web': 1, deu1912: 2, yor: 1 });
  assert.deepEqual(permissions, editions.map(id => [id, 'searchIndex']));
  harness.permission = async () => { throw new Error('search denied'); };
  assert.match((await harness.request(7, 'deu1912')).error, /search denied/);
  assert.equal(harness.calls.get('deu1912'), 2, 'cached data cannot bypass an operation denial');
});

test('production worker answers superseded IDs explicitly and loads only active and latest searches', async t => {
  const harness = await workerModule(t), entered = deferred(), gate = deferred();
  harness.beforeFetch = async edition => { if (edition === 'eng-web') { entered.resolve(); await gate.promise; } };
  const first = harness.request(1, 'eng-web');
  await entered.promise;
  const obsolete = harness.request(2, 'deu1912'), latest = harness.request(3, 'yor');
  assert.deepEqual(await obsolete, { id: 2, error: 'This search was superseded by a newer request.', superseded: true });
  assert.equal(harness.calls.has('deu1912'), false);
  assert.equal(harness.calls.has('yor'), false, 'latest waits only for the active load');
  gate.resolve();
  assert.equal((await first).id, 1);
  const response = await latest, expected = harness.expected('yor');
  assert.deepEqual(response, { id: 3, results: expected.slice(0, 100), total: expected.length });
  assert.equal(harness.maxActive, 1);
  assert.deepEqual(harness.replies.map(reply => reply.id).sort(), [1, 2, 3]);
});

test('production worker retries invalid indexes and separates asset base and source revision cache keys', async t => {
  const harness = await workerModule(t);
  harness.invalid = true;
  assert.match((await harness.request(1)).error, /failed validation/);
  harness.invalid = false;
  assert.equal((await harness.request(2)).error, undefined);
  await harness.request(3, 'eng-web', { base: '/other/' });
  harness.manifests['eng-web'].edition.sha256 = 'a'.repeat(64);
  await harness.request(4, 'eng-web', { base: '/other/' });
  assert.equal(harness.calls.get('eng-web'), 4);
});

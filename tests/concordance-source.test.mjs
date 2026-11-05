import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ConcordanceSourceLoader, readConcordanceBytes } from '../src/concordance/source.ts';
import { createConcordanceEngine } from '../src/concordance/engine.ts';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');

test('source streams without length headers are cancelled before retaining bytes beyond the pinned limit', async () => {
  let cancelled = false, chunks = 0;
  const stream = new ReadableStream({ pull(controller) { chunks++; controller.enqueue(new Uint8Array(60)); }, cancel() { cancelled = true; } });
  await assert.rejects(readConcordanceBytes(new Response(stream), { bytes: 100, sha256: 'a'.repeat(64) }), /size changed|limit/);
  assert.equal(cancelled, true); assert.ok(chunks < 5);
  let declaredCancelled = false;
  const declared = new Response(new ReadableStream({ cancel() { declaredCancelled = true; } }), { headers: { 'content-length': '101' } });
  await assert.rejects(readConcordanceBytes(declared, { bytes: 100, sha256: 'a'.repeat(64) }), /verified file size/);
  assert.equal(declaredCancelled, true);
});

test('aborting a pending source stream cancels its reader and produces no completed bytes', async () => {
  const controller = new AbortController(); let cancelled = false, started;
  const reading = new Promise(resolve => { started = resolve; });
  const response = new Response(new ReadableStream({ pull() { started(); }, cancel() { cancelled = true; } }));
  const result = readConcordanceBytes(response, { bytes: 100, sha256: 'a'.repeat(64) }, controller.signal);
  await reading; controller.abort();
  await assert.rejects(result, { name: 'AbortError' }); assert.equal(cancelled, true);
});

test('oversized cloned source headers reject promptly without waiting for the original branch', async () => {
  const original = new Response(new ReadableStream({ start() {} }), { headers: { 'content-length': '101' } });
  const clone = original.clone(), reading = readConcordanceBytes(clone, { bytes: 100, sha256: 'a'.repeat(64) }); let timer;
  const settled = reading.then(() => ({ kind: 'resolved' }), error => ({ kind: 'rejected', error }));
  try {
    const result = await Promise.race([settled, new Promise(resolve => { timer = setTimeout(() => resolve({ kind: 'timeout' }), 1000); })]);
    assert.equal(result.kind, 'rejected', 'a size failure must not await an unread cloned-response sibling');
    assert.match(result.error.message, /verified file size/); assert.equal(clone.body.locked, false);
  } finally { clearTimeout(timer); void original.body.cancel().catch(() => undefined); await settled; }
});
function setup() {
  const manifest = { schemaVersion: 1, edition: { id: 'eng-web', name: 'Test source', language: 'en', sha256: 'a'.repeat(64) }, books: [{ id: 'GEN', name: 'Genesis', chapters: 1, verseCounts: [2] }], totals: { books: 1, chapters: 1, verses: 2 } };
  const rows = [{ bookId: 'GEN', chapter: 1, verse: 1, text: 'Love love.' }, { bookId: 'GEN', chapter: 1, verse: 2, text: 'Peace.' }];
  const files = { 'data/manifest.json': Buffer.from(JSON.stringify(manifest)), 'data/search-index.json': Buffer.from(JSON.stringify(rows)) };
  const inventory = { basePath: '/app/', contentVersion: 'c'.repeat(24), files: Object.fromEntries(Object.entries(files).map(([path, bytes]) => [path, { sha256: sha(bytes), bytes: bytes.length }])) };
  const calls = [], permissions = [];
  const services = { installedBibleIds: ['eng-web'], getInventory: async () => inventory, fetch: async url => { const path = url.pathname.slice('/app/'.length); calls.push(path); return new Response(files[path], { status: files[path] ? 200 : 404 }); }, requirePermission: async (edition, operation) => { permissions.push([edition.sha256, operation]); } };
  return { manifest, rows, files, inventory, calls, permissions, services };
}

test('verified loader binds counts to file hashes, edition revision and complete records; cache rechecks rights', async () => {
  const f = setup(), loader = new ConcordanceSourceLoader(f.services);
  const source = await loader.load('eng-web', 'https://example.test/app/');
  assert.equal(source.indexSha256, f.inventory.files['data/search-index.json'].sha256); assert.deepEqual(source.rows, f.rows);
  assert.equal(await loader.load('eng-web', 'https://example.test/app/'), source);
  assert.equal(f.calls.length, 2); assert.equal(f.permissions.length, 4);
  f.services.requirePermission = async () => { throw new Error('Permission withdrawn'); };
  await assert.rejects(loader.load('eng-web', 'https://example.test/app/'), /withdrawn/);
});

test('missing metadata, absent index, changed bytes and incomplete pinned content never produce zero', async () => {
  {
    const f = setup(); delete f.inventory.files['data/search-index.json'];
    await assert.rejects(new ConcordanceSourceLoader(f.services).load('eng-web', 'https://example.test/app/'), /absent/);
  }
  {
    const f = setup(); delete f.files['data/search-index.json'];
    await assert.rejects(new ConcordanceSourceLoader(f.services).load('eng-web', 'https://example.test/app/'), /unavailable/);
  }
  {
    const f = setup(); f.files['data/search-index.json'] = Buffer.from(f.files['data/search-index.json'].toString().replace('Love', 'Hate'));
    await assert.rejects(new ConcordanceSourceLoader(f.services).load('eng-web', 'https://example.test/app/'), /checksum/);
  }
  {
    const f = setup(); const incomplete = Buffer.from(JSON.stringify(f.rows.slice(1))); f.files['data/search-index.json'] = incomplete;
    f.inventory.files['data/search-index.json'] = { bytes: incomplete.length, sha256: sha(incomplete) };
    await assert.rejects(new ConcordanceSourceLoader(f.services).load('eng-web', 'https://example.test/app/'), /incomplete/);
  }
});

test('rights denial occurs before index loading and new revisions require fresh verification', async () => {
  const denied = setup(); denied.services.requirePermission = async (_edition, operation) => { if (operation === 'searchIndex') throw new Error('Search indexing denied'); };
  await assert.rejects(new ConcordanceSourceLoader(denied.services).load('eng-web', 'https://example.test/app/'), /denied/);
  assert.deepEqual(denied.calls, ['data/manifest.json']);
  const f = setup(), loader = new ConcordanceSourceLoader(f.services);
  const original = await loader.load('eng-web', 'https://example.test/app/');
  f.manifest.edition.sha256 = 'd'.repeat(64); f.files['data/manifest.json'] = Buffer.from(JSON.stringify(f.manifest));
  f.inventory.files['data/manifest.json'] = { bytes: f.files['data/manifest.json'].length, sha256: sha(f.files['data/manifest.json']) };
  const next = await loader.load('eng-web', 'https://example.test/app/');
  assert.notEqual(next, original); assert.equal(next.manifest.edition.sha256, 'd'.repeat(64));
  assert.equal(f.calls.length, 4);
});

test('uninstalled/Quran editions, wrong application inventory and aborted loads fail closed', async () => {
  const f = setup(), loader = new ConcordanceSourceLoader(f.services);
  await assert.rejects(loader.load('eng-clearquran', 'https://example.test/app/'), /separate workspace/);
  await assert.rejects(loader.load('eng-web', 'https://example.test/other/'), /another application/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(loader.load('eng-web', 'https://example.test/app/', controller.signal), { name: 'AbortError' });
  assert.equal(f.calls.length, 0);
});

const query = text => ({ text, mode: 'word', caseSensitive: false, bookId: '', testament: '' });
const request = (id, text = 'love') => ({ type: 'search', id, query: query(text), editionId: 'eng-web', baseUrl: 'https://example.test/app/', page: 0 });
function deferred() { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; }

test('engine suppresses stale source responses and only returns the latest complete request', async () => {
  const f = setup(), source = await new ConcordanceSourceLoader(f.services).load('eng-web', 'https://example.test/app/');
  const old = deferred(), responses = []; let calls = 0;
  const handle = createConcordanceEngine({ loadSource: () => ++calls === 1 ? old.promise : Promise.resolve(source), post: message => responses.push(message), yieldControl: async () => {} });
  const first = handle(request(1)); await handle(request(2, 'peace')); old.resolve(source); await first;
  const results = responses.filter(message => message.type === 'result');
  assert.deepEqual(results.map(message => message.id), [2]); assert.equal(results[0].result.occurrences, 1);
});

test('engine cancellation and failures never announce a partial result or fabricated zero', async () => {
  const pending = deferred(), responses = [];
  const handle = createConcordanceEngine({ loadSource: () => pending.promise, post: message => responses.push(message), yieldControl: async () => {} });
  const work = handle(request(1)); await handle({ type: 'cancel' }); pending.resolve({}); await work;
  assert.deepEqual(responses, []);
  const broken = createConcordanceEngine({ loadSource: async () => { throw new Error('Missing source inventory'); }, post: message => responses.push(message), yieldControl: async () => {} });
  await broken(request(3)); assert.equal(responses.length, 1); assert.equal(responses[0].type, 'error'); assert.match(responses[0].error, /Missing source/);
});

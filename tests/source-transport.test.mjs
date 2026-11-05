import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { packSourceJson, sourceTransportEnabled } from '../scripts/pack-source-json.mjs';
import { decodeSourceJsonBytes } from '../src/source-codec.ts';
import { finalizeBuild } from '../scripts/finalize-build.mjs';
import { getOfflineManifest, OFFLINE_INVENTORY_MAX_FILES, OFFLINE_METADATA_MAX_BYTES } from '../src/offline.ts';

test('packaging is opt-in, preserves URLs and untouched metadata, and never rewrites canonical Git sources', async t => {
  const root = await mkdtemp(join(tmpdir(), 'source-transport-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, 'public/data');
  const book = await readFile(new URL('../data/editions/yor/books/ACT.json', import.meta.url));
  const files = { 'books/ACT.json': book, 'editions/test/books/ACT.json': book, 'search-index.json': Buffer.from('[{"bookId":"ACT","text":"Àpẹẹrẹ ìdánwò"}]'), 'manifest.json': Buffer.from('{"schemaVersion":1}'), 'editions/test/NOTICE.txt': Buffer.from('Synthetic test notice') };
  for (const [name, bytes] of Object.entries(files)) { await mkdir(join(directory, name, '..'), { recursive: true }); await writeFile(join(directory, name), bytes); }
  assert.equal(sourceTransportEnabled(''), false);
  assert.equal(sourceTransportEnabled('off'), false);
  assert.equal(sourceTransportEnabled('gzip-base64-v1'), true);
  assert.throws(() => sourceTransportEnabled('maybe'), /must be off/);
  assert.equal((await packSourceJson({ directory, enabled: false })).files, 0);
  assert.deepEqual(await readFile(join(directory, 'books/ACT.json')), book);
  const summary = await packSourceJson({ directory, enabled: true });
  assert.equal(summary.files, 3);
  for (const name of ['books/ACT.json', 'editions/test/books/ACT.json', 'search-index.json']) {
    const packed = await readFile(join(directory, name));
    assert.equal(JSON.parse(packed).kind, 'adigun.source-envelope');
    assert.deepEqual(await decodeSourceJsonBytes(packed), JSON.parse(files[name]));
  }
  for (const name of ['manifest.json', 'editions/test/NOTICE.txt']) assert.deepEqual(await readFile(join(directory, name)), files[name]);
  assert.deepEqual(await readFile(new URL('../data/editions/yor/books/ACT.json', import.meta.url)), book);
  await assert.rejects(packSourceJson({ directory: new URL('../data/', import.meta.url).pathname, enabled: true }), /Refusing to package canonical/);
});

function inventory(count) {
  const basePath = '/Adigun-AiBible/';
  return { schemaVersion: 1, appId: 'adigun-aibible', basePath, cachePrefix: `adigun-bible-${createHash('sha256').update(basePath).digest('hex').slice(0, 12)}-`, contentVersion: 'a'.repeat(24), buildVersion: 'b'.repeat(24), files: Object.fromEntries(Array.from({ length: count }, (_, index) => [`data/source-${index}.json`, { sha256: 'c'.repeat(64), bytes: 2 }])) };
}

test('offline inventory admits the bounded expansion and rejects excessive counts or unsafe entries', async t => {
  const previous = globalThis.fetch;
  t.after(() => { globalThis.fetch = previous; });
  let value = inventory(OFFLINE_INVENTORY_MAX_FILES);
  globalThis.fetch = async () => Response.json(value);
  assert.equal(Object.keys((await getOfflineManifest('https://example.test/Adigun-AiBible/')).files).length, OFFLINE_INVENTORY_MAX_FILES);
  value = inventory(OFFLINE_INVENTORY_MAX_FILES + 1);
  await assert.rejects(getOfflineManifest('https://example.test/Adigun-AiBible/'), /inventory is invalid/);
  for (const files of [{ '../escape.json': { sha256: 'c'.repeat(64), bytes: 2 } }, { 'data/book.json': { sha256: 'bad', bytes: 2 } }, { 'data/book.json': { sha256: 'c'.repeat(64), bytes: 64 * 1024 * 1024 + 1 } }]) {
    value = { ...inventory(1), files };
    await assert.rejects(getOfflineManifest('https://example.test/Adigun-AiBible/'), /inventory is invalid/);
  }
});

test('offline metadata is limited before JSON parsing even with a dishonest content length', async t => {
  const previous = globalThis.fetch;
  t.after(() => { globalThis.fetch = previous; });
  let cancelled = false;
  globalThis.fetch = async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(OFFLINE_METADATA_MAX_BYTES + 1)); }, cancel() { cancelled = true; } }), { headers: { 'Content-Length': '1' } });
  await assert.rejects(getOfflineManifest('https://example.test/Adigun-AiBible/'), /byte limit/);
  assert.equal(cancelled, true);
});

test('raw-to-envelope builds keep logical inventory paths and canonical bytes while versioning transferred hashes', async t => {
  const root = await mkdtemp(join(tmpdir(), 'source-transport-release-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const original = await readFile(new URL('../data/books/ACT.json', import.meta.url));
  for (const [name, bytes] of Object.entries({ 'index.html': '<title>Transport test</title>', 'manifest.webmanifest': '{}', 'assets/app.js': '/* test fixture */', 'data/manifest.json': '{"schemaVersion":1}', 'data/books/ACT.json': original })) {
    await mkdir(join(root, 'dist', name, '..'), { recursive: true }); await writeFile(join(root, 'dist', name), bytes);
  }
  const first = await finalizeBuild({ root, sourceCommit: 'transport-test' });
  await packSourceJson({ directory: join(root, 'dist/data'), enabled: true });
  const second = await finalizeBuild({ root, sourceCommit: 'transport-test' });
  assert.deepEqual(Object.keys(second.manifest.files), Object.keys(first.manifest.files));
  assert.notEqual(second.manifest.contentVersion, first.manifest.contentVersion);
  const path = 'data/books/ACT.json', bytes = await readFile(join(root, 'dist', path)), envelope = JSON.parse(bytes);
  assert.equal(envelope.decodedSha256, first.manifest.files[path].sha256);
  assert.deepEqual(second.manifest.files[path], { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  assert.deepEqual(await decodeSourceJsonBytes(bytes), JSON.parse(original));
});

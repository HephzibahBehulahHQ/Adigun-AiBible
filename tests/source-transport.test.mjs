import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm, cp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { packSourceJson, sourceTransportEnabled, verifySourceJsonTransport, copySourceContent, createSourceStagingDirectory } from '../scripts/pack-source-json.mjs';
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

test('unfinished source preparation remains outside assets copied from public', async t => {
  const root = await mkdtemp(join(tmpdir(), 'source-private-staging-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, 'public'); await mkdir(directory);
  await writeFile(join(directory, 'index.html'), '<title>Existing published shell</title>');
  const staged = await createSourceStagingDirectory(directory);
  await mkdir(join(staged, 'books')); await writeFile(join(staged, 'books/GEN.json'), '{"testOnly":"unfinished source"}');
  // Model a stopped preparation: leave staging intact while copying public assets.
  await cp(directory, join(root, 'dist'), { recursive: true });
  assert.deepEqual(await readdir(join(root, 'dist')), ['index.html']);
  assert.equal(await readFile(join(staged, 'books/GEN.json'), 'utf8'), '{"testOnly":"unfinished source"}');
});

test('a pre-existing public staging directory blocks preparation without deleting another operation', async t => {
  const root = await mkdtemp(join(tmpdir(), 'source-existing-staging-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, 'public'), existing = join(directory, '.source-data-existing');
  await mkdir(existing, { recursive: true }); await writeFile(join(existing, 'owner.txt'), 'Retain until its owner confirms it is inactive.');
  await assert.rejects(createSourceStagingDirectory(directory), /Unpublished source staging/);
  assert.equal(await readFile(join(existing, 'owner.txt'), 'utf8'), 'Retain until its owner confirms it is inactive.');
});

test('finalization refuses a leaked staging tree instead of issuing a release receipt', async t => {
  const root = await mkdtemp(join(tmpdir(), 'source-staging-release-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [name, bytes] of Object.entries({ 'index.html': '<title>Test fixture</title>', 'manifest.webmanifest': '{}', 'assets/app.js': '/* test fixture */', 'data/manifest.json': '{}', '.source-data-leaked/partial.json': '{"testOnly":true}' })) {
    await mkdir(join(root, 'dist', name, '..'), { recursive: true }); await writeFile(join(root, 'dist', name), bytes);
  }
  await assert.rejects(finalizeBuild({ root, sourceCommit: 'test-only-revision' }), /Unpublished source staging/);
  await assert.rejects(readFile(join(root, 'dist/build-info.json')), /ENOENT/);
  await assert.rejects(readFile(join(root, 'dist/sw.js')), /ENOENT/);
});

test('final artifact verification rejects raw replacements, missing files and changed canonical content', async t => {
  const root = await mkdtemp(join(tmpdir(), 'source-final-artifact-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const canonicalDirectory = join(root, 'canonical'), directory = join(root, 'served');
  const source = await readFile(new URL('../data/editions/yor/books/JHN.json', import.meta.url));
  for (const target of [canonicalDirectory, directory]) { await mkdir(join(target, 'books'), { recursive: true }); await writeFile(join(target, 'books/JHN.json'), source); }
  await packSourceJson({ directory, enabled: true });
  const options = { canonicalDirectory, directory, enabled: true };
  assert.equal((await verifySourceJsonTransport(options)).files, 1);
  const encoded = await readFile(join(directory, 'books/JHN.json'));
  await writeFile(join(directory, 'books/JHN.json'), source);
  await assert.rejects(verifySourceJsonTransport(options), /not packaged/);
  await writeFile(join(directory, 'books/JHN.json'), encoded);
  await writeFile(join(canonicalDirectory, 'books/JHN.json'), Buffer.concat([source, Buffer.from('\n')]));
  await assert.rejects(verifySourceJsonTransport(options), /canonical bytes/);
  await writeFile(join(canonicalDirectory, 'books/JHN.json'), source);
  await rm(join(directory, 'books/JHN.json'));
  await assert.rejects(verifySourceJsonTransport(options), /ENOENT/);
});

test('fresh source staging writes each payload from canonical bytes and never accepts a reused destination', async t => {
  const root = await mkdtemp(join(tmpdir(), 'source-fresh-staging-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sourceDirectory = join(root, 'canonical'), directory = join(root, 'staged');
  await mkdir(join(sourceDirectory, 'books'), { recursive: true }); await mkdir(directory);
  const source = await readFile(new URL('../data/books/JHN.json', import.meta.url));
  await writeFile(join(sourceDirectory, 'books/JHN.json'), source);
  await writeFile(join(sourceDirectory, 'NOTICE.txt'), 'Exact test notice');
  await writeFile(join(sourceDirectory, 'upstream.xml'), '<excluded-test-source/>');
  const result = await copySourceContent({ sourceDirectory, directory, enabled: true });
  assert.equal(result.files, 1);
  assert.equal((await verifySourceJsonTransport({ directory, canonicalDirectory: sourceDirectory, enabled: true })).files, 1);
  assert.deepEqual(await readFile(join(sourceDirectory, 'books/JHN.json')), source);
  assert.equal(await readFile(join(directory, 'NOTICE.txt'), 'utf8'), 'Exact test notice');
  await assert.rejects(readFile(join(directory, 'upstream.xml')), /ENOENT/);
  await assert.rejects(copySourceContent({ sourceDirectory, directory, enabled: true }), /EEXIST/);
  await assert.rejects(copySourceContent({ sourceDirectory, directory: sourceDirectory, enabled: true }), /separate/);
});

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

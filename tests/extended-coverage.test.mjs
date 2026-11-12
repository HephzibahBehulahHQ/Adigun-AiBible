import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { catalogOnlyCount, currentCachedInventory, dictionaryInventory, matchedPublisherInventory, offlinePackDefinitions, publisherInventory, verifyOfflinePacks } from '../src/editorial-workbench/extended-inventory.ts';
import { validateEditionRightsRegister } from '../src/edition-rights.ts';

const read = async path => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));
const publishers = await read('data/speakers/publisher-coverage.json'), dictionaries = await read('data/linguistics/manifest.json');
const baseline = await read('data/manifest.json'), catalog = await read('data/editions/catalog.json'), historical = await read('data/historical/manifest.json');
const rights = validateEditionRightsRegister(await read('data/editions/rights-register.json'));
const manifests = await Promise.all(publishers.editions.map(row => row.editionId === 'eng-web' ? baseline : read(`data/editions/${row.editionId}/manifest.json`)));
const base = new URL('https://example.test/Adigun-AiBible/');
const file = value => ({ bytes: Buffer.byteLength(value), sha256: createHash('sha256').update(value).digest('hex') });
const manifest = files => ({ schemaVersion: 1, appId: 'adigun-aibible', basePath: base.pathname, cachePrefix: 'adigun-test-', contentVersion: 'current', buildVersion: 'build', files: Object.fromEntries(Object.entries(files).map(([path, value]) => [path, file(value)])) });
const pack = (id, paths, permission = 'allowed') => ({ id, title: id, paths, permission });
const url = input => input instanceof Request ? input.url : String(input);
class FakeCache {
  constructor(files = {}) { this.files = new Map(Object.entries(files).map(([path, value]) => [new URL(path, base).href, new Response(value)])); }
  async keys() { return [...this.files.keys()].map(value => new Request(value)); }
  async match(key) { return this.files.get(url(key))?.clone(); }
}
class FakeCaches {
  constructor(values) { this.values = values; this.opened = []; }
  async keys() { return Object.keys(this.values); }
  async open(name) { this.opened.push(name); return this.values[name]; }
}

test('publisher totals require exact edition revisions and do not infer coverage for missing manifests', () => {
  const rows = publisherInventory(publishers), matched = matchedPublisherInventory(rows, manifests);
  assert.ok(matched.every(row => row.matched));
  const vulgate = publishers.editions.find(row => row.editionId === 'lat-clementine1598');
  assert.equal(vulgate.marker, 'none'); assert.equal(vulgate.offsetUnit, 'not-applicable');
  assert.equal(vulgate.totalSpans, 0); assert.equal(vulgate.totalVerses, 0);
  const berean = matched.find(row => row.editionId === 'eng-bsb');
  assert.equal(berean.totalSpans, 2302); assert.equal(berean.totalVerses, 2047);
  assert.equal(matchedPublisherInventory(rows, []).every(row => row.sourceUnits === null && !row.matched), true);
  const changed = structuredClone(manifests); changed.find(row => row.edition.id === 'eng-bsb').edition.sha256 = 'a'.repeat(64);
  assert.equal(matchedPublisherInventory(rows, changed).find(row => row.editionId === 'eng-bsb').matched, false);
  const forged = structuredClone(publishers); forged.editions[0].totalSpans++;
  assert.throws(() => publisherInventory(forged), /totals/);
});

test('dictionary counts retain unused number records and reject duplicated or inconsistent totals', () => {
  const value = dictionaryInventory(dictionaries);
  assert.equal(value.totalRecords, 14298); assert.equal(value.dictionaries.reduce((sum, row) => sum + row.headwords, 0), 14197);
  assert.equal(value.dictionaries.find(row => row.id === 'hebrew').languageCounts.arc, 653);
  const changed = structuredClone(dictionaries); changed.dictionaries[0].languageCounts.grc--;
  assert.throws(() => dictionaryInventory(changed), /language counts/);
  assert.throws(() => dictionaryInventory({ ...dictionaries, dictionaries: [dictionaries.dictionaries[0], dictionaries.dictionaries[0]] }), /duplicated|inconsistent/);
  assert.throws(() => dictionaryInventory(null), /unavailable/);
});

test('an unavailable historical catalog is unknown, while an explicitly empty inventory is zero', () => {
  assert.equal(catalogOnlyCount(undefined), null); assert.equal(catalogOnlyCount([]), 0);
  assert.equal(catalogOnlyCount([{ id: 'one', title: 'One source' }]), 1);
  assert.throws(() => catalogOnlyCount([{ id: 'one', title: 'One' }, { id: 'one', title: 'Duplicate' }]), /duplicated/);
});

test('offline definitions retain source notices, search, permissions and missing-edition denominators', () => {
  const editions = [{ ...baseline.edition, corpus: 'bible' }, ...catalog.editions];
  const rows = offlinePackDefinitions(manifests, editions, historical, dictionaryInventory(dictionaries), rights);
  const bible = rows.find(row => row.id === 'bible-eng-bsb');
  assert.ok(bible.paths.includes('data/editions/eng-bsb/NOTICE.txt')); assert.ok(bible.paths.includes('data/editions/eng-bsb/search-index.json'));
  assert.ok(bible.paths.includes('data/editions/rights-register.json')); assert.equal(bible.permission, 'allowed');
  const missing = offlinePackDefinitions([], editions, null, null, null);
  assert.equal(missing.filter(row => row.id.startsWith('bible-')).length, editions.filter(row => row.corpus === 'bible').length);
  assert.ok(missing.filter(row => row.id.startsWith('bible-')).every(row => row.permission === 'unknown' && row.paths.length === 0));
  const withdrawn = structuredClone(rights); withdrawn.editions.find(row => row.editionId === 'eng-bsb').withdrawn = true;
  assert.equal(offlinePackDefinitions(manifests, editions, null, null, withdrawn).find(row => row.id === 'bible-eng-bsb').permission, 'denied');
  const changedLicense = structuredClone(dictionaries); changedLicense.dictionaries[0].license = 'Permission unknown';
  assert.equal(offlinePackDefinitions([], [], null, dictionaryInventory(changedLicense), rights).find(row => row.id === 'historical-lexicons').permission, 'unknown');
});

test('cache inspection excludes unpublished staging, old releases, foreign apps and unlisted pack members', async () => {
  const inventory = manifest({ 'data/source.json': '{}', 'data/notice.txt': 'notice', 'data/staged.txt': 'staged', 'data/foreign.txt': 'foreign' });
  const marker = JSON.stringify({ schemaVersion: 1, appId: 'adigun-aibible', basePath: base.pathname, contentVersion: 'current', paths: ['data/source.json'] });
  const storage = new FakeCaches({
    'adigun-test-content-current': new FakeCache({ 'data/notice.txt': 'notice', 'https://example.test/AnotherApp/data/source.json': 'foreign' }),
    'adigun-test-pack-current-committed': new FakeCache({ '__adigun_offline_pack__.json': marker, 'data/source.json': '{}', 'data/foreign.txt': 'foreign' }),
    'adigun-test-pack-current-staging': new FakeCache({ 'data/staged.txt': 'staged' }),
    'adigun-test-content-old': new FakeCache({ 'data/foreign.txt': 'foreign' }),
    'unrelated-app': new FakeCache({ 'data/foreign.txt': 'foreign' }),
  });
  const cached = await currentCachedInventory(storage, base, inventory);
  assert.deepEqual([...cached.paths].sort(), ['data/notice.txt', 'data/source.json']);
  assert.ok(!storage.opened.includes('unrelated-app')); assert.ok(!storage.opened.includes('adigun-test-content-old'));
  assert.equal(await (await cached.read('data/source.json')).text(), '{}');
});

test('only complete checksum-matching cache sets count; omitted notices, corruption and metadata gaps stay distinct', async () => {
  const files = { 'data/source.json': '{}', 'data/notice.txt': 'notice' }, inventory = manifest(files);
  const definition = pack('source', Object.keys(files));
  const cached = { paths: new Set(Object.keys(files)), read: async path => new Response(files[path]) };
  assert.equal((await verifyOfflinePacks([definition], inventory, cached))[0].status, 'complete');
  assert.equal((await verifyOfflinePacks([definition], inventory, { ...cached, paths: new Set(['data/source.json']) }))[0].status, 'partial');
  assert.equal((await verifyOfflinePacks([definition], inventory, { ...cached, paths: new Set() }))[0].status, 'missing');
  assert.equal((await verifyOfflinePacks([definition], inventory, { ...cached, read: async path => new Response(path.endsWith('.txt') ? 'tamper' : files[path]) }))[0].status, 'invalid');
  assert.equal((await verifyOfflinePacks([pack('unknown', ['data/absent.json'])], inventory, cached))[0].status, 'unknown');
});

test('denied and unknown permissions never inspect bytes or become complete', async () => {
  const inventory = manifest({ 'data/source.json': '{}' }); let read = 0;
  const cached = { paths: new Set(['data/source.json']), read: async () => { read++; return new Response('{}'); } };
  const rows = await verifyOfflinePacks([pack('denied', ['data/source.json'], 'denied'), pack('unknown', ['data/source.json'], 'unknown')], inventory, cached);
  assert.deepEqual(rows.map(row => row.status), ['blocked', 'unknown']); assert.equal(read, 0);
});

test('duplicate requirements cannot inflate a pack denominator and shared source bytes are checked once', async () => {
  const inventory = manifest({ 'data/source.json': '{}' }); let read = 0;
  const cached = { paths: new Set(['data/source.json']), read: async () => { read++; return new Response('{}'); } };
  const rows = await verifyOfflinePacks([pack('one', ['data/source.json', 'data/source.json']), pack('two', ['data/source.json'])], inventory, cached);
  assert.ok(rows.every(row => row.required === 1 && row.status === 'complete')); assert.equal(read, 1);
});

test('cancellation aborts inspection instead of reporting a misleading zero', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(verifyOfflinePacks([pack('one', ['data/source.json'])], manifest({ 'data/source.json': '{}' }), { paths: new Set(), read: async () => undefined }, controller.signal), /cancelled/);
});

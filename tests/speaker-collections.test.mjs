import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hashSourceText } from '../src/editorial.ts';
import { publisherSpeeches } from '../src/speakers/model.ts';
import { MAX_SPEECH_COLLECTION_BACKUP_BYTES, emptySpeechCollections, validateSpeechPin, validateSpeechCollection, validateSpeechCollections, speechCollectionsBackup, parseSpeechCollectionsBackup, previewSpeechCollectionsImport, mergeSpeechCollections, moveSpeechEntry } from '../src/speakers/collection-model.ts';
import { pinPublisherSpeech, loadPinnedSpeech, loadPinnedSpeeches, checkSpeechCollectionSources } from '../src/speakers/collection-source.ts';

const json = path => JSON.parse(readFileSync(new URL(`../data/${path}`, import.meta.url), 'utf8'));
const manifest = json('editions/eng-bsb/manifest.json'), john = json('editions/eng-bsb/books/JHN.json');
const speech = publisherSpeeches(john, manifest.edition).speeches.find(row => row.reference.chapter === 3 && row.reference.verse === 3);
const nextSpeech = publisherSpeeches(john, manifest.edition).speeches.find(row => row.reference.chapter === 3 && row.reference.verse === 5);
const dependencies = {
  getManifest: async id => { assert.equal(id, 'eng-bsb'); return structuredClone(manifest); },
  getBook: async (id, editionId) => { assert.equal(editionId, 'eng-bsb'); return id === 'JHN' ? structuredClone(john) : json(`editions/eng-bsb/books/${id}.json`); },
  requirePermission: async () => {},
};
const pin = await pinPublisherSpeech(speech, dependencies), secondPin = await pinPublisherSpeech(nextSpeech, dependencies);
const date = '2026-11-05T18:30:00.000Z';
const collection = (id = 'test-collection', title = 'Private speech study') => ({ id, title, entries: [structuredClone(pin), structuredClone(secondPin)], createdAt: date, updatedAt: date });
const state = () => ({ ...emptySpeechCollections(), revision: 7, collections: [collection()] });
const backupWith = workspace => JSON.stringify({ kind: 'adigun-speech-collections', version: 1, workspace });

test('speech collections preserve exact source pins and order without copying Scripture or review approval', async () => {
  const original = state(), checked = validateSpeechCollections(original);
  assert.deepEqual(checked, original);
  assert.notEqual(checked.collections[0].entries[0], original.collections[0].entries[0]);
  const backup = speechCollectionsBackup(original), restored = parseSpeechCollectionsBackup(backup);
  assert.deepEqual(restored, { ...original, revision: 0 });
  assert.ok(!backup.includes(speech.text)); assert.ok(!backup.includes(speech.fullVerse));
  for (const forbidden of ['fullVerse', 'text', 'review', 'speakerId', 'approved']) assert.equal(Object.hasOwn(restored.collections[0].entries[0], forbidden), false);
  assert.equal(pin.sourceTextHash, await hashSourceText(speech.fullVerse));
  assert.equal(pin.editionSha256, manifest.edition.sha256);
  assert.equal(pin.sourceUrl, manifest.edition.sourceUrl);
  assert.equal((await loadPinnedSpeech(pin, dependencies)).text, speech.text);
  const empty = validateSpeechCollection({ ...collection(), entries: [] });
  assert.deepEqual(empty.entries, []);
});

test('speech backup validation rejects unknown metadata, review claims, wrong identities and unsafe locators', () => {
  const variants = [
    current => { current.review = { status: 'approved' }; },
    current => { current.collections[0].text = speech.text; },
    current => { current.collections[0].entries[0].review = { status: 'approved' }; },
    current => { current.collections[0].entries[0].fullVerse = speech.fullVerse; },
    current => { current.collections[0].entries[0].reference.endVerse = 4; },
    current => { current.collections[0].entries[0].reference.chapter++; },
    current => { current.collections[0].entries[0].reference.editionId = 'eng-web'; },
    current => { current.collections[0].entries[0].marker = 'generated-speaker'; },
    current => { current.collections[0].entries[0].offsetUnit = 'utf16'; },
    current => { current.collections[0].entries[0].start = -1; },
    current => { current.collections[0].entries[0].end = 100001; },
    current => { current.collections[0].entries[0].sourceTextHash = 'missing'; },
    current => { current.collections[0].entries[0].sourceUrl = 'javascript:alert(1)'; },
    current => { current.collections[0].entries[0].sourceUrl = 'https://username:password@example.test/'; },
    current => { current.collections[0].entries[0].language = 'genz reading'; },
    current => { current.collections[0].updatedAt = '2020-01-01T00:00:00.000Z'; },
    current => { current.collections[0].createdAt = 'November 5, 2026'; },
    current => { current.collections[0].title = '  '; },
    current => { current.collections[0].title = 'line\nbreak'; },
  ];
  for (const mutate of variants) { const current = state(); mutate(current); assert.throws(() => parseSpeechCollectionsBackup(backupWith(current))); }
  const malicious = JSON.parse(backupWith(state())); malicious.extra = true;
  assert.throws(() => parseSpeechCollectionsBackup(JSON.stringify(malicious)), /unknown/);
  assert.throws(() => parseSpeechCollectionsBackup('{bad json'), /valid JSON/);
  assert.throws(() => parseSpeechCollectionsBackup(JSON.stringify({ kind: 'another-app', version: 1, workspace: state() })), /Choose an Adigun/);
  assert.throws(() => validateSpeechPin(Object.assign(Object.create({ approval: true }), pin)), /Invalid/);
});

test('speech limits enforce UTF-8 bytes, count bounds and duplicate identifiers before recovery changes data', () => {
  const original = state();
  assert.throws(() => validateSpeechCollections({ ...original, collections: Array.from({ length: 101 }, (_, index) => collection(`c${index}`)) }), /at most 100/);
  assert.throws(() => validateSpeechCollection({ ...collection(), entries: Array.from({ length: 201 }, () => pin) }), /at most 200/);
  assert.throws(() => validateSpeechCollection({ ...collection(), entries: [pin, pin] }), /duplicate marked spans/);
  assert.throws(() => validateSpeechCollections({ ...original, collections: [collection(), collection()] }), /Duplicate speech collection/);
  assert.throws(() => parseSpeechCollectionsBackup('é'.repeat(MAX_SPEECH_COLLECTION_BACKUP_BYTES / 2 + 1)), /2 MiB/);
  const many = { ...emptySpeechCollections(), collections: Array.from({ length: 100 }, (_, outer) => ({ ...collection(`c${outer}`), entries: Array.from({ length: 50 }, (_, start) => ({ ...pin, start, end: start + 1, id: `eng-bsb:JHN:3:3:${start}-${start + 1}` })) })) };
  assert.throws(() => validateSpeechCollections(many), /2 MiB/);
  assert.equal(original.collections[0].entries.length, 2);
});

test('every accepted size-boundary workspace still fits its complete portable backup envelope', () => {
  const bytes = value => new TextEncoder().encode(JSON.stringify(value)).byteLength;
  const entries = Array.from({ length: 200 }, (_, start) => ({ ...pin, start, end: start + 1, id: `eng-bsb:JHN:3:3:${start}-${start + 1}` }));
  const make = count => ({ ...emptySpeechCollections(), collections: Array.from({ length: Math.ceil(count / 200) }, (_, index) => ({
    ...collection(`boundary-${index}`, 'T'), entries: entries.slice(0, Math.min(200, count - index * 200)),
  })) });
  let low = 0, high = 20000;
  while (low < high) { const middle = Math.ceil((low + high) / 2); if (bytes(make(middle)) <= MAX_SPEECH_COLLECTION_BACKUP_BYTES) low = middle; else high = middle - 1; }
  const candidate = make(low);
  for (const row of candidate.collections) {
    const missing = MAX_SPEECH_COLLECTION_BACKUP_BYTES - bytes(candidate);
    row.title += 'x'.repeat(Math.min(missing, 160 - row.title.length));
    if (bytes(candidate) === MAX_SPEECH_COLLECTION_BACKUP_BYTES) break;
  }
  assert.equal(bytes(candidate), MAX_SPEECH_COLLECTION_BACKUP_BYTES);
  assert.throws(() => validateSpeechCollections(candidate), /2 MiB/, 'saving a workspace that cannot be backed up must fail');
  let remove = new TextEncoder().encode(backupWith(candidate)).byteLength - MAX_SPEECH_COLLECTION_BACKUP_BYTES;
  for (const row of candidate.collections) {
    const amount = Math.min(remove, row.title.length - 1); row.title = row.title.slice(0, row.title.length - amount); remove -= amount;
    if (remove === 0) break;
  }
  assert.equal(remove, 0);
  const checked = validateSpeechCollections(candidate), backup = speechCollectionsBackup(checked);
  assert.equal(new TextEncoder().encode(backup).byteLength, MAX_SPEECH_COLLECTION_BACKUP_BYTES);
  assert.deepEqual(parseSpeechCollectionsBackup(backup), checked);
});

test('import previews distinguish duplicates from conflicts and explicit policies preserve unaffected collections', () => {
  const current = { ...state(), collections: [collection(), collection('device-only')] };
  const incoming = { ...state(), collections: [collection('test-collection', 'Backup title'), collection('new')] };
  const before = structuredClone(current);
  assert.deepEqual(previewSpeechCollectionsImport(current, incoming), { added: 1, identical: 0, conflicts: 1 });
  assert.deepEqual(previewSpeechCollectionsImport(current, current), { added: 0, identical: 2, conflicts: 0 });
  const keep = mergeSpeechCollections(current, incoming, 'keep-device');
  assert.equal(keep.collections[0].title, 'Private speech study');
  assert.deepEqual(keep.collections.map(row => row.id), ['test-collection', 'device-only', 'new']);
  const replace = mergeSpeechCollections(current, incoming, 'use-backup');
  assert.equal(replace.collections[0].title, 'Backup title');
  assert.equal(replace.collections[1].id, 'device-only');
  assert.equal(replace.revision, current.revision);
  assert.deepEqual(current, before);
  assert.throws(() => mergeSpeechCollections(current, incoming, 'silent-replace'), /Choose how/);
  const full = { ...state(), collections: Array.from({ length: 100 }, (_, index) => ({ ...collection(`c${index}`), entries: [] })) };
  assert.throws(() => mergeSpeechCollections(full, incoming, 'keep-device'), /at most 100/);
  assert.equal(full.collections.length, 100);
});

test('entry reordering is bounded, preserves pins and never mutates the saved collection', () => {
  const current = collection(), before = structuredClone(current);
  const moved = moveSpeechEntry(current, secondPin.id, -1);
  assert.deepEqual(moved.entries, [secondPin, pin]);
  assert.deepEqual(moveSpeechEntry(moved, secondPin.id, 1), before);
  assert.deepEqual(current, before);
  for (const [id, delta] of [[pin.id, -1], [secondPin.id, 1], ['missing', 1], [pin.id, 2]]) assert.throws(() => moveSpeechEntry(current, id, delta));
});

test('changed source wording, revision and publisher labels refuse saved speech without a substitute', async () => {
  for (const change of [
    edition => { edition.sha256 = '0'.repeat(64); },
    edition => { edition.name = 'A different publisher label'; },
    edition => { edition.language = 'de'; },
    edition => { edition.sourceUrl = 'https://example.test/a-different-source'; },
    edition => { edition.corpus = 'quran'; },
  ]) {
    await assert.rejects(loadPinnedSpeech(pin, { ...dependencies, getManifest: async id => { const source = await dependencies.getManifest(id); change(source.edition); return source; } }), /source revision|publisher label/);
  }
  await assert.rejects(loadPinnedSpeech(pin, { ...dependencies, getBook: async (...args) => {
    const source = await dependencies.getBook(...args); source.chapters[2].verses.find(verse => verse.number === 3).text += ' Changed narration outside the marked span.'; return source;
  } }), /wording changed/);
  await assert.rejects(loadPinnedSpeech(pin, { ...dependencies, getBook: async (...args) => { const source = await dependencies.getBook(...args); source.name = 'Changed book label'; return source; } }), /source label/);
  await assert.rejects(pinPublisherSpeech({ ...speech, text: speech.text + ' invented' }, dependencies), /no longer matches/);
  await assert.rejects(loadPinnedSpeech({ ...pin, sourceTextHash: '0'.repeat(64) }, dependencies), /wording changed/);
});

test('reopening re-extracts the exact current publisher boundary even when verse wording and span counts are unchanged', async () => {
  const altered = async (...args) => {
    const source = await dependencies.getBook(...args), verse = source.chapters[2].verses.find(row => row.number === 3);
    verse.characterSpans.find(span => span.marker === 'wj').start++;
    assert.equal(verse.text, speech.fullVerse);
    return source;
  };
  await assert.rejects(loadPinnedSpeech(pin, { ...dependencies, getBook: altered }), /marking.*boundaries/);
  await assert.rejects(loadPinnedSpeech(pin, { ...dependencies, getBook: async (...args) => {
    const source = await dependencies.getBook(...args), verse = source.chapters[2].verses.find(row => row.number === 3);
    verse.characterSpans = verse.characterSpans.filter(span => span.marker !== 'wj'); return source;
  } }), /annotations differ/);
  await assert.rejects(loadPinnedSpeech(pin, { ...dependencies, getBook: async (...args) => {
    const source = await dependencies.getBook(...args); source.chapters[2].verses = source.chapters[2].verses.filter(row => row.number !== 3); return source;
  } }), /annotations differ/);
});

test('Unicode code-point pins retain astral characters without treating UTF-16 positions as source boundaries', async () => {
  const synthetic = structuredClone(john), verse = synthetic.chapters[2].verses.find(row => row.number === 3);
  const points = Array.from(verse.text); points[speech.start] = '😀'; verse.text = points.join('');
  const syntheticSpeech = publisherSpeeches(synthetic, manifest.edition).speeches.find(row => row.id === speech.id);
  const fixtureDependencies = { ...dependencies, getBook: async () => structuredClone(synthetic) };
  const saved = await pinPublisherSpeech(syntheticSpeech, fixtureDependencies);
  const reopened = await loadPinnedSpeech(saved, fixtureDependencies);
  assert.equal(reopened.text, Array.from(verse.text).slice(saved.start, saved.end).join(''));
  assert.equal(reopened.text.startsWith('😀'), true);
  assert.notEqual(reopened.text, verse.text.slice(saved.start, saved.end));
  assert.equal(saved.offsetUnit, 'unicode-codepoint');
});

test('source batches preserve order, share only operation-local reads and reject conflicting duplicate pins', async () => {
  const matthew = await dependencies.getBook('MAT', 'eng-bsb');
  const matthewPin = await pinPublisherSpeech(publisherSpeeches(matthew, manifest.edition).speeches[0], dependencies);
  let manifests = 0, books = 0;
  const counted = {
    ...dependencies,
    getManifest: async id => { manifests++; return dependencies.getManifest(id); },
    getBook: async (...args) => { books++; return dependencies.getBook(...args); },
  };
  const reopened = await loadPinnedSpeeches([secondPin, pin, secondPin, matthewPin], counted);
  assert.deepEqual(reopened.map(row => row.id), [secondPin.id, pin.id, secondPin.id, matthewPin.id]);
  assert.equal(manifests, 1); assert.equal(books, 2);
  await loadPinnedSpeech(pin, counted);
  assert.equal(manifests, 2); assert.equal(books, 3, 'a later operation must recheck current source data');
  const calls = books;
  await assert.rejects(loadPinnedSpeeches([pin, { ...pin, sourceTextHash: '0'.repeat(64) }], counted), /conflicting source pins/);
  assert.equal(books, calls);
  assert.deepEqual(await checkSpeechCollectionSources(state(), dependencies), state());
});

test('source permission denial and missing offline files remain explicit and metadata recovery needs no source', async () => {
  const operations = [];
  await assert.rejects(loadPinnedSpeech(pin, { ...dependencies, requirePermission: async (_edition, operation) => { operations.push(operation); if (operation === 'display') throw new Error('Display permission denied'); } }), /Display permission denied/);
  assert.deepEqual(operations, ['searchIndex', 'display']);
  await assert.rejects(loadPinnedSpeech(pin, { ...dependencies, getBook: async () => { throw new Error('Source book has not been downloaded.'); } }), /not been downloaded/);
  assert.deepEqual(parseSpeechCollectionsBackup(speechCollectionsBackup(state())), { ...state(), revision: 0 });
});

test('cancellation after source and permission awaits cannot produce a pinned, loaded or import-ready result', async () => {
  const aborted = new AbortController(); aborted.abort(); let calls = 0;
  await assert.rejects(loadPinnedSpeech(pin, { ...dependencies, getManifest: async () => { calls++; return manifest; } }, aborted.signal), /cancelled/);
  assert.equal(calls, 0);
  const afterManifest = new AbortController();
  await assert.rejects(loadPinnedSpeech(pin, { ...dependencies, getManifest: async id => { const source = await dependencies.getManifest(id); afterManifest.abort(); return source; } }, afterManifest.signal), /cancelled/);
  const afterPermission = new AbortController(), operations = [];
  await assert.rejects(loadPinnedSpeech(pin, { ...dependencies, requirePermission: async (_edition, operation) => { operations.push(operation); afterPermission.abort(); } }, afterPermission.signal), /cancelled/);
  assert.deepEqual(operations, ['searchIndex']);
  const afterBook = new AbortController();
  await assert.rejects(checkSpeechCollectionSources(state(), { ...dependencies, getBook: async (...args) => { const book = await dependencies.getBook(...args); afterBook.abort(); return book; } }, afterBook.signal), /cancelled/);
});

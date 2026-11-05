import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateManifest, validateBook, validateMorphology, sourceText, mainContent, verseNotes, wordsInBook, findWord, lemmaPage } from '../src/original-language/model.ts';
import { sourcePins, HebrewSourceLoader, verifiedSourceBytes, pinFor } from '../src/original-language/source.ts';
const root = new URL('../data/original-language/oshb/', import.meta.url);
const bytes = path => readFile(new URL(path, root));
const json = async path => JSON.parse(await bytes(path));
const manifest = validateManifest(await json('manifest.json'), sourcePins);
const morphology = validateMorphology(await json('morphology.json'));
const book = async id => validateBook(await json(`books/${id}.json`), manifest.books.find(row => row.id === id));
const verse = (book, chapter, number) => book.chapters.find(row => row.number === chapter).verses.find(row => row.number === number);
const nodes = function* (items) { for (const item of items) if (typeof item !== 'string') { yield item; yield* nodes(item.content); } };

test('all 39 pinned books validate complete source identities without changing Unicode or supplied records', async () => {
  let sensitive = 0, unknownWords = 0; const unknown = new Set(), qereSizes = new Map();
  for (const descriptor of manifest.books) {
    const raw = await json(descriptor.path), before = JSON.stringify(raw), validated = validateBook(raw, descriptor);
    assert.equal(JSON.stringify(validated), before);
    for (const chapter of validated.chapters) for (const verse of chapter.verses) {
      const walk = items => { for (const item of items) if (typeof item === 'string') { if (item !== item.normalize('NFC')) sensitive++; } else walk(item.content); }; walk(verse.content);
      for (const node of nodes(verse.content)) {
        if (node.tag === 'w' && !Object.hasOwn(morphology.codes, node.attributes.morph)) { unknown.add(node.attributes.morph); unknownWords++; }
        if (node.tag === 'rdg' && node.attributes.type === 'x-qere') { const count = [...nodes(node.content)].filter(row => row.tag === 'w').length; qereSizes.set(count, (qereSizes.get(count) || 0) + 1); if (!count) assert.deepEqual(node.content, []); }
      }
    }
  }
  assert.equal(sensitive, 143471); assert.equal(unknownWords, 9); assert.equal(unknown.size, 8);
  assert.deepEqual(Object.fromEntries(qereSizes), { 0: 6, 1: 1230, 2: 24 });
});

test('Genesis 1 retains pointed/slashed words, original identifiers and exact morphology descriptions', async () => {
  const genesis = await book('Gen'), first = [...wordsInBook(genesis)][0];
  assert.equal(sourceText(first.word), 'בְּ/רֵאשִׁ֖ית');
  assert.deepEqual(first.word.attributes, { lemma: 'b/7225', n: '1.0', morph: 'HR/Ncfsa', id: '01xeN' });
  assert.equal(findWord(genesis, '01xeN').osisId, 'Gen.1.1');
  assert.match(morphology.codes[first.word.attributes.morph], /^ Hebrew:/);
  assert.notEqual(sourceText(first.word), sourceText(first.word).normalize('NFC'));
  assert.equal(mainContent(verse(genesis, '1', '1')).map(sourceText).join(''), verse(genesis, '1', '1').content.map(sourceText).join(''));
});

test('special-letter segments, multiword qere and empty qere remain separate from main words', async () => {
  const deut = await book('Deut'), selected = verse(deut, '6', '4');
  const special = [...nodes(mainContent(selected))].filter(node => node.tag === 'seg' && node.attributes.type === 'x-large');
  assert.deepEqual(special.map(sourceText), ['ע','ד']);
  const ruth = await book('Ruth'), empty = verse(ruth, '3', '12');
  const reading = [...nodes(verseNotes(empty))].find(node => node.tag === 'rdg' && node.attributes.type === 'x-qere');
  assert.deepEqual(reading.content, []);
  assert.equal(mainContent(empty).filter(node => typeof node !== 'string' && node.tag === 'note').length, 0);
  let twoWord;
  for (const descriptor of manifest.books) {
    const current = await book(descriptor.id);
    for (const chapter of current.chapters) for (const verse of chapter.verses) {
      twoWord = [...nodes(verseNotes(verse))].find(node => node.tag === 'rdg' && node.attributes.type === 'x-qere' && [...nodes(node.content)].filter(word => word.tag === 'w').length === 2);
      if (twoWord) break;
    }
    if (twoWord) break;
  }
  assert.ok(twoWord); assert.equal([...nodes(twoWord.content)].filter(node => node.tag === 'w').length, 2);
});

test('exact whole supplied lemma lookup distinguishes occurrences and verses, pages at 25 and navigates by source ID', async () => {
  const genesis = await book('Gen'), first = lemmaPage(genesis, '430'), second = lemmaPage(genesis, '430', 1);
  assert.equal(first.occurrences, 179); assert.equal(first.distinctVerses, 160); assert.equal(first.pages, 8); assert.equal(first.results.length, 25);
  assert.equal(second.results.length, 25); assert.notEqual(first.results[0].word.attributes.id, second.results[0].word.attributes.id);
  assert.equal(findWord(genesis, second.results[0].word.attributes.id).osisId, second.results[0].osisId);
  assert.equal(lemmaPage(genesis, '430', 999).results.length, 4);
  assert.equal(lemmaPage(genesis, ' 430').occurrences, 0);
  assert.notEqual(lemmaPage(genesis, 'b/7225').occurrences, lemmaPage(genesis, '7225').occurrences);
  assert.ok([...wordsInBook(genesis, true)].length > [...wordsInBook(genesis)].length);
});

test('changed numbering, missing verses, unknown tags, duplicate IDs and invented morphology descriptions fail validation', async () => {
  const raw = await json('books/Gen.json'), descriptor = manifest.books[0];
  for (const change of [
    value => { value.sourceRevision = 'changed'; },
    value => { value.chapters[0].verses.pop(); },
    value => { value.chapters[0].verses[0].osisId = 'Gen.1.2'; },
    value => { value.chapters[0].verses[0].content.find(row => row?.tag === 'w').tag = 'script'; },
    value => { const words = value.chapters[0].verses[0].content.filter(row => row?.tag === 'w'); words[1].attributes.id = words[0].attributes.id; },
  ]) { const altered = structuredClone(raw); change(altered); assert.throws(() => validateBook(altered, descriptor), /invalid/); }
  const altered = structuredClone(morphology); altered.codes = {}; assert.throws(() => validateMorphology(altered), /invalid/);
});

test('loader rejects changed pinned bytes, failed fetches and cancellation while retaining at most two fulfilled books', async () => {
  const requested = [], fetcher = async (url, options) => {
    if (options.signal?.aborted) throw new DOMException('Cancelled','AbortError');
    const path = url.pathname.split('/oshb/')[1]; requested.push(path); return new Response(await bytes(path));
  };
  const loader = new HebrewSourceLoader('https://example.test/app/', fetcher);
  await loader.loadBook('Gen'); await loader.loadBook('Exod'); await loader.loadBook('Gen'); await loader.loadBook('Lev');
  assert.equal(loader.cachedBookCount, 2);
  await loader.loadBook('Exod'); assert.equal(requested.filter(path => path === 'books/Exod.json').length, 2);
  await assert.rejects(() => loader.loadBook('not-a-book'), /39 installed/);
  const cancelled = new AbortController(); cancelled.abort(); await assert.rejects(() => loader.loadBook('Gen', cancelled.signal), { name: 'AbortError' });
  const changed = await bytes('books/Gen.json'); changed[changed.length - 1] = 32;
  await assert.rejects(() => verifiedSourceBytes(new Response(changed), pinFor('books/Gen.json')), /checksum/);
  await assert.rejects(() => verifiedSourceBytes(new Response(changed.subarray(1)), pinFor('books/Gen.json')), /byte length/);
  await assert.rejects(() => new HebrewSourceLoader('https://example.test/app/', async () => { throw new Error('Network unavailable'); }).loadManifest(), /Network unavailable/);
});

test('clearing or aborting a pending source load cannot repopulate the fulfilled-book cache', async () => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  const loader = new HebrewSourceLoader('https://example.test/app/', async url => {
    const path = url.pathname.split('/oshb/')[1]; if (path.startsWith('books/')) await gate; return new Response(await bytes(path));
  });
  await loader.loadManifest(); const controller = new AbortController(); const pending = loader.loadBook('Gen', controller.signal);
  loader.clear(); controller.abort(); release(); await assert.rejects(pending, { name: 'AbortError' }); assert.equal(loader.cachedBookCount, 0);
  await loader.loadBook('Gen'); assert.equal(loader.cachedBookCount, 1);
});

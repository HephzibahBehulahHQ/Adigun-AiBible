import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateManifest, validateBook, validateMorphology, describeToken, verseText, tokensInBook, findToken, lemmaPage } from '../src/greek-language/model.ts';
import { sourcePins, GreekSourceLoader, verifiedSourceBytes, pinFor, parseSourceBytes } from '../src/greek-language/source.ts';

const ROOT = new URL('../data/original-language/morphgnt-sblgnt/', import.meta.url);
const bytes = path => readFile(new URL(path, ROOT));
const json = async path => JSON.parse(await bytes(path));
const manifest = validateManifest(await json('manifest.json'), sourcePins), morphology = validateMorphology(await json('morphology.json'));
const book = async id => validateBook(await json(`books/${id}.json`), manifest.books.find(row => row.id === id));
const sourceVerse = (book, chapter, verse) => book.chapters.find(row => row.number === chapter).verses.find(row => row.number === verse);

test('all actual 27 books validate complete ordered source rows without rewriting any field', async () => {
  let count = 0, unknownCase = 0; const unknownCodes = new Set();
  for (const descriptor of manifest.books) {
    const raw = await json(descriptor.path), before = JSON.stringify(raw), value = validateBook(raw, descriptor);
    assert.equal(JSON.stringify(value), before);
    const original = (await bytes(descriptor.path)).toString('utf8');
    assert.equal(JSON.stringify(parseSourceBytes(Buffer.from(original))), before);
    for (const location of tokensInBook(value)) {
      count++; const row = describeToken(location.token, morphology).positions.find(position => position.name === 'case');
      if (row.raw === 'V') { unknownCase++; unknownCodes.add(location.token.parsing); assert.equal(row.description, null); }
    }
    assert.equal(findToken(value, 1)?.token, value.chapters[0].verses[0].tokens[0]);
    assert.equal(findToken(value, descriptor.tokenCount)?.token.sourceLine, descriptor.tokenCount);
  }
  assert.equal(count, 137554); assert.equal(unknownCase, 668); assert.equal(unknownCodes.size, 12);
});

test('actual text, punctuation, normalized parentheses and unknown case remain separate source facts', async () => {
  const matthew = await book('Mt');
  assert.equal(verseText(sourceVerse(matthew, '1', '1')), 'Βίβλος γενέσεως Ἰησοῦ χριστοῦ υἱοῦ Δαυὶδ υἱοῦ Ἀβραάμ.');
  const normalized = findToken(matthew, 10).token;
  assert.equal(normalized.text, 'ἐγέννησεν'); assert.equal(normalized.word, 'ἐγέννησεν'); assert.equal(normalized.normalized, 'ἐγέννησε(ν)'); assert.equal(normalized.lemma, 'γεννάω');
  assert.equal(findToken(matthew, 67).token.text, '⸂Βόες');
  const unknown = findToken(matthew, 330); assert.equal(unknown.reference, '010120'); assert.equal(unknown.token.ordinal, 13);
  assert.equal(unknown.token.text, 'Ἰωσὴφ'); assert.equal(unknown.token.normalized, 'Ἰωσήφ'); assert.equal(unknown.token.parsing, '----VSM-');
  assert.deepEqual(describeToken(unknown.token, morphology).positions.find(row => row.name === 'case'), { name: 'case', raw: 'V', description: null });
  const decomposed = structuredClone(matthew), token = decomposed.chapters[0].verses[0].tokens[0];
  token.text = token.text.normalize('NFD'); token.word = token.word.normalize('NFD'); token.lemma = token.lemma.normalize('NFD');
  assert.notEqual(token.text, matthew.chapters[0].verses[0].tokens[0].text);
  const preserved = validateBook(decomposed, manifest.books[0]);
  assert.equal(preserved.chapters[0].verses[0].tokens[0].text, token.text);
  assert.equal(lemmaPage(preserved, token.lemma).results[0].token.sourceLine, 1);
  assert.notEqual(lemmaPage(matthew, token.lemma).occurrences, lemmaPage(preserved, token.lemma).occurrences);
});

test('the exact John inventory retains absent passages instead of creating or renumbering verses', async () => {
  const john = await book('Jn');
  assert.equal(john.chapters.find(row => row.number === '7').verses.at(-1).number, '52');
  assert.equal(john.chapters.find(row => row.number === '8').verses[0].number, '12');
  assert.equal(sourceVerse(john, '8', '12').reference, '040812');
  const altered = structuredClone(john); altered.chapters[7].verses[0].number = '1';
  assert.throws(() => validateBook(altered, manifest.books.find(row => row.id === 'Jn')), /invalid or incomplete/);
});

test('full-field lemma lookup counts tokens and represented verses, returns only 25 and navigates by source row', async () => {
  const matthew = await book('Mt'), first = lemmaPage(matthew, 'ὁ'), second = lemmaPage(matthew, 'ὁ', 1), last = lemmaPage(matthew, 'ὁ', 999);
  assert.equal(first.occurrences, 2782); assert.equal(first.distinctVerses, 973); assert.equal(first.pages, 112);
  assert.equal(first.results.length, 25); assert.equal(second.results.length, 25); assert.equal(last.results.length, 7); assert.equal(last.page, 111);
  assert.notEqual(first.results[0].token.sourceLine, second.results[0].token.sourceLine);
  assert.equal(findToken(matthew, second.results[0].token.sourceLine).reference, second.results[0].reference);
  for (const query of [' ὁ','ὁ ','ο', 'ὁ'.normalize('NFD')]) assert.equal(lemmaPage(matthew, query).occurrences, 0);
  assert.throws(() => lemmaPage(matthew, 'ὁ', -1), /valid results page/);
});

test('malformed identities, missing tokens, unexpected fields and invented morphology expansions fail closed', async () => {
  const raw = await json('books/Phm.json'), descriptor = manifest.books.find(row => row.id === 'Phm');
  for (const change of [
    value => { value.sourceRevision = 'changed'; }, value => { value.chapters[0].verses.pop(); },
    value => { value.chapters[0].verses[0].reference = '180102'; }, value => { value.chapters[0].verses[0].tokens.pop(); },
    value => { value.chapters[0].verses[0].tokens[0].sourceLine = 2; }, value => { value.chapters[0].verses[0].tokens[1].ordinal = 1; },
    value => { value.chapters[0].verses[0].tokens[0].text = 'two fields'; }, value => { value.chapters[0].verses[0].tokens[0].gloss = 'invented'; },
    value => { value.chapters[0].verses[0].tokens[0].parsing = 'short'; },
  ]) { const changed = structuredClone(raw); change(changed); assert.throws(() => validateBook(changed, descriptor), /invalid or incomplete/); }
  const key = structuredClone(morphology); key.positions[4].codes.V = 'invented expansion'; assert.throws(() => validateMorphology(key), /invalid or incomplete/);
  const changedManifest = structuredClone(manifest); changedManifest.books[0].chapters[0].verseNumbers.pop(); assert.throws(() => validateManifest(changedManifest, sourcePins), /invalid or incomplete/);
  assert.throws(() => parseSourceBytes(Uint8Array.of(0xff)), /UTF-8 JSON/);
});

test('loader keeps at most two fulfilled books and rejects changed bytes, unavailable fetches and aborted cache hits', async () => {
  const requests = [], fetcher = async (url, options) => {
    if (options.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    const path = url.pathname.split('/morphgnt-sblgnt/')[1]; requests.push(path); return new Response(await bytes(path));
  };
  const loader = new GreekSourceLoader('https://example.test/app/', fetcher);
  await loader.loadBook('Phm'); await loader.loadBook('2Jn'); await loader.loadBook('Phm'); await loader.loadBook('3Jn');
  assert.equal(loader.cachedBookCount, 2); await loader.loadBook('2Jn'); assert.equal(requests.filter(path => path === 'books/2Jn.json').length, 2);
  await assert.rejects(() => loader.loadBook('JHN'), /27 installed/);
  const controller = new AbortController(); controller.abort(); await assert.rejects(() => loader.loadBook('2Jn', controller.signal), { name: 'AbortError' });
  const changed = await bytes('books/Phm.json'); changed[changed.length - 1] = 32;
  await assert.rejects(() => verifiedSourceBytes(new Response(changed), pinFor('books/Phm.json')), /checksum/);
  await assert.rejects(() => verifiedSourceBytes(new Response(changed.subarray(1)), pinFor('books/Phm.json')), /byte length/);
  await assert.rejects(() => new GreekSourceLoader('https://example.test/app/', async () => { throw new Error('Network unavailable'); }).loadManifest(), /Network unavailable/);
});

test('an older failed request cannot evict a newer success and clearing rejects obsolete cache population', async () => {
  let rejectOld, started, calls = 0; const pending = new Promise((_resolve, reject) => { rejectOld = reject; }), beginning = new Promise(resolve => { started = resolve; });
  const loader = new GreekSourceLoader('https://example.test/app/', async url => {
    const path = url.pathname.split('/morphgnt-sblgnt/')[1]; if (path === 'books/Phm.json' && ++calls === 1) { started(); await pending; }
    return new Response(await bytes(path));
  });
  await loader.loadManifest(); const old = loader.loadBook('Phm'), failure = assert.rejects(old, /older failure/); await beginning;
  const current = await loader.loadBook('Phm'); rejectOld(new Error('older failure')); await failure;
  assert.equal(await loader.loadBook('Phm'), current); assert.equal(loader.cachedBookCount, 1);
  let release, loading; const gate = new Promise(resolve => { release = resolve; }), loadingGate = new Promise(resolve => { loading = resolve; });
  const other = new GreekSourceLoader('https://example.test/app/', async url => { const path = url.pathname.split('/morphgnt-sblgnt/')[1]; if (path.startsWith('books/')) { loading(); await gate; } return new Response(await bytes(path)); });
  await other.loadManifest(); const result = other.loadBook('3Jn'); await loadingGate; other.clear(); release();
  assert.equal((await result).book, '3Jn'); assert.equal(other.cachedBookCount, 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { countConcordance, highlightParts, occurrenceSpans, surfaceWords, validateConcordanceManifest, validateConcordanceQuery, validateConcordanceRows } from '../src/concordance/model.ts';

const query = (text, extra = {}) => ({ text, mode: 'word', caseSensitive: false, bookId: '', testament: '', ...extra });
function fixture(texts = ['Love, love; beloved.', 'Love your neighbor.', 'Peace.']) {
  const manifest = { schemaVersion: 1, edition: { id: 'eng-web', name: 'Test source', language: 'en', sha256: 'a'.repeat(64) }, books: [{ id: 'GEN', name: 'Genesis', chapters: 1, verseCounts: [texts.length] }], totals: { books: 1, chapters: 1, verses: texts.length } };
  const rows = texts.map((text, i) => ({ bookId: 'GEN', chapter: 1, verse: i + 1, text }));
  return { manifest, rows, indexSha256: 'b'.repeat(64), contentVersion: 'c'.repeat(24) };
}

test('concordance counts source occurrences separately from matching verses and whole-word substrings', async () => {
  const result = await countConcordance(fixture(), query('love'));
  assert.equal(result.occurrences, 3); assert.equal(result.matchingVerses, 2); assert.equal(result.searchedRecords, 3);
  assert.deepEqual(result.distribution, [{ bookId: 'GEN', name: 'Genesis', occurrences: 3, verses: 2 }]);
  assert.deepEqual(result.matches[0].spans.map(span => result.matches[0].text.slice(span.start, span.end)), ['Love', 'love']);
  assert.equal((await countConcordance(fixture(), query('Love', { caseSensitive: true }))).occurrences, 2);
});

test('consecutive words retain source punctuation and count overlaps without crossing verse boundaries', async () => {
  const source = fixture(['one, one one', 'one', 'one two']);
  const result = await countConcordance(source, query('one one', { mode: 'phrase' }));
  assert.equal(result.occurrences, 2); assert.equal(result.matchingVerses, 1);
  assert.deepEqual(result.matches[0].spans, [{ start: 0, end: 8 }, { start: 5, end: 12 }]);
  assert.equal(highlightParts(source.rows[0].text, result.matches[0].spans).map(part => part.text).join(''), source.rows[0].text);
  assert.deepEqual(highlightParts(source.rows[0].text, result.matches[0].spans), [{ text: 'one, one one', match: true }]);
});

test('Unicode matching preserves accents, NFC equivalence, original offsets, apostrophes and supplementary characters', () => {
  const text = '🙂 Ọlọ́run O\u0323lo\u0323\u0301run Olorun 𐐀';
  const spans = occurrenceSpans(text, surfaceWords('Ọlọ́run'));
  assert.equal(spans.length, 2); assert.equal(spans[0].start, 3);
  assert.equal(highlightParts(text, spans).map(part => part.text).join(''), text);
  assert.deepEqual(surfaceWords("Lord's Lord’s self-control").map(word => word.value), ["lord's", 'lord’s', 'self', 'control']);
  assert.equal(occurrenceSpans('𐐀', surfaceWords('𐐨')).length, 1);
  assert.throws(() => highlightParts(text, [{ start: 0, end: text.length + 1 }]), /boundary/);
});

test('all result pages retain complete totals and reach beyond the old 100-verse search limit', async () => {
  const source = fixture(Array.from({ length: 130 }, () => 'love love'));
  const page = await countConcordance(source, query('love'), 4);
  assert.equal(page.occurrences, 260); assert.equal(page.matchingVerses, 130); assert.equal(page.matches.length, 25);
  assert.equal(page.matches[0].reference.verse, 101); assert.equal(page.matches.at(-1).reference.verse, 125);
  assert.equal((await countConcordance(source, query('love'), 5)).matches.length, 5);
  await assert.rejects(countConcordance(source, query('love'), 6), /unavailable/);
});

test('verified zero is distinct from an incomplete, duplicate, wrong-edition or invalid source index', async () => {
  const source = fixture();
  assert.equal(validateConcordanceManifest(source.manifest, 'eng-web'), source.manifest);
  assert.equal(validateConcordanceRows(source.rows, source.manifest), source.rows);
  assert.equal((await countConcordance(source, query('absent'))).occurrences, 0);
  assert.throws(() => validateConcordanceRows(source.rows.slice(1), source.manifest), /incomplete/);
  assert.throws(() => validateConcordanceRows([source.rows[0], source.rows[0], source.rows[2]], source.manifest), /duplicate/);
  assert.throws(() => validateConcordanceRows(source.rows.map(row => ({ ...row, editionId: 'eng-clearquran' })), source.manifest), /edition/);
  assert.throws(() => validateConcordanceManifest({ ...source.manifest, edition: { ...source.manifest.edition, corpus: 'quran' } }, 'eng-web'), /invalid/);
});

test('query validation and cancellation never publish partial totals', async () => {
  assert.throws(() => validateConcordanceQuery(query('two words')), /one word/);
  assert.throws(() => validateConcordanceQuery(query('!')), /between/);
  assert.throws(() => validateConcordanceQuery(query('one two three four five six seven eight nine', { mode: 'phrase' })), /eight|8/);
  const controller = new AbortController(); let yielded = false;
  await assert.rejects(countConcordance(fixture(), query('love'), 0, { signal: controller.signal, yieldControl: async () => { yielded = true; controller.abort(); } }), { name: 'AbortError' });
  assert.equal(yielded, true);
  await assert.rejects(countConcordance(fixture(), query('love', { bookId: 'JHN' })), /absent/);
  await assert.rejects(countConcordance(fixture(), query('love', { testament: 'new' })), /testament boundary/);
});

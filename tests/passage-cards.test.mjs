import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { wrapExactText, paginatePassageCards, cardTextAlternative, drawPassageCard } from '../src/sharing/pagination.ts';
import { loadCardSources } from '../src/sharing/sources.ts';

const segments = text => [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)];
const measure = (text, font) => segments(text).length * Number(font.match(/(\d+)px/)[1]) * .54;
const original = 'Ọlọ́run fẹ́ ayé.  Àwọn ìdílé wa.\nA deliberate second line, with spaces.\n\n' + 'a'.repeat(140);
const source = { id: 'test-source', name: 'Isolated test source', credit: 'Fixture only. Source and license attribution.\nhttps://example.invalid/source\nhttps://example.invalid/license' };
const passage = (text = original, id = 'p1') => ({ id, editionId: source.id, editionName: source.name, reference: 'Test 1:1', language: 'yo', text });

test('grapheme-safe wrapping preserves every source character, blank line and long word', () => {
  const lines = wrapExactText(original, 120, text => segments(text.replace(/[\r\n]+$/g, '')).length * 10);
  assert.equal(lines.join(''), original);
  assert.ok(lines.length > 10);
  for (const line of lines) {
    assert.ok(segments(line.replace(/[\r\n]+$/g, '')).length <= 12);
    assert.ok(!/^\p{M}/u.test(line), 'no combining mark is separated from its base');
  }
  assert.throws(() => wrapExactText('a', 5, () => 10), /Nothing has been cropped/);
});

test('long passages paginate without omitted source text, changed diacritics or overlapping footer', () => {
  const passages = [passage(original.repeat(15)), passage('Second verse.\n' + original.repeat(4), 'p2')];
  const layout = paginatePassageCards('Test 1:1–2', passages, [source], { size: 'square', margin: 96 }, measure);
  assert.ok(layout.pages.length > 2);
  for (const originalPassage of passages) {
    const rebuilt = layout.pages.flatMap(page => page.fragments).filter(fragment => fragment.passage.id === originalPassage.id).flatMap(fragment => fragment.lines).join('');
    assert.equal(rebuilt, originalPassage.text);
  }
  for (const [pageIndex, page] of layout.pages.entries()) {
    assert.ok(page.fragments.length);
    for (const fragment of page.fragments) {
      assert.ok(fragment.y >= layout.bodyTop);
      assert.ok(fragment.textY + fragment.lines.length * layout.lineHeight <= layout.bodyBottom);
    }
    assert.ok(cardTextAlternative(layout, pageIndex).includes(source.credit));
  }
  assert.ok(layout.pages.slice(1).some(page => page.fragments[0].continued));
});

test('all card sizes and templates keep rendered text inside chosen safe margins', () => {
  for (const size of ['story', 'square', 'portrait']) for (const palette of ['gold', 'ivory', 'paper', 'night']) {
    const layout = paginatePassageCards('Test 1:1', [passage(original.repeat(2))], [source], { size, margin: 120 }, measure);
    const calls = [];
    const context = { font: '', fillStyle: '', textBaseline: '', fillRect() {}, fillText(text, x, y) { calls.push({ text, x, y, font: this.font }); } };
    const canvas = { width: 0, height: 0, getContext: () => context };
    for (let index = 0; index < layout.pages.length; index++) {
      calls.length = 0;
      drawPassageCard(canvas, layout, index, palette);
      assert.equal(canvas.width, 1080);
      for (const call of calls) {
        assert.ok(call.x >= layout.margin);
        assert.ok(call.x + measure(call.text, call.font) <= layout.width - layout.margin + .1, `overflow in ${call.text}`);
        assert.ok(call.y >= layout.margin);
        assert.ok(call.y + Number(call.font.match(/(\d+)px/)[1]) <= layout.height - layout.margin + .1);
      }
    }
  }
});

test('unfit attribution, invalid margins and excessive selections fail instead of clipping', () => {
  assert.throws(() => paginatePassageCards('Test', [passage()], [{ ...source, credit: 'Long attribution\n'.repeat(100) }], { size: 'square', margin: 96 }, measure), /attribution leaves too little/);
  for (const margin of [0, 47, 161, NaN]) assert.throws(() => paginatePassageCards('Test', [passage()], [source], { size: 'story', margin }, measure), /safe margin/);
  assert.throws(() => paginatePassageCards('Test', [passage('long text '.repeat(30_000))], [source], { size: 'story', margin: 96 }, measure), /size limit/);
});

const json = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const manifests = { 'eng-web': json('data/manifest.json'), 'eng-asv': json('data/editions/eng-asv/manifest.json'), 'eng-bsb': json('data/editions/eng-bsb/manifest.json'), yor: json('data/editions/yor/manifest.json') };
const bookPath = (id, book) => id === 'eng-web' ? `data/books/${book}.json` : `data/editions/${id}/books/${book}.json`;
const dependencies = overrides => ({
  getManifest: async id => manifests[id],
  getBook: async (book, id) => json(bookPath(id, book)),
  requirePermission: async () => {},
  sourceCredit: edition => [edition.name, edition.license, edition.licenseUrl, edition.sourceUrl].join('\n'),
  ...overrides,
});

test('both authentic editions must permit image export before any passage is loaded', async () => {
  let loaded = 0; const checks = [];
  await assert.rejects(loadCardSources({ bookId: 'JHN', chapter: 3, verse: 16, editionId: 'eng-web' }, 'yor', false, dependencies({
    getBook: async () => { loaded++; throw new Error('must not load'); },
    requirePermission: async (edition, operation) => { checks.push([edition.id, operation]); if (edition.id === 'yor') throw new Error('Image rights denied for test'); },
  })), /Image rights denied/);
  assert.equal(loaded, 0);
  assert.deepEqual(checks, [['eng-web', 'imageExport'], ['yor', 'imageExport']]);
});

test('bilingual sources retain authentic wording, Unicode, edition identities and source credits', async () => {
  const prepared = await loadCardSources({ bookId: 'JHN', chapter: 3, verse: 16, endVerse: 17, editionId: 'eng-web' }, 'yor', false, dependencies());
  assert.deepEqual(prepared.passages.map(value => value.editionId), ['eng-web', 'yor', 'eng-web', 'yor']);
  for (const [index, value] of prepared.passages.entries()) {
    const expected = json(bookPath(value.editionId, 'JHN')).chapters.find(chapter => chapter.number === 3).verses.find(verse => verse.number === 16 + Math.floor(index / 2));
    assert.equal(value.text, expected.text);
  }
  assert.equal(prepared.sources.length, 2);
  assert.ok(prepared.sources[1].credit.includes(manifests.yor.edition.licenseUrl));
});

test('whole-chapter export is complete and duplicate edition choices do not multiply content', async () => {
  const prepared = await loadCardSources({ bookId: 'JHN', chapter: 3, verse: 16, editionId: 'eng-web' }, 'eng-web', true, dependencies());
  const sourceChapter = json(bookPath('eng-web', 'JHN')).chapters.find(chapter => chapter.number === 3);
  assert.equal(prepared.sources.length, 1);
  assert.deepEqual(prepared.passages.map(value => value.text), sourceChapter.verses.map(value => value.text));
  assert.match(prepared.title, /3:1–36/);
});

test('a real BSB omission is reported as a numbered gap instead of silently aligning texts', async () => {
  await assert.rejects(loadCardSources({ bookId: 'MAT', chapter: 17, verse: 20, endVerse: 22, editionId: 'eng-web' }, 'eng-bsb', false, dependencies()), /Berean Standard Bible: source wording is missing at MAT 17:21/);
});

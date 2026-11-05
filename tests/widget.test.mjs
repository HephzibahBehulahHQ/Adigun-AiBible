import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { drawWidget, layoutWidget, loadWidgetSource } from '../src/widget/model.ts';

const json = path => JSON.parse(readFileSync(new URL(`../data/${path}`, import.meta.url), 'utf8'));
const prefix = id => id === 'eng-web' ? '' : `editions/${id}/`;
const dependencies = {
  getManifest: async id => json(`${prefix(id)}manifest.json`),
  getBook: async (book, id) => json(`${prefix(id)}books/${book}.json`),
  requirePermission: async () => {},
  sourceCredit: edition => [edition.attribution || edition.name, edition.license, edition.sourceUrl, edition.licenseUrl].filter(Boolean).join('\n'),
};
const measure = (text, font) => [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].length * Number(font.match(/(\d+)px/)[1]) * .53;

test('single-verse source loading retains exact Yoruba diacritics and original permission notices', async () => {
  const prepared = await loadWidgetSource({ bookId: 'JHN', chapter: 3, verse: 16, endVerse: 18, editionId: 'yor' }, dependencies);
  const verse = json('editions/yor/books/JHN.json').chapters[2].verses.find(v => v.number === 16);
  assert.equal(prepared.passages.length, 1);
  assert.equal(prepared.passages[0].text, verse.text);
  assert.equal(prepared.editions[0].id, 'yor');
  assert.ok(prepared.sources[0].credit.includes('creativecommons.org'));
  const layout = layoutWidget(prepared, measure);
  assert.equal(layout.textLines.join(''), verse.text);
  assert.ok(layout.alternative.includes(verse.text));
  assert.ok(layout.alternative.includes(prepared.sources[0].credit));
  assert.ok(layout.textTop >= layout.clockSpace);
});

test('image permission denial and missing source wording prevent widget preparation', async () => {
  await assert.rejects(loadWidgetSource({ bookId: 'JHN', chapter: 3, verse: 16 }, { ...dependencies, requirePermission: async (_edition, operation) => { assert.equal(operation, 'imageExport'); throw new Error('image permission denied'); } }), /permission denied/);
  await assert.rejects(loadWidgetSource({ bookId: 'MAT', chapter: 17, verse: 21, editionId: 'eng-bsb' }, dependencies), /MAT 17:21/);
  await assert.rejects(loadWidgetSource({ bookId: 'JHN', chapter: 3, verse: 999 }, dependencies), /not complete or valid|source wording is missing/);
  await assert.rejects(loadWidgetSource({ bookId: 'JHN', chapter: 0, verse: 1 }, dependencies), /valid single verse/);
});

test('every drawn line stays below the clock area and inside the 9:16 card without cropping', async () => {
  const prepared = await loadWidgetSource({ bookId: 'JHN', chapter: 3, verse: 16, editionId: 'eng-web' }, dependencies);
  const layout = layoutWidget(prepared, measure);
  for (const palette of ['gold', 'ivory', 'paper', 'night']) {
    const calls = [];
    const context = { font: '', fillStyle: '', textBaseline: '', fillRect() {}, fillText(text, x, y) { calls.push({ text, x, y, font: this.font }); } };
    const canvas = { width: 0, height: 0, getContext: () => context };
    drawWidget(canvas, layout, palette);
    assert.equal(canvas.width, 1080); assert.equal(canvas.height, 1920);
    for (const call of calls) {
      assert.ok(call.x >= layout.margin);
      assert.ok(call.x + measure(call.text, call.font) <= layout.width - layout.margin + .1, call.text);
      assert.ok(call.y >= layout.clockSpace);
      assert.ok(call.y + Number(call.font.match(/(\d+)px/)[1]) <= layout.height - 104);
    }
  }
});

test('unfit verses or attributions fail explicitly while exact wrapping preserves Unicode', async () => {
  const prepared = await loadWidgetSource({ bookId: 'JHN', chapter: 3, verse: 16 }, dependencies);
  const long = structuredClone(prepared); long.passages[0].text = 'Ọlọ́run  fẹ́ ayé.\n'.repeat(120);
  assert.throws(() => layoutWidget(long, measure), /Nothing has been cropped/);
  const attribution = structuredClone(prepared); attribution.sources[0].credit = 'Required attribution line\n'.repeat(80);
  assert.throws(() => layoutWidget(attribution, measure), /Nothing has been cropped/);
  const spaced = structuredClone(prepared); spaced.passages[0].text = 'Ọlọ́run  fẹ́ ayé.\n\nOriginal spacing remains. ' + 'Ọ́'.repeat(60);
  const layout = layoutWidget(spaced, measure);
  assert.equal(layout.textLines.join(''), spaced.passages[0].text);
  for (const line of layout.textLines) assert.ok(!/^\p{M}/u.test(line));
});

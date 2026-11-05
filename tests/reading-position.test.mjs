import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveReadingPosition, readReadingPosition } from '../src/reading-position.ts';

const manifest = JSON.parse(readFileSync(new URL('../data/manifest.json', import.meta.url), 'utf8'));
const saved = {
  schemaVersion: 1,
  ref: { bookId: 'GEN', chapter: 1, verse: 1, editionId: 'eng-web' },
  preset: 'en',
  scrollY: 825,
};
const linked = { bookId: 'JHN', chapter: 3, verse: 16, endVerse: 17, editionId: 'eng-web' };
const views = ['home','read','compare','discover','plans','saved','questions','library','sources','settings','share','atlas','study','evidence','editions','projection','tools','family','audio','drop','support','widget','ministry','speakers','editorial-workbench','linguistics','time-travel','nearby','interpretation'];

test('every supported screen preserves an explicit shared passage instead of restoring a different saved passage', () => {
  for (const view of views) {
    const hash = `#/${view}/JHN/3?verse=16&end=17&edition=eng-web`;
    const result = resolveReadingPosition(hash, saved, manifest.books, manifest.edition.id);
    assert.equal(result.source, 'link', hash);
    assert.deepEqual(result.position?.ref, linked, hash);
    assert.equal(result.position?.scrollY, undefined, 'a shared link must not inherit the previous passage scroll position');
  }
});

test('malformed explicit links never fall back to the previously saved passage', () => {
  for (const suffix of ['XYZ/1','JHN/999','JHN/3/extra','%ZZ/1','JHN/3?verse=','JHN/3?verse=1.5','JHN/3?verse=1e1','JHN/3?verse=16&end=0','JHN/3?verse=16&end=']) {
    const hash = `#/projection/${suffix}`;
    const result = resolveReadingPosition(hash, saved, manifest.books, manifest.edition.id);
    assert.deepEqual(result, { source: 'invalid-link', position: null }, hash);
  }
});

test('encoded book IDs, ranges and explicit editions survive startup resolution', () => {
  const hash = '#/projection/%4A%48%4E/3?verse=16&end=17&edition=eng-web';
  assert.deepEqual(resolveReadingPosition(hash, saved, manifest.books, manifest.edition.id).position?.ref, linked);
});

test('a screen without an explicit passage still restores the validated saved position', () => {
  const valid = readReadingPosition(JSON.stringify(saved), manifest.books, manifest.edition.id);
  assert.deepEqual(resolveReadingPosition('#/home', valid, manifest.books, manifest.edition.id), { source: 'saved', position: valid });
  assert.equal(resolveReadingPosition('#/home', null, manifest.books, manifest.edition.id).source, 'default');
});

test('historical query links take precedence over a saved Bible passage', () => {
  const hash = '#/library?book=JHN&chapter=3&verse=16&end=17&edition=eng-web&historical=didache-lightfoot&hchapter=16';
  const result = resolveReadingPosition(hash, saved, manifest.books, manifest.edition.id);
  assert.equal(result.source, 'link');
  assert.deepEqual(result.position?.ref, linked);
  assert.equal(result.position?.scrollY, undefined);
});

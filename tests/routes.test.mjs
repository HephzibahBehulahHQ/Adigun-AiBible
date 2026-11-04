import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRoute, ROUTE_VIEWS } from '../src/routes.ts';
import { resolveReadingPosition } from '../src/reading-position.ts';
import { validateReference } from '../src/domain.ts';

const { books } = JSON.parse(readFileSync(new URL('../data/manifest.json', import.meta.url), 'utf8'));
const saved = { schemaVersion: 1, ref: { bookId: 'GEN', chapter: 1, verse: 1, editionId: 'eng-web' }, preset: 'en', scrollY: 825 };
const linked = { bookId: 'JHN', chapter: 3, verse: 16, endVerse: 17, editionId: 'eng-web' };

test('every passage-bearing screen honors an explicit range over a different saved passage', () => {
  for (const view of ROUTE_VIEWS) {
    const hash = `#/${view}/JHN/3?verse=16&end=17&edition=eng-web`;
    const parsed = parseRoute(hash);
    assert.equal(parsed.view, view, hash);
    assert.equal(parsed.explicitPassage, true, hash);
    assert.deepEqual(parsed.ref, linked, hash);
    const selected = resolveReadingPosition(hash, saved, books);
    assert.equal(selected.source, 'link', hash);
    assert.deepEqual(selected.position.ref, linked, hash);
    assert.equal(selected.position.scrollY, undefined, 'the previous passage scroll offset must not leak into a link');
  }
});

test('named editions and encoded book identifiers are preserved by parsing and recovery', () => {
  const hash = '#/projection/%4A%48%4E/3?verse=16&end=17&edition=eng-bsb';
  const source = { ...saved, ref: { ...saved.ref, editionId: 'eng-bsb' } };
  const expected = { ...linked, editionId: 'eng-bsb' };
  assert.deepEqual(parseRoute(hash).ref, expected);
  assert.deepEqual(resolveReadingPosition(hash, source, books, 'eng-bsb').position.ref, expected);
  assert.equal(resolveReadingPosition(hash, saved, books, 'eng-web').source, 'invalid-link', 'an incompatible edition is never silently substituted');
});

test('invalid explicit references on every screen never fall back to saved reading', () => {
  for (const view of ROUTE_VIEWS) {
    for (const suffix of ['XYZ/1', 'JHN/999', 'JHN/3/extra', '%ZZ/1', 'JHN/3?verse=', 'JHN/3?verse=1.5', 'JHN/3?verse=1e1', 'JHN/3?verse=16&end=0', 'JHN/3?verse=16&end=', 'JHN/3?verse=16&end=37']) {
      const hash = `#/${view}/${suffix}`;
      assert.equal(parseRoute(hash).explicitPassage, true, hash);
      assert.equal(validateReference(parseRoute(hash).ref, books), false, hash);
      assert.deepEqual(resolveReadingPosition(hash, saved, books), { source: 'invalid-link', position: null }, hash);
    }
  }
});

test('screens without an explicit passage retain normal saved-reading restoration', () => {
  for (const hash of ['', '#/', '#/home', '#/unavailable', ...ROUTE_VIEWS.map(view => `#/${view}`)]) {
    assert.equal(parseRoute(hash).explicitPassage, false, hash);
    assert.deepEqual(resolveReadingPosition(hash, saved, books), { source: 'saved', position: saved }, hash);
  }
  assert.equal(parseRoute('#/unavailable').view, 'home');
  assert.deepEqual(parseRoute('#/read/GEN').ref, { bookId: 'GEN', chapter: 1, verse: 1 });
  assert.deepEqual(resolveReadingPosition('#/audio', null, books).position.ref, saved.ref);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { emptyStudy, isReference, mergeStudy, refKey, validateReference, validateStudy } from '../src/domain.ts';
import { readReadingPosition, resolveReadingPosition, serializeReadingPosition } from '../src/reading-position.ts';

const { books } = JSON.parse(readFileSync(new URL('../data/manifest.json', import.meta.url), 'utf8'));
const single = { bookId: 'JHN', chapter: 3, verse: 16 };
const range = { ...single, endVerse: 18 };
const otherEdition = { ...range, editionId: 'test-other-edition' };
const note = (id, ref, text, updatedAt = '2026-11-03T10:00:00Z') => ({ id, ref, text, updatedAt });
const position = { schemaVersion: 1, ref: range, preset: 'en', scrollY: 825 };

test('single-verse WEB identities preserve existing keys while distinct ranges remain independent', () => {
  assert.equal(refKey(single), 'JHN.3.16');
  assert.equal(refKey({ ...single, editionId: 'eng-web' }), refKey(single));
  assert.equal(refKey({ ...single, endVerse: 16 }), refKey(single));
  const state = validateStudy({ ...emptyStudy(), bookmarks: [single, range, { ...range, endVerse: 20 }, { ...single }] });
  assert.deepEqual(state.bookmarks, [single, range, { ...range, endVerse: 20 }]);
  assert.equal(new Set(state.bookmarks.map(refKey)).size, 3);
});

test('merging a single verse with a range keeps both bookmarks and their independently written notes', () => {
  const a = { ...emptyStudy(), bookmarks: [single], notes: [note('single-note', single, 'A reflection on one verse.')], highlights: ['JHN.3.16'] };
  const b = { ...emptyStudy(), bookmarks: [range], notes: [note('range-note', range, 'A different reflection on the paragraph.')], highlights: ['JHN.3.16-18'] };
  const before = structuredClone([a, b]);
  const merged = mergeStudy(a, b);
  assert.deepEqual(merged.bookmarks, [single, range]);
  assert.deepEqual(merged.notes.map(n => [refKey(n.ref), n.text]), [['JHN.3.16', 'A reflection on one verse.'], ['JHN.3.16-18', 'A different reflection on the paragraph.']]);
  assert.deepEqual(merged.highlights, ['JHN.3.16', 'JHN.3.16-18']);
  assert.deepEqual([a, b], before, 'Import must not mutate the original study objects.');
});

test('edition identity separates bookmarks, notes and highlights without duplicating explicit default editions', () => {
  const state = validateStudy({
    ...emptyStudy(),
    bookmarks: [range, otherEdition, { ...range, editionId: 'eng-web' }],
    notes: [note('web-note', range, 'WEB note'), note('other-note', otherEdition, 'Other edition note')],
    highlights: ['JHN.3.16', 'eng-web:JHN.3.16', 'test-other-edition:JHN.3.16-18']
  });
  assert.equal(state.bookmarks.length, 2);
  assert.deepEqual(state.bookmarks.map(refKey), ['JHN.3.16-18', 'test-other-edition:JHN.3.16-18']);
  assert.equal(new Set(state.notes.map(n => refKey(n.ref))).size, 2);
  assert.deepEqual(state.highlights, ['JHN.3.16', 'test-other-edition:JHN.3.16-18']);
});

test('legacy version-one backups preserve notes and highlights on validation and round trip', () => {
  const legacy = {
    schemaVersion: 1,
    bookmarks: [single],
    highlights: ['JHN.3.16', 'PSA.119.105'],
    notes: [note('existing', single, 'Keep this exact text: àánú 🙏')],
    completedSessions: ['steady-0'],
    journal: [{ id: 'question', text: 'A private question.', createdAt: '2026-11-01T12:00:00Z' }],
    readingDays: ['2026-11-01']
  };
  const restored = validateStudy(JSON.parse(JSON.stringify(legacy)));
  assert.deepEqual(restored, legacy);
  assert.deepEqual(mergeStudy(emptyStudy(), restored), legacy);
});

test('merging note revisions keeps the newest matching ID and all unrelated range notes', () => {
  const a = { ...emptyStudy(), notes: [note('same', single, 'New version', '2026-11-03T11:00:00Z'), note('range', range, 'Keep separate')] };
  const b = { ...emptyStudy(), notes: [note('same', single, 'Old version', '2026-11-03T09:00:00Z')] };
  const merged = mergeStudy(a, b);
  assert.equal(merged.notes.find(n => n.id === 'same').text, 'New version');
  assert.equal(merged.notes.find(n => n.id === 'range').text, 'Keep separate');
  assert.equal(merged.notes.length, 2);
});

test('malformed references and highlight identities fail validation before importing study data', () => {
  const invalid = [null, [], {}, { ...single, chapter: 0 }, { ...single, chapter: 1.5 }, { ...single, verse: NaN }, { ...single, verse: '16' }, { ...single, endVerse: 0 }, { ...single, endVerse: 15 }, { ...single, endVerse: 177 }, { ...single, editionId: '' }, { ...single, editionId: null }, { ...single, editionId: '../another-app' }];
  for (const ref of invalid) {
    assert.equal(isReference(ref), false, JSON.stringify(ref));
    assert.equal(validateReference(ref, books), false, JSON.stringify(ref));
    assert.throws(() => validateStudy({ ...emptyStudy(), bookmarks: [ref] }), /Invalid bookmark reference/);
  }
  for (const key of ['JHN.0.16', 'JHN.3.0', 'JHN.3.16-15', 'JHN.3.16-177', 'edition/path:JHN.3.16', 'JHN.3.16:other', 'JHN.3.16-NaN']) {
    assert.throws(() => validateStudy({ ...emptyStudy(), highlights: [key] }), /Invalid highlights/, key);
  }
});

test('reference validation uses actual book and chapter bounds and optional edition scope', () => {
  assert.equal(validateReference(range, books, 'eng-web'), true);
  assert.equal(validateReference({ ...single, chapter: 22 }, books), false);
  assert.equal(validateReference({ ...single, endVerse: 37 }, books), false);
  assert.equal(validateReference({ ...single, bookId: 'XYZ' }, books), false);
  assert.equal(validateReference(otherEdition, books, 'eng-web'), false);
  assert.equal(validateReference(otherEdition, books, 'test-other-edition'), true);
});

test('reading positions round trip valid ranges, presets and scroll offsets without browser globals', () => {
  const before = structuredClone(position);
  const serialized = serializeReadingPosition(position, books);
  assert.equal(typeof serialized, 'string');
  assert.deepEqual(readReadingPosition(serialized, books), position);
  assert.deepEqual(position, before);
  const basic = { schemaVersion: 1, ref: single };
  assert.deepEqual(readReadingPosition(JSON.stringify(basic), books), basic);
});

test('malformed, unsupported and out-of-corpus saved reading positions are ignored safely', () => {
  for (const raw of [null, undefined, '', '{broken', '[]', 'null', 'x'.repeat(4097)]) assert.equal(readReadingPosition(raw, books), null);
  const invalid = [
    { ...position, schemaVersion: 2 },
    { ...position, ref: { ...range, chapter: 22 } },
    { ...position, ref: { ...range, endVerse: 37 } },
    { ...position, ref: otherEdition },
    { ...position, preset: 'made-up' },
    { ...position, scrollY: -1 },
    { ...position, scrollY: '800' },
    { ...position, scrollY: 10_000_001 },
    { schemaVersion: 1 },
    { ...position, ref: [] }
  ];
  for (const value of invalid) {
    assert.equal(readReadingPosition(JSON.stringify(value), books), null, JSON.stringify(value));
    assert.equal(serializeReadingPosition(value, books), null, JSON.stringify(value));
  }
  assert.equal(serializeReadingPosition({ ...position, scrollY: Infinity }, books), null);
  assert.equal(serializeReadingPosition({ ...position, scrollY: NaN }, books), null);
});

test('saved positions never silently change their edition and only supported fields are retained', () => {
  assert.equal(readReadingPosition(JSON.stringify(position), books, 'test-other-edition'), null);
  const other = { ...position, ref: otherEdition };
  assert.deepEqual(readReadingPosition(JSON.stringify(other), books, 'test-other-edition'), other);
  const extra = { ...position, privateNote: 'Not reading-position data', ref: { ...range, untrustedUrl: 'https://invalid.example' } };
  assert.deepEqual(readReadingPosition(JSON.stringify(extra), books), position);
});

test('home or an unspecified passage restores a saved reference and valid reading offset', () => {
  for (const hash of ['', '#/home', '#/read', '#/compare']) {
    assert.deepEqual(resolveReadingPosition(hash, position, books), { source: 'saved', position });
  }
});

test('explicit deep links override saved passages and never inherit stale scroll positions', () => {
  const selected = resolveReadingPosition('#/read/PSA/23?verse=1&end=3', position, books);
  assert.equal(selected.source, 'link');
  assert.deepEqual(selected.position.ref, { bookId: 'PSA', chapter: 23, verse: 1, endVerse: 3, editionId: 'eng-web' });
  assert.equal(selected.position.preset, 'en');
  assert.equal(selected.position.scrollY, undefined);
  assert.equal(resolveReadingPosition('#/compare/JHN/3?verse=16&edition=eng-web', position, books).source, 'link');
  assert.equal(resolveReadingPosition('#/read/GEN', position, books).position.ref.chapter, 1);
});

test('invalid explicit deep links remain recoverable errors instead of opening a different saved passage', () => {
  for (const hash of ['#/read/XYZ/1', '#/read/JHN/22', '#/read/JHN/3?verse=16&end=37', '#/read/JHN/3?verse=16&end=0', '#/read/JHN/3?verse=1.5', '#/read/JHN/3?verse=', '#/read/JHN/3?edition=test-other-edition', '#/read/JHN/3/extra', '#/read/%ZZ/1']) {
    assert.deepEqual(resolveReadingPosition(hash, position, books), { source: 'invalid-link', position: null }, hash);
  }
});

test('missing or invalid saved positions use only a validated corpus default', () => {
  const selected = resolveReadingPosition('#/home', null, books);
  assert.equal(selected.source, 'default');
  assert.deepEqual(selected.position.ref, { bookId: 'GEN', chapter: 1, verse: 1, editionId: 'eng-web' });
  assert.deepEqual(resolveReadingPosition('#/home', null, []), { source: 'default', position: null });
  assert.equal(resolveReadingPosition('#/home', { ...position, ref: { ...range, bookId: 'XYZ' } }, books).source, 'default');
});

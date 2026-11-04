import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_LAYOUTS, MAX_LAYOUT_BACKUP_BYTES, addReaderLayout, emptyReaderLayouts,
  parseReaderLayoutsBackup, readerLayoutsBackup, removeReaderLayout,
  renameReaderLayout, validateReaderLayouts, validateReaderLayoutSettings,
} from '../src/reader-layouts/model.ts';
import { DamagedReaderLayoutsError, resetDamagedReaderLayouts, saveReaderLayouts } from '../src/reader-layouts/storage.ts';

const now = '2026-11-04T15:00:00.000Z';
const settings = () => ({
  theme: 'parchment', fontSize: 22, lineHeight: 1.9, focus: true,
  inspector: 'source', showInspector: false,
  source: { layout: 'paragraphs', headings: true, notes: true, redLetters: false },
  panes: [
    { id: 'eng-web', linked: true, bookId: 'JHN', chapter: 3 },
    { id: 'deu1912', linked: false, bookId: 'PSA', chapter: 23 },
  ],
});
const first = () => addReaderLayout(emptyReaderLayouts(), settings(), 'layout-one', 'Quiet study', now);
const backupOf = state => JSON.stringify({ kind: 'adigun-reader-layouts', version: 1, state });

test('a named layout retains independent panes and appearance through a clean backup round trip', () => {
  const state = { ...first(), revision: 31 };
  const restored = parseReaderLayoutsBackup(readerLayoutsBackup(state));
  assert.deepEqual(restored, { ...state, revision: 0 });
  assert.equal(state.revision, 31);
  assert.deepEqual(restored.layouts[0].settings.panes[1], { id: 'deu1912', linked: false, bookId: 'PSA', chapter: 23 });
});

test('validation whitelists layout fields and never exports notes, history, passage wording or arbitrary data', () => {
  const candidate = first();
  candidate.secret = 'private-state-marker';
  candidate.history = [{ text: 'private-state-marker' }];
  candidate.layouts[0].notes = 'private-state-marker';
  candidate.layouts[0].settings.privateNotes = 'private-state-marker';
  candidate.layouts[0].settings.source.wording = 'private-state-marker';
  candidate.layouts[0].settings.panes[0].verseText = 'private-state-marker';
  const clean = validateReaderLayouts(candidate);
  assert.deepEqual(Object.keys(clean), ['schemaVersion', 'revision', 'layouts']);
  assert.deepEqual(clean, first());
  assert.ok(!readerLayoutsBackup(candidate).includes('private-state-marker'));
  assert.deepEqual(parseReaderLayoutsBackup(backupOf(candidate)), first());
});

test('layout creation and validation detach nested values from caller-owned objects', () => {
  const appearance = settings(), empty = emptyReaderLayouts();
  const next = addReaderLayout(empty, appearance, 'detached', 'Detached', now);
  appearance.source.headings = false;
  appearance.panes[1].chapter = 99;
  assert.equal(next.layouts[0].settings.source.headings, true);
  assert.equal(next.layouts[0].settings.panes[1].chapter, 23);
  assert.deepEqual(empty, emptyReaderLayouts());
});

test('duplicate names and identifiers are rejected after trimming and case normalization', () => {
  const initial = first();
  assert.throws(() => addReaderLayout(initial, settings(), 'second', '  QUIET STUDY  ', now), /different name/);
  assert.throws(() => addReaderLayout(initial, settings(), 'LAYOUT-ONE', 'Different', now), /duplicate identifiers/);
  const normalized = addReaderLayout(emptyReaderLayouts(), settings(), 'one', 'Study', now);
  assert.throws(() => addReaderLayout(normalized, settings(), 'two', 'Ｓｔｕｄｙ', now), /different name/);
  assert.equal(initial.layouts.length, 1);
});

test('a layout collection enforces the finite limit without changing the accepted state', () => {
  let state = emptyReaderLayouts();
  for (let i = 0; i < MAX_LAYOUTS; i++) state = addReaderLayout(state, settings(), `layout-${i}`, `Layout ${i}`, now);
  assert.equal(state.layouts.length, MAX_LAYOUTS);
  assert.throws(() => addReaderLayout(state, settings(), 'extra', 'Extra', now), /up to 12/);
  assert.equal(state.layouts.length, MAX_LAYOUTS);
  assert.throws(() => validateReaderLayouts({ ...state, layouts: [...state.layouts, state.layouts[0]] }), /up to 12/);
});

test('rename and removal affect only the selected layout and reject stale identifiers', () => {
  const original = addReaderLayout(first(), settings(), 'second', 'Second', now);
  const renamed = renameReaderLayout(original, 'second', '  Evening  ', '2026-11-04T16:00:00.000Z');
  assert.equal(renamed.layouts[1].name, 'Evening');
  assert.equal(original.layouts[1].name, 'Second');
  assert.deepEqual(renamed.layouts[0], original.layouts[0]);
  assert.throws(() => renameReaderLayout(renamed, 'second', 'Quiet study', now), /different name/);
  assert.throws(() => renameReaderLayout(renamed, 'missing', 'New', now), /no longer saved/);
  assert.throws(() => removeReaderLayout(renamed, 'missing'), /no longer saved/);
  assert.deepEqual(removeReaderLayout(renamed, 'second'), first());
});

test('reader controls reject unknown enum values and non-finite or out-of-range sizing', () => {
  for (const fontSize of [15, 29, NaN, Infinity, '22', null]) assert.throws(() => validateReaderLayoutSettings({ ...settings(), fontSize }), /Reading size/);
  for (const lineHeight of [1.4, 2.3, -Infinity, '1.8', null]) assert.throws(() => validateReaderLayoutSettings({ ...settings(), lineHeight }), /Line spacing/);
  assert.throws(() => validateReaderLayoutSettings({ ...settings(), theme: 'untrusted-theme' }), /theme/);
  assert.throws(() => validateReaderLayoutSettings({ ...settings(), inspector: 'unknown' }), /inspector/);
  assert.throws(() => validateReaderLayoutSettings({ ...settings(), focus: 'false' }), /Focus mode/);
  assert.throws(() => validateReaderLayoutSettings({ ...settings(), showInspector: 0 }), /visibility/);
  for (const size of [16, 28]) assert.equal(validateReaderLayoutSettings({ ...settings(), fontSize: size }).fontSize, size);
});

test('publisher appearance choices require explicit booleans and supported layouts', () => {
  for (const key of ['headings', 'notes', 'redLetters']) {
    assert.throws(() => validateReaderLayoutSettings({ ...settings(), source: { ...settings().source, [key]: 'true' } }), /must be on or off/);
  }
  assert.throws(() => validateReaderLayoutSettings({ ...settings(), source: { ...settings().source, layout: 'invented' } }), /Source layout/);
  assert.throws(() => validateReaderLayoutSettings({ ...settings(), source: null }), /must be an object/);
});

test('comparison configurations reject invalid identities, chapters and pane counts', () => {
  for (const count of [0, 1, 5]) assert.throws(() => validateReaderLayoutSettings({ ...settings(), panes: Array.from({ length: count }, () => settings().panes[0]) }), /two to four/);
  const invalidPanes = [
    { id: '../secret' }, { id: 'ENG-WEB' }, { bookId: '<script>' },
    { bookId: '' }, { chapter: 0 }, { chapter: 201 }, { chapter: 1.5 },
    { chapter: NaN }, { linked: 'false' },
  ];
  for (const invalid of invalidPanes) {
    assert.throws(() => validateReaderLayoutSettings({ ...settings(), panes: [{ ...settings().panes[0], ...invalid }, settings().panes[1]] }));
  }
  const sameEdition = { ...settings(), panes: [settings().panes[0], { ...settings().panes[0], linked: false, chapter: 4 }] };
  assert.equal(validateReaderLayoutSettings(sameEdition).panes[1].chapter, 4, 'the same edition may intentionally appear in two independent panes');
});

test('invalid names, dates, revisions and schemas never become an accepted saved collection', () => {
  const original = first();
  for (const name of ['', '   ', 'a'.repeat(81), 'bad\nname']) assert.throws(() => renameReaderLayout(original, 'layout-one', name, now), /Layout name/);
  for (const updatedAt of ['yesterday', '2026-11-04', '2026-02-30T15:00:00.000Z']) assert.throws(() => renameReaderLayout(original, 'layout-one', 'Fine', updatedAt), /date/);
  for (const revision of [-1, 1.5, '1', Number.MAX_SAFE_INTEGER, NaN]) assert.throws(() => validateReaderLayouts({ ...original, revision }), /version/);
  assert.throws(() => validateReaderLayouts({ ...original, schemaVersion: 2 }), /version/);
  assert.throws(() => validateReaderLayouts({ ...original, layouts: {} }), /up to/);
  assert.throws(() => validateReaderLayouts([]), /object/);
  assert.deepEqual(original, first());
});

test('backup parsing rejects unrelated, malformed and oversized imports before replacing saved layouts', () => {
  const state = first();
  assert.throws(() => parseReaderLayoutsBackup('{'), /not valid JSON/);
  assert.throws(() => parseReaderLayoutsBackup(JSON.stringify({ kind: 'adigun-reading-session', version: 1, state })), /reader layouts backup/);
  assert.throws(() => parseReaderLayoutsBackup(JSON.stringify({ kind: 'adigun-reader-layouts', version: 2, state })), /reader layouts backup/);
  assert.throws(() => parseReaderLayoutsBackup(backupOf({ ...state, layouts: [null] })), /object/);
  const oversized = JSON.stringify({ kind: 'adigun-reader-layouts', version: 1, state, extra: 'é'.repeat(33000) });
  assert.ok(oversized.length < MAX_LAYOUT_BACKUP_BYTES);
  assert.throws(() => parseReaderLayoutsBackup(oversized), /too large/, 'the cap counts UTF-8 bytes, not characters');
  assert.deepEqual(state, first());
});

test('damaged-layout errors preserve an inspectable recovery copy and refuse an uncomparable reset', async () => {
  const raw = { schemaVersion: 99, layouts: [{ oldName: 'Retain this' }] };
  const error = new DamagedReaderLayoutsError(raw);
  assert.equal(error.name, 'DamagedReaderLayoutsError');
  assert.deepEqual(JSON.parse(error.backup).raw, raw);
  const circular = {}; circular.self = circular;
  assert.equal(new DamagedReaderLayoutsError(circular).backup, null);
  await assert.rejects(resetDamagedReaderLayouts(null), /cannot be compared safely/);
});

test('storage rejects invalid write revisions and invalid settings before opening a database', async () => {
  for (const revision of [-1, 0.5, Number.MAX_SAFE_INTEGER - 1]) await assert.rejects(saveReaderLayouts(first(), revision), /revision/);
  const invalid = first(); invalid.layouts[0].settings.lineHeight = NaN;
  await assert.rejects(saveReaderLayouts(invalid, 0), /Line spacing/);
});

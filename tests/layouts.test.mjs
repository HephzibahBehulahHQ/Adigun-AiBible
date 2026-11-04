import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_LAYOUTS, addLayout, emptyLayouts, layoutBackup, layoutDescription, mergeLayouts,
  parseLayoutBackup, removeLayout, renameLayout, validateLayoutSnapshot, validateLayouts,
} from '../src/layouts/model.ts';

const firstDate = '2026-11-04T14:00:00.000Z', secondDate = '2026-11-04T15:00:00.000Z';
const snapshot = () => ({ theme: 'parchment', fontSize: 22, lineHeight: 1.9, focus: false, inspector: 'source', inspectorVisible: true });
const initial = () => addLayout(emptyLayouts(), 'Yorùbá study', snapshot(), 'layout-one', firstDate);
const backup = layouts => JSON.stringify({ kind: 'adigun-workspace-layouts', version: 1, layouts });

test('layouts capture only validated display configuration, independently of later changes', () => {
  const settings = snapshot(), state = addLayout(emptyLayouts(), 'Morning study', settings, 'morning', firstDate);
  settings.theme = 'night';
  assert.equal(state.layouts[0].snapshot.theme, 'parchment');
  assert.deepEqual(Object.keys(state.layouts[0].snapshot), ['theme', 'fontSize', 'lineHeight', 'focus', 'inspector', 'inspectorVisible']);
  for (const unsupported of ['reference', 'editionId', 'locale', 'notes', 'history']) {
    assert.throws(() => validateLayoutSnapshot({ ...snapshot(), [unsupported]: 'private fixture' }), /unsupported fields/);
  }
  assert.equal(layoutDescription(snapshot()), 'Warm Parchment · 22 px · Line spacing 1.9 · Focus off · Source inspector');
});

test('invalid settings cannot become usable layout controls or coerced booleans', () => {
  for (const [field, invalid] of [
    ['theme', '__proto__'], ['theme', 'unknown'], ['fontSize', 15], ['fontSize', 29],
    ['fontSize', NaN], ['lineHeight', Infinity], ['lineHeight', 2.3], ['lineHeight', '1.8'],
    ['focus', 'false'], ['inspectorVisible', 1], ['inspector', ['source']], ['inspector', 'private'],
  ]) assert.throws(() => validateLayoutSnapshot({ ...snapshot(), [field]: invalid }), undefined, field);
  const missing = snapshot(); delete missing.inspector;
  assert.throws(() => validateLayoutSnapshot(missing), /missing/);
});

test('layout names preserve diacritics and reject duplicates without mutating existing data', () => {
  const state = addLayout(emptyLayouts(), '  Yorùbá study  ', snapshot(), 'layout-one', firstDate), before = structuredClone(state);
  assert.equal(state.layouts[0].name, 'Yorùbá study');
  assert.throws(() => addLayout(state, 'YORÙBÁ STUDY', snapshot(), 'different-id', firstDate), /unique/);
  assert.throws(() => addLayout(state, 'Another name', snapshot(), 'layout-one', firstDate), /unique/);
  for (const name of ['', '   ', 'a'.repeat(61), 'name\nline', 'name\u0000']) assert.throws(() => addLayout(state, name, snapshot(), 'new-id', firstDate));
  assert.deepEqual(state, before);
});

test('rename and removal are immutable, keep saved settings intact and refuse stale identities', () => {
  const state = initial(), before = structuredClone(state);
  const renamed = renameLayout(state, 'layout-one', 'Evening study', secondDate);
  assert.deepEqual(renamed.layouts[0], { ...before.layouts[0], name: 'Evening study', updatedAt: secondDate });
  assert.deepEqual(state, before);
  assert.equal(removeLayout(renamed, 'layout-one').layouts.length, 0);
  assert.throws(() => renameLayout(state, 'missing', 'Title', secondDate), /no longer saved/);
  assert.throws(() => removeLayout(state, 'missing'), /no longer saved/);
  assert.throws(() => renameLayout(state, 'layout-one', 'Title', '2026-11-04T13:00:00.000Z'), /before it was created/);
});

test('a thirteenth layout is refused while the twelve saved layouts remain intact', () => {
  let state = emptyLayouts();
  for (let index = 0; index < MAX_LAYOUTS; index++) state = addLayout(state, `Layout ${index}`, snapshot(), `layout-${index}`, firstDate);
  const before = structuredClone(state);
  assert.throws(() => addLayout(state, 'One too many', snapshot(), 'extra', firstDate), /at most 12/);
  assert.deepEqual(state, before);
});

test('layout backup roundtrips names and display choices without storage revision or personal fields', () => {
  const state = { ...initial(), revision: 17 }, json = layoutBackup(state), parsed = JSON.parse(json);
  assert.deepEqual(Object.keys(parsed), ['kind', 'version', 'layouts']);
  assert.deepEqual(parseLayoutBackup(json), state.layouts);
  assert.equal(parsed.revision, undefined);
  const restored = mergeLayouts(emptyLayouts(), parseLayoutBackup(json));
  assert.deepEqual(restored.state.layouts, state.layouts);
  assert.equal(restored.state.revision, 0);
  assert.equal(restored.added, 1);
});

test('malformed, duplicate, unsupported and oversized imports are rejected before merging', () => {
  const state = initial(), before = structuredClone(state), layout = state.layouts[0];
  const invalid = [
    'not json', 'null', '[]', JSON.stringify({ kind: 'another-app', version: 1, layouts: [] }),
    JSON.stringify({ kind: 'adigun-workspace-layouts', version: 2, layouts: [] }),
    JSON.stringify({ kind: 'adigun-workspace-layouts', version: 1, layouts: [], notes: ['private'] }),
    backup([layout, layout]), backup([{ ...layout, snapshot: { ...layout.snapshot, editionId: 'eng-web' } }]),
    backup([{ ...layout, createdAt: '2026-02-30T00:00:00.000Z' }]),
    backup([{ ...layout, id: '../another-store' }]),
    ' '.repeat(65_537), 'é'.repeat(40_000),
  ];
  for (const raw of invalid) assert.throws(() => mergeLayouts(state, parseLayoutBackup(raw)));
  assert.deepEqual(state, before);
  for (const revision of [-1, 0.5, Infinity, Number.MAX_SAFE_INTEGER]) assert.throws(() => validateLayouts({ ...state, revision }), /revision/);
});

test('import preserves existing same-ID and same-name layouts and is repeatable without duplicates', () => {
  const state = initial(), original = structuredClone(state);
  const sameId = { ...state.layouts[0], name: 'Changed imported name', snapshot: { ...snapshot(), theme: 'night' } };
  const sameName = { ...state.layouts[0], id: 'other-id', name: 'YORÙBÁ STUDY' };
  const fresh = { ...state.layouts[0], id: 'fresh', name: 'Evening study' };
  const result = mergeLayouts(state, [sameId, sameName, fresh]);
  assert.equal(result.added, 1); assert.equal(result.skipped, 2); assert.deepEqual(result.addedIds, ['fresh']);
  assert.deepEqual(result.state.layouts, [...original.layouts, fresh]);
  assert.deepEqual(state, original);
  const repeated = mergeLayouts(result.state, [sameId, sameName, fresh]);
  assert.equal(repeated.added, 0); assert.equal(repeated.skipped, 3);
  assert.deepEqual(repeated.state, result.state);
});

test('combined import capacity is all-or-nothing and does not silently truncate incoming layouts', () => {
  let state = emptyLayouts();
  for (let index = 0; index < MAX_LAYOUTS - 1; index++) state = addLayout(state, `Layout ${index}`, snapshot(), `layout-${index}`, firstDate);
  const before = structuredClone(state), base = initial().layouts[0];
  const incoming = [{ ...base, id: 'incoming-a', name: 'A' }, { ...base, id: 'incoming-b', name: 'B' }];
  assert.throws(() => mergeLayouts(state, incoming), /nothing was imported/);
  assert.deepEqual(state, before);
  assert.equal(mergeLayouts(state, [incoming[0]]).state.layouts.length, MAX_LAYOUTS);
});

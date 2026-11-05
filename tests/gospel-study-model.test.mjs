import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultGospelSelection, resolvePaneReference } from '../src/gospels/model.ts';
import { MAX_GOSPEL_STUDIES, MAX_GOSPEL_STUDY_BACKUP_BYTES, emptyGospelStudy, validateGospelStudyPassage, validateGospelStudyRow, validateGospelStudy, gospelStudyBackup, parseGospelStudyBackup, previewGospelStudyImport, mergeGospelStudies, moveGospelStudy } from '../src/gospels/study-model.ts';

function row(id = 'study-one') {
  const selection = defaultGospelSelection('eng-web');
  selection.panes[0].independent = { chapter: 17, verse: 20, endVerse: 22, editionId: 'eng-bsb' };
  selection.panes[1].linked = false;
  selection.panes[1].independent = { chapter: 1, verse: 1, endVerse: 2, editionId: 'yor' };
  selection.panes.push({ bookId: 'JHN', linked: false, independent: { chapter: 3, verse: 16, endVerse: 17, editionId: 'eng-bsb' } });
  return {
    id, title: 'Private Gospel readings', note: 'My own reflection.\nYorùbá diacritics stay intact.', selection,
    passages: selection.panes.map(pane => ({ reference: resolvePaneReference(selection, pane), sourceSha256: 'a'.repeat(64), editionName: 'Test source edition', bookName: pane.bookId })),
    createdAt: '2026-11-05T16:00:00.000Z', updatedAt: '2026-11-05T17:00:00.000Z',
  };
}
const state = rows => ({ ...emptyGospelStudy(), rows });

test('saved studies round-trip mixed panes, retained independent ranges, exact source pins and private text', () => {
  const original = { ...state([row()]), revision: 7 }, before = structuredClone(original);
  const validated = validateGospelStudy(original), encoded = gospelStudyBackup(original), restored = parseGospelStudyBackup(encoded);
  assert.deepEqual(validated, original);
  assert.deepEqual(restored, { ...original, revision: 0 });
  assert.equal(restored.rows[0].selection.panes[0].linked, true);
  assert.equal(restored.rows[0].selection.panes[0].independent.editionId, 'eng-bsb');
  assert.equal(restored.rows[0].passages[0].reference.editionId, 'eng-web');
  assert.equal(restored.rows[0].passages[1].reference.editionId, 'yor');
  assert.deepEqual(JSON.parse(encoded), { kind: 'adigun-gospel-notebook', version: 1, workspace: restored });
  restored.rows[0].selection.panes[0].independent.chapter = 1;
  restored.rows[0].passages[0].reference.chapter = 1;
  assert.deepEqual(original, before, 'validation and restore never retain mutable aliases to the supplied state');
});

test('every saved source must match its ordered pane and complete range without silent remapping', () => {
  for (const mutate of [
    value => value.passages.reverse(),
    value => value.passages.pop(),
    value => { value.passages[0] = structuredClone(value.passages[1]); },
    value => { value.passages[0].reference.editionId = 'eng-bsb'; },
    value => { value.passages[0].reference.endVerse--; },
    value => { value.passages[0].reference.verse++; },
    value => { value.passages[0].reference.chapter++; },
    value => { value.selection.panes[0] = structuredClone(value.selection.panes[1]); },
  ]) {
    const invalid = row(); mutate(invalid);
    assert.throws(() => validateGospelStudyRow(invalid));
  }
  const sparse = row(); delete sparse.passages[1];
  assert.throws(() => validateGospelStudyRow(sparse));
  assert.throws(() => validateGospelStudy(state([row(), row()])), /Duplicate/);
});

test('source pins and labels reject malformed hashes, control characters, missing and extra fields', () => {
  const original = row().passages[0];
  for (const patch of [
    { sourceSha256: '' }, { sourceSha256: 'A'.repeat(64) }, { sourceSha256: 'f'.repeat(63) },
    { sourceSha256: null }, { editionName: '' }, { bookName: '   ' },
    { editionName: 'An edition\nwith a forged second label' }, { bookName: 'MAT\u0000' },
    { editionName: 'x'.repeat(201) }, { bookName: 'x'.repeat(101) },
    { sourceText: 'Copied source must not be accepted in a saved pin.' }, { approved: true },
  ]) assert.throws(() => validateGospelStudyPassage({ ...original, ...patch }));
  const missing = structuredClone(original); delete missing.sourceSha256;
  assert.throws(() => validateGospelStudyPassage(missing), /Incomplete or unknown/);
  assert.throws(() => validateGospelStudyPassage({ ...original, reference: { ...original.reference, text: 'Forged quotation' } }));
  const extendedEdition = 'a'.repeat(99) + '.';
  assert.equal(validateGospelStudyPassage({ ...original, reference: { ...original.reference, editionId: extendedEdition } }).reference.editionId, extendedEdition);
  assert.throws(() => validateGospelStudyPassage({ ...original, reference: { ...original.reference, editionId: extendedEdition + 'a' } }));
});

test('saved study identity, dates and text bounds fail safely without stripping unknown records', () => {
  for (const patch of [
    { id: '../other-study' }, { id: '' }, { id: 'x'.repeat(101) },
    { title: ' ' }, { title: 'x'.repeat(161) }, { note: 'x'.repeat(12001) }, { note: '\u0000' },
    { createdAt: '2026-02-30T16:00:00.000Z' }, { updatedAt: '2026-11-05' },
    { updatedAt: '2026-11-04T17:00:00.000Z' }, { approved: true }, { scripture: ['injected source'] },
  ]) assert.throws(() => validateGospelStudyRow({ ...row(), ...patch }));
  const missing = row(); delete missing.note;
  assert.throws(() => validateGospelStudyRow(missing), /Incomplete or unknown/);
  assert.equal(validateGospelStudyRow({ ...row(), note: '<script>user writing remains plain text</script>' }).note, '<script>user writing remains plain text</script>');
  assert.equal(validateGospelStudyRow({ ...row(), note: '' }).note, '');
});

test('backup versions, revisions, object fields, row counts and UTF-8 bytes are bounded', () => {
  for (const revision of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER, '1']) assert.throws(() => validateGospelStudy({ ...emptyGospelStudy(), revision }), /revision/);
  assert.throws(() => validateGospelStudy({ ...emptyGospelStudy(), schemaVersion: 2 }), /version/);
  assert.throws(() => validateGospelStudy(state(Array.from({ length: MAX_GOSPEL_STUDIES + 1 }, (_, i) => row(`study-${i}`)))), /at most/);
  const large = state(Array.from({ length: 70 }, (_, i) => ({ ...row(`study-${i}`), note: '界'.repeat(12000) })));
  assert.ok(JSON.stringify(large).length < MAX_GOSPEL_STUDY_BACKUP_BYTES);
  assert.throws(() => validateGospelStudy(large), /2 MiB/);
  assert.throws(() => parseGospelStudyBackup(' '.repeat(MAX_GOSPEL_STUDY_BACKUP_BYTES + 1)), /2 MiB/);
  assert.throws(() => parseGospelStudyBackup('{broken'), /not valid JSON/);
  assert.throws(() => parseGospelStudyBackup(null), /JSON text/);
  const original = JSON.parse(gospelStudyBackup(state([row()])));
  for (const patch of [{ version: 2 }, { kind: 'adigun-gospel-workspace' }, { approved: true }, { workspace: { ...original.workspace, approvals: [] } }]) {
    assert.throws(() => parseGospelStudyBackup(JSON.stringify({ ...original, ...patch })));
  }
  assert.throws(() => parseGospelStudyBackup(JSON.stringify(original).replace('"version":1', '"__proto__":{},"version":1')), /Incomplete or unknown/);
  const sparse = state([row()]); sparse.rows.length = 2;
  assert.throws(() => validateGospelStudy(sparse));
});

test('preview and conflict choices preserve device order and leave both inputs untouched', () => {
  const current = { ...state([row('one'), row('two')]), revision: 8 }, incoming = state([row('one'), { ...row('two'), note: 'Backup edit' }, row('three')]);
  const before = structuredClone({ current, incoming });
  assert.deepEqual(previewGospelStudyImport(current, incoming), { added: 1, identical: 1, conflicts: 1 });
  const keep = mergeGospelStudies(current, incoming, 'keep-device'), replace = mergeGospelStudies(current, incoming, 'use-backup');
  assert.deepEqual(keep.rows.map(value => value.id), ['one', 'two', 'three']);
  assert.deepEqual(replace.rows.map(value => value.id), ['one', 'two', 'three']);
  assert.equal(keep.rows[1].note, current.rows[1].note);
  assert.equal(replace.rows[1].note, 'Backup edit');
  assert.equal(replace.revision, 8);
  assert.deepEqual({ current, incoming }, before);
  assert.throws(() => mergeGospelStudies(current, incoming, 'unrecognized'), /Choose how/);
  const full = state(Array.from({ length: MAX_GOSPEL_STUDIES }, (_, i) => row(`study-${i}`)));
  assert.throws(() => mergeGospelStudies(full, state([row('extra')]), 'keep-device'), /at most/);
});

test('reordering changes only the intended neighboring studies and rejects missing rows or invalid moves', () => {
  const original = { ...state([row('one'), row('two'), row('three')]), revision: 4 }, before = structuredClone(original);
  const moved = moveGospelStudy(original, 'two', 1);
  assert.deepEqual(moved.rows.map(value => value.id), ['one', 'three', 'two']);
  assert.equal(moved.revision, 4);
  assert.deepEqual(moveGospelStudy(moved, 'two', -1), original);
  for (const [id, delta] of [['absent', 1], ['one', -1], ['three', 1], ['two', 2], ['two', 0]]) assert.throws(() => moveGospelStudy(original, id, delta));
  assert.deepEqual(original, before);
});

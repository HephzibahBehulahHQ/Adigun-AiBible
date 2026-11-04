import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_BACKUP_BYTES, MAX_HISTORY, MAX_TABS, addStudyTab, closeStudyTab,
  emptyReadingSession, parseReadingSessionBackup, passageLabel, readingSessionBackup,
  recordReadingVisit, renameStudyTab, samePassage, selectHistoryVisit, selectStudyTab,
  validateReadingSession, validateSavedPassage,
} from '../src/reading-session/model.ts';

const date = '2026-11-04T13:00:00.000Z';
const passage = (chapter = 3, editionId = 'eng-web') => ({
  reference: { editionId, bookId: 'JHN', chapter, verse: 16, endVerse: 17 },
  sourceSha256: 'a'.repeat(64), editionName: 'Test edition identity', bookName: 'John',
});
const visit = (state, source, number) => recordReadingVisit(state, source, `visit-${number}`, date, `tab-${number}`);
const initial = () => visit(emptyReadingSession(), passage(), 1);

test('history records explicit edition, range and revision, deduplicates reloads, and preserves previous/next positions', () => {
  const first = initial();
  const second = visit(first, passage(4), 2);
  const third = visit(second, passage(5), 3);
  const previous = selectHistoryVisit(third, 'visit-2');
  assert.equal(previous.historyIndex, 1);
  assert.deepEqual(previous.tabs[0].passage, passage(4));
  assert.deepEqual(visit(previous, passage(4), 4), previous);
  assert.equal(selectHistoryVisit(previous, 'visit-3').historyIndex, 2);
  const branched = visit(previous, passage(6), 5);
  assert.deepEqual(branched.history.map(item => item.id), ['visit-1', 'visit-2', 'visit-5']);
  assert.equal(branched.historyIndex, 2);
  assert.deepEqual(first, initial(), 'prior snapshots remain unchanged');
  assert.deepEqual(first.history[0].passage.reference, { editionId: 'eng-web', bookId: 'JHN', chapter: 3, verse: 16, endVerse: 17 });
  assert.equal(first.history[0].passage.sourceSha256, 'a'.repeat(64));
});

test('history caps the oldest passages without losing the active position or revision changes', () => {
  let state = emptyReadingSession();
  for (let index = 1; index <= MAX_HISTORY + 5; index++) {
    const source = { ...passage(), bookName: 'Psalms', reference: { ...passage().reference, bookId: 'PSA', chapter: index, verse: 1, endVerse: 1 } };
    state = visit(state, source, index);
  }
  assert.equal(state.history.length, MAX_HISTORY);
  assert.equal(state.history[0].id, 'visit-6');
  assert.equal(state.history.at(-1).id, 'visit-105');
  assert.equal(state.historyIndex, MAX_HISTORY - 1);
  const revised = { ...state.history.at(-1).passage, sourceSha256: 'b'.repeat(64) };
  const changed = visit(state, revised, 106);
  assert.equal(changed.history.at(-1).id, 'visit-106');
  assert.equal(changed.history.at(-2).passage.sourceSha256, 'a'.repeat(64));
});

test('study tabs keep independent passages and names while the selected tab follows reader navigation', () => {
  const first = renameStudyTab(initial(), 'tab-1', '  Morning study  ');
  const twoTabs = addStudyTab(first, passage(4, 'eng-bsb'), 'tab-berean');
  const navigated = visit(twoTabs, passage(5, 'eng-bsb'), 2);
  assert.equal(navigated.activeTabId, 'tab-berean');
  assert.deepEqual(navigated.tabs[0], first.tabs[0]);
  assert.equal(navigated.tabs[0].name, 'Morning study');
  assert.equal(navigated.tabs[1].passage.reference.chapter, 5);
  const reopened = selectStudyTab(navigated, 'tab-1');
  assert.deepEqual(reopened.tabs, navigated.tabs);
  const previous = selectHistoryVisit(reopened, 'visit-1');
  assert.deepEqual(previous.tabs[1], navigated.tabs[1], 'history navigation only changes the active tab');
  assert.deepEqual(twoTabs.tabs[1].passage, passage(4, 'eng-bsb'));
});

test('closing a tab preserves its neighbours and chooses a remaining active tab deterministically', () => {
  const three = addStudyTab(addStudyTab(initial(), passage(4), 'middle'), passage(5), 'last');
  const middleActive = selectStudyTab(three, 'middle');
  const withoutMiddle = closeStudyTab(middleActive, 'middle');
  assert.equal(withoutMiddle.activeTabId, 'last');
  assert.deepEqual(withoutMiddle.tabs, [three.tabs[0], three.tabs[2]]);
  const withoutInactive = closeStudyTab(three, 'middle');
  assert.equal(withoutInactive.activeTabId, 'last');
  const onlyFirst = closeStudyTab(withoutMiddle, 'last');
  assert.equal(onlyFirst.activeTabId, 'tab-1');
  const closed = closeStudyTab(onlyFirst, 'tab-1');
  assert.equal(closed.activeTabId, null);
  assert.deepEqual(closed.tabs, []);
  assert.deepEqual(closed.history, three.history);
  assert.doesNotThrow(() => validateReadingSession(closed));
});

test('tab limits, stale identifiers and invalid names reject without changing the session', () => {
  let state = initial();
  for (let index = 2; index <= MAX_TABS; index++) state = addStudyTab(state, passage(index), `tab-${index}`);
  const before = structuredClone(state);
  assert.throws(() => addStudyTab(state, passage(), 'too-many'), /up to 12/);
  for (const action of [selectStudyTab, closeStudyTab, selectHistoryVisit]) assert.throws(() => action(state, 'missing'), /no longer saved/);
  for (const name of ['', '  ', 'a'.repeat(81), 'line\nbreak']) assert.throws(() => renameStudyTab(state, state.activeTabId, name), /Tab name/);
  assert.deepEqual(state, before);
});

test('passage identity uses edition, source revision and the full range', () => {
  const base = passage();
  assert.equal(passageLabel(base), 'John 3:16–17');
  assert.equal(passageLabel({ ...base, reference: { ...base.reference, endVerse: 16 } }), 'John 3:16');
  assert.equal(samePassage(base, { ...base, bookName: 'Display label', editionName: 'Display edition' }), true);
  for (const changed of [
    { ...base, sourceSha256: 'b'.repeat(64) },
    ...Object.entries({ editionId: 'eng-bsb', bookId: 'ROM', chapter: 4, verse: 15, endVerse: 18 }).map(([key, value]) => ({ ...base, reference: { ...base.reference, [key]: value } })),
  ]) assert.equal(samePassage(base, changed), false);
});

test('session backups canonicalize data, reset storage revision, and never carry unrelated private notes', () => {
  const state = initial();
  const input = { ...state, revision: 9, notes: [{ text: 'private unrelated note' }], token: 'do not retain' };
  input.tabs = [{ ...state.tabs[0], notes: ['tab secret'], passage: { ...passage(), notes: ['passage secret'], reference: { ...passage().reference, extra: 'reference secret' } } }];
  const backup = readingSessionBackup(input);
  assert.doesNotMatch(backup, /secret|private unrelated note|do not retain/);
  const restored = parseReadingSessionBackup(backup);
  assert.deepEqual(restored, state);
  assert.equal(restored.revision, 0);
  assert.notEqual(restored.history, state.history);
  assert.throws(() => parseReadingSessionBackup('{broken'), /valid JSON/);
  assert.throws(() => parseReadingSessionBackup(JSON.stringify(state)), /Choose an Adigun/);
  assert.throws(() => parseReadingSessionBackup(JSON.stringify({ kind: 'adigun-reading-session', version: 2, session: state })), /Choose an Adigun/);
  assert.throws(() => parseReadingSessionBackup('😀'.repeat(Math.ceil(MAX_BACKUP_BYTES / 4) + 1)), /too large/, 'backup limits count UTF-8 bytes');
});

test('malformed session structure, ambiguous passage identity and broken history pointers fail validation', () => {
  const state = initial();
  for (const value of [
    null, [], { ...state, schemaVersion: 2 }, { ...state, revision: -1 }, { ...state, revision: Number.MAX_SAFE_INTEGER },
    { ...state, historyIndex: -1 }, { ...state, historyIndex: 1 }, { ...state, activeTabId: null }, { ...state, activeTabId: 'missing' },
    { ...state, history: [state.history[0], state.history[0]] }, { ...state, tabs: [state.tabs[0], state.tabs[0]] },
    { ...state, history: [{ ...state.history[0], visitedAt: '2026-11-04' }] },
    { ...state, history: [{ ...state.history[0], visitedAt: 'not-a-date' }] },
    { ...state, tabs: [{ ...state.tabs[0], id: '../outside' }] },
    { ...state, tabs: [{ ...state.tabs[0], name: 'bad\u0000name' }] },
    { ...state, history: Array.from({ length: MAX_HISTORY + 1 }, (_, index) => ({ ...state.history[0], id: `visit-${index}` })) },
    { ...state, tabs: Array.from({ length: MAX_TABS + 1 }, (_, index) => ({ ...state.tabs[0], id: `tab-${index}` })) },
  ]) assert.throws(() => validateReadingSession(value));
  for (const source of [
    { ...passage(), sourceSha256: 'unverified' }, { ...passage(), sourceSha256: 'A'.repeat(64) },
    { ...passage(), editionName: '' }, { ...passage(), bookName: 'a'.repeat(101) },
    ...[{ editionId: undefined }, { endVerse: undefined }, { chapter: 0 }, { verse: 0 }, { endVerse: 15 }, { bookId: '../JHN' }].map(change => ({ ...passage(), reference: { ...passage().reference, ...change } })),
  ]) assert.throws(() => validateSavedPassage(source));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyWorkspace, explicitReference, mergeWorkspace, previewImport, validateWorkspace, validDate, workspaceBackup, workspaceNotebook } from '../src/workspace/model.ts';
import { addDays, assessRecall, chapterReferences, clozeParts, completePlanSession, createReadingPlan, dayInTimeZone, reschedulePlan, reviewMemoryCard, scheduleDates } from '../src/workspace/learning.ts';
const ref = { bookId: 'JHN', chapter: 3, verse: 16, editionId: 'eng-web' };
const base = { id: 'fixture-1', createdAt: '2026-11-04T06:00:00.000Z', updatedAt: '2026-11-04T06:00:00.000Z' };
const prayer = { ...base, title: 'Private fixture prayer', text: 'Keep my own wording: àánú.', category: 'Family', tags: ['personal'], refs: [ref], reflection: 'My reflection', outcome: 'My own label', followUp: '2026-11-06', history: [] };
const state = () => ({ ...emptyWorkspace(), prayers: [structuredClone(prayer)] });
const makePlan = () => createReadingPlan({ title: 'Fixture plan', kind: 'custom', refs: [ref, { ...ref, verse: 17 }, { ...ref, verse: 18 }], editionId: 'eng-web', timeZone: 'Europe/Berlin', startDate: '2026-10-23', weekdays: [1, 3, 5], sessionsPerDay: 1 }, new Date(base.createdAt));

test('workspace backup preserves user writing and explicit edition identity; extra input fields are not persisted', () => {
  const current = state(); const imported = previewImport(emptyWorkspace(), workspaceBackup(current));
  assert.deepEqual(imported.incoming, current); assert.deepEqual([imported.added, imported.identical, imported.conflicts], [1, 0, 0]);
  assert.equal(validateWorkspace({ ...current, secretEndpoint: 'not a supported field' }).secretEndpoint, undefined);
  assert.deepEqual(explicitReference({ bookId: 'JHN', chapter: 3, verse: 16 }), ref);
  assert.match(workspaceNotebook(current), /àánú/); assert.match(workspaceNotebook(current), /eng-web/);
});

test('malformed versions, duplicate IDs, omitted editions and invalid dates are rejected before replacing data', () => {
  const invalid = [{ ...state(), schemaVersion: 2 }, { ...state(), revision: -1 }, { ...state(), prayers: [prayer, prayer] }, { ...state(), prayers: [{ ...prayer, refs: [{ bookId: 'JHN', chapter: 3, verse: 16 }] }] }, { ...state(), prayers: [{ ...prayer, followUp: '2026-02-30' }] }, { ...state(), prayers: [{ ...prayer, followUp: '2026-99-99' }] }, { ...state(), prayers: [{ ...prayer, refs: [{ ...ref, editionId: '../private' }] }] }];
  for (const value of invalid) assert.throws(() => validateWorkspace(value));
  assert.equal(validDate('2026-02-29'), false); assert.equal(validDate('2028-02-29'), true); assert.equal(validDate('2026-99-99'), false);
  assert.throws(() => previewImport(state(), '{broken'), /valid JSON/);
  assert.throws(() => previewImport(state(), JSON.stringify({ schemaVersion: 1, bookmarks: [] })), /reader backup/);
});

test('import preview distinguishes identical records and conflicts; explicit conflict policy preserves untouched records', () => {
  const current = state(); const duplicate = previewImport(current, workspaceBackup(current)); assert.equal(duplicate.identical, 1);
  const incoming = { ...state(), prayers: [{ ...prayer, text: 'Imported revision' }, { ...prayer, id: 'new-entry' }] };
  const before = structuredClone([current, incoming]); const preview = previewImport(current, workspaceBackup(incoming));
  assert.deepEqual([preview.added, preview.identical, preview.conflicts], [1, 0, 1]);
  assert.equal(mergeWorkspace(current, incoming).prayers[0].text, prayer.text);
  assert.equal(mergeWorkspace(current, incoming, 'use-import').prayers[0].text, 'Imported revision');
  assert.equal(mergeWorkspace(current, incoming).prayers.length, 2); assert.deepEqual([current, incoming], before);
});

test('calendar scheduling survives DST and preserves the user-selected local day', () => {
  assert.equal(dayInTimeZone(new Date('2026-11-04T23:30:00Z'), 'Europe/Berlin'), '2026-11-05');
  assert.equal(dayInTimeZone(new Date('2026-11-04T00:30:00Z'), 'America/New_York'), '2026-11-03');
  assert.equal(addDays('2026-10-24', 1), '2026-10-25');
  assert.deepEqual(scheduleDates('2026-10-23', [1, 3, 5], 1, 4), ['2026-10-23', '2026-10-26', '2026-10-28', '2026-10-30']);
  assert.deepEqual(scheduleDates('2026-10-23', [5], 2, 3), ['2026-10-23', '2026-10-23', '2026-10-30']);
  for (const args of [['2026-10-23', [], 1, 2], ['2026-10-23', [7], 1, 2], ['2026-10-23', [1], 0, 2], ['2026-02-30', [1], 1, 2]]) assert.throws(() => scheduleDates(...args));
});

test('rescheduling and reopening sessions retain completion history and completed dates', () => {
  const completed = completePlanSession(makePlan(), 'session-1', true, new Date('2026-10-24T10:00:00Z'));
  const moved = reschedulePlan(completed, '2026-11-04', [3, 5], 1);
  assert.deepEqual(moved.sessions[0], completed.sessions[0]); assert.equal(moved.sessions[1].scheduledDate, '2026-11-04'); assert.equal(moved.sessions[2].scheduledDate, '2026-11-06');
  const reopened = completePlanSession(moved, 'session-1', false); assert.equal(reopened.sessions[0].completedAt, undefined); assert.deepEqual(reopened.history.map(x => x.action), ['completed', 'reopened']);
  assert.equal(validateWorkspace({ ...emptyWorkspace(), plans: [reopened] }).plans[0].history.length, 2);
});

test('plan generation uses supplied book bounds and prevents source-edition substitution', () => {
  const books = [{ id: 'GEN', chapters: 2, verseCounts: [31, 25] }, { id: 'MAT', chapters: 1, verseCounts: [25] }, { id: 'JHN', chapters: 1, verseCounts: [51] }];
  const refs = chapterReferences(books, 'deu1912', 'gospels'); assert.equal(refs.length, 2); assert.equal(refs[1].endVerse, 51); assert.ok(refs.every(r => r.editionId === 'deu1912'));
  assert.throws(() => createReadingPlan({ title: 'Wrong edition', kind: 'custom', refs: [ref], editionId: 'deu1912', timeZone: 'Europe/Berlin', startDate: '2026-11-04', weekdays: [3], sessionsPerDay: 1 }), /selected edition/);
});

test('spaced review schedules are private self-assessment and retain earlier reviews after a lapse', () => {
  let card = { ...base, ref, timeZone: 'Europe/Berlin', dueDate: '2026-11-04', intervalDays: 0, successfulReviews: 0, lapses: 0, contextNotes: '', history: [] };
  card = reviewMemoryCard(card, 'good', new Date('2026-11-04T23:30:00Z')); assert.equal(card.dueDate, '2026-11-06'); assert.equal(card.intervalDays, 1);
  card = reviewMemoryCard(card, 'good', new Date('2026-11-06T12:00:00Z')); assert.equal(card.intervalDays, 3);
  card = reviewMemoryCard(card, 'again', new Date('2026-11-09T12:00:00Z')); assert.equal(card.intervalDays, 1); assert.equal(card.successfulReviews, 0); assert.equal(card.history.length, 3); assert.equal(card.lapses, 1);
});

test('recitation compares exact edition words in sequence while preserving diacritics and distinguishing additions', () => {
  assert.deepEqual(assessRecall('Àánú, love and hope.', 'ÀÁNÚ love and hope!'), { matched: 4, expected: 4, missing: 0, extra: 0, accuracy: 100 });
  assert.deepEqual(assessRecall('love and hope', 'love bright hope'), { matched: 2, expected: 3, missing: 1, extra: 1, accuracy: 67 });
  assert.equal(assessRecall('Àánú', 'Aanu').accuracy, 0); assert.equal(assessRecall('hope love', 'love hope').matched, 1);
  assert.equal(clozeParts('One, two three four five.').map(p => p.text).join(''), 'One, two three four five.'); assert.equal(clozeParts('One, two three four five.').filter(p => p.gap !== undefined).length, 2);
});

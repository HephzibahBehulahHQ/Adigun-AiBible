import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkReadingSessionSources, resolveReadingPassage } from '../src/reading-session/source-core.ts';
import { addStudyTab, emptyReadingSession, recordReadingVisit, validateReadingSession } from '../src/reading-session/model.ts';

const json = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const fixtures = Object.fromEntries(['eng-web', 'eng-bsb'].map(edition => {
  const root = edition === 'eng-web' ? '../data' : `../data/editions/${edition}`;
  return [edition, { manifest: json(`${root}/manifest.json`), books: { JHN: json(`${root}/books/JHN.json`), GEN: json(`${root}/books/GEN.json`) } }];
}));
const reference = (editionId = 'eng-web', overrides = {}) => ({ editionId, bookId: 'JHN', chapter: 3, verse: 16, endVerse: 17, ...overrides });
const saved = (edition = 'eng-web', overrides = {}) => ({
  reference: reference(edition, overrides), sourceSha256: fixtures[edition].manifest.edition.sha256,
  editionName: fixtures[edition].manifest.edition.name, bookName: fixtures[edition].books[overrides.bookId || 'JHN'].name,
});
function sources() {
  const calls = { manifests: [], books: [] };
  return { calls,
    async getManifest(edition) {
      calls.manifests.push(edition);
      if (!fixtures[edition]) throw new Error('Requested source is not installed.');
      return fixtures[edition].manifest;
    },
    async getBook(book, edition) {
      calls.books.push(`${edition}:${book}`);
      const result = fixtures[edition]?.books[book];
      if (!result) throw new Error('Requested source book is unavailable offline.');
      return result;
    },
  };
}
function session() {
  let state = recordReadingVisit(emptyReadingSession(), saved(), 'web-visit', '2026-11-04T13:00:00.000Z', 'web-tab');
  state = addStudyTab(state, saved('eng-bsb'), 'berean-tab');
  state = recordReadingVisit(state, saved('eng-bsb'), 'berean-visit', '2026-11-04T13:01:00.000Z', 'unused-tab');
  return validateReadingSession(state);
}

test('real installed editions resolve full ranges with explicit source identity and fresh display names', async () => {
  for (const edition of ['eng-web', 'eng-bsb']) {
    const reader = sources();
    const result = await resolveReadingPassage(reference(edition), reader);
    assert.deepEqual(result, saved(edition));
    assert.deepEqual(reader.calls, { manifests: [edition], books: [`${edition}:JHN`] });
    assert.equal(result.sourceSha256.length, 64);
  }
  const reader = sources();
  const normalized = await resolveReadingPassage({ bookId: 'JHN', chapter: 3, verse: 16 }, reader);
  assert.deepEqual(normalized.reference, reference('eng-web', { endVerse: 16 }));
});

test('an already loaded matching manifest avoids a redundant manifest request but still verifies actual wording', async () => {
  const reader = sources();
  assert.deepEqual(await resolveReadingPassage(reference('eng-bsb'), reader, fixtures['eng-bsb'].manifest), saved('eng-bsb'));
  assert.deepEqual(reader.calls, { manifests: [], books: ['eng-bsb:JHN'] });
  const different = sources();
  await resolveReadingPassage(reference('eng-bsb'), different, fixtures['eng-web'].manifest);
  assert.deepEqual(different.calls.manifests, ['eng-bsb'], 'a different loaded edition cannot substitute for the requested source');
});

test('stale revisions, wrong editions and out-of-range references refuse before reading a source book', async () => {
  const stale = sources();
  await assert.rejects(resolveReadingPassage(reference(), stale, undefined, '0'.repeat(64)), /saved source revision is unavailable/);
  assert.deepEqual(stale.calls.books, []);
  const wrong = sources();
  wrong.getManifest = async () => fixtures['eng-bsb'].manifest;
  await assert.rejects(resolveReadingPassage(reference(), wrong), /unavailable in the selected edition/);
  assert.deepEqual(wrong.calls.books, []);
  for (const change of [{ chapter: 22 }, { verse: 37, endVerse: 37 }, { verse: 0 }, { verse: 17, endVerse: 16 }, { bookId: 'ZZZ' }]) {
    const reader = sources();
    await assert.rejects(resolveReadingPassage(reference('eng-web', change), reader), /unavailable in the selected edition/);
    assert.deepEqual(reader.calls.books, []);
  }
  const unsigned = structuredClone(fixtures['eng-web'].manifest);
  delete unsigned.edition.sha256;
  const reader = sources();
  await assert.rejects(resolveReadingPassage(reference(), reader, unsigned), /saved source revision is unavailable/);
  assert.deepEqual(reader.calls.books, []);
});

test('missing, duplicate, blank and out-of-order source verses cannot appear as a valid saved range', async () => {
  for (const damage of [
    chapter => { chapter.verses = chapter.verses.filter(verse => verse.number !== 17); },
    chapter => { chapter.verses.find(verse => verse.number === 17).text = ' \n '; },
    chapter => { chapter.verses.push(structuredClone(chapter.verses.find(verse => verse.number === 16))); },
    chapter => { chapter.verses.reverse(); },
  ]) {
    const book = structuredClone(fixtures['eng-bsb'].books.JHN);
    damage(book.chapters.find(chapter => chapter.number === 3));
    await assert.rejects(resolveReadingPassage(reference('eng-bsb'), { ...sources(), getBook: async () => book }), /missing source wording/);
  }
  const missingChapter = structuredClone(fixtures['eng-web'].books.JHN);
  missingChapter.chapters = missingChapter.chapters.filter(chapter => chapter.number !== 3);
  await assert.rejects(resolveReadingPassage(reference(), { ...sources(), getBook: async () => missingChapter }), /chapter is unavailable/);
  await assert.rejects(resolveReadingPassage(reference(), { ...sources(), getBook: async () => fixtures['eng-web'].books.GEN }), /chapter is unavailable/);
});

test('multi-edition restore checks all passages, reuses each installed source, and replaces untrusted display labels', async () => {
  const state = session();
  for (const entry of [...state.history, ...state.tabs]) {
    entry.passage.editionName = 'Untrusted backup edition';
    entry.passage.bookName = 'Untrusted backup book';
  }
  const before = structuredClone(state);
  const reader = sources();
  const restored = await checkReadingSessionSources(state, reader);
  assert.deepEqual(restored, session());
  assert.deepEqual(state, before, 'validation does not mutate an imported backup in place');
  assert.deepEqual(reader.calls.manifests, ['eng-web', 'eng-bsb']);
  assert.deepEqual(reader.calls.books, ['eng-web:JHN', 'eng-bsb:JHN']);
  assert.equal(restored.activeTabId, 'berean-tab');
  assert.equal(restored.historyIndex, 1);
});

test('a restored tab cannot hide an unavailable revision or book behind otherwise valid history', async () => {
  const state = session();
  const oldRevision = structuredClone(state);
  oldRevision.tabs[1].passage.sourceSha256 = '0'.repeat(64);
  const before = structuredClone(oldRevision);
  await assert.rejects(checkReadingSessionSources(oldRevision, sources()), /saved source revision is unavailable/);
  assert.deepEqual(oldRevision, before);
  const absentBook = structuredClone(state);
  absentBook.tabs[1].passage = saved('eng-bsb', { bookId: 'GEN', chapter: 1, verse: 1, endVerse: 2 });
  const reader = sources();
  const getBook = reader.getBook;
  reader.getBook = async (book, edition) => {
    if (book === 'GEN') throw new Error('Requested source book is unavailable offline.');
    return getBook(book, edition);
  };
  await assert.rejects(checkReadingSessionSources(absentBook, reader), /unavailable offline/);
  assert.deepEqual(state, session(), 'failed validation cannot replace the existing session');
});

test('offline restore succeeds for available local sources and reports a missing local source without fallback', async () => {
  const state = session();
  const localOnly = sources();
  assert.deepEqual(await checkReadingSessionSources(state, localOnly), state);
  const offline = sources();
  offline.getManifest = async edition => {
    if (edition === 'eng-bsb') throw new Error('This edition is not available offline.');
    return fixtures[edition].manifest;
  };
  await assert.rejects(checkReadingSessionSources(state, offline), /not available offline/);
  assert.deepEqual(offline.calls.books, ['eng-web:JHN'], 'a missing edition is never replaced with another edition');
});

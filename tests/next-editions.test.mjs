import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateEditionRightsRegister, decideEditionOperation } from '../src/edition-rights.ts';
import { emptyStudy, validateReference } from '../src/domain.ts';
import { assertCompletePassage } from '../src/print.ts';
import { publisherSpeeches } from '../src/speakers/model.ts';
import { buildNotebook } from '../src/notebook.ts';

const expected = {
  'fra-darby2024': { provider: 'frajnd', language: 'fr', records: 31170, empty: 3, files: 70, sha: 'dbda2c381fd0cbf2bf0f65dac2052db6f728908a8b50a7518fd5ba8c9711dc60' },
  'spa-simple2026': { provider: 'spabes', language: 'es-419', records: 31102, empty: 0, files: 70, sha: 'b5397717e5031db82ce6c595ae1d3803626aaa3d11ce8750b31d5d766b3568e1' },
  'tdx-tandroy': { provider: 'tdx', language: 'tdx', records: 31081, empty: 6, files: 71, sha: 'ca352f5888aa64896069f57cea898abadb3f2f851a1d4f555ab088b2a601e960' },
};
const root = new URL('../data/editions/', import.meta.url);
const bytes = path => readFileSync(new URL(path, root));
const read = path => JSON.parse(bytes(path));
const hash = value => createHash('sha256').update(value).digest('hex');
const pythonCommand = process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
const manifest = id => read(id + '/manifest.json');
const book = (id, bookId) => read(id + '/books/' + bookId + '.json');
const chapter = (id, bookId, number) => book(id, bookId).chapters.find(row => row.number === number);
const baseline = JSON.parse(readFileSync(new URL('../data/manifest.json', import.meta.url)));
const catalog = read('catalog.json');
const editions = [baseline.edition, ...catalog.editions.filter(row => row.corpus === 'bible')];

for (const [id, pin] of Object.entries(expected)) {
  test(id + ' retains every pinned artifact and reconstructs its complete source index', () => {
    const metadata = catalog.editions.find(row => row.id === id);
    const source = manifest(id), provenance = read(id + '/provenance.json');
    assert.equal(metadata.providerId, pin.provider);
    assert.equal(metadata.language, pin.language);
    assert.deepEqual(Intl.getCanonicalLocales(metadata.language), [pin.language]);
    assert.equal(metadata.sha256, pin.sha);
    assert.equal(provenance.archiveSha256, pin.sha);
    assert.deepEqual(source.edition, metadata);
    assert.deepEqual(source.totals, { books: 66, chapters: 1189, verses: pin.records });
    assert.deepEqual(metadata.totals, source.totals);
    assert.equal(provenance.displayTextMember, pin.provider + '_vpl.txt');
    assert.equal(provenance.languageEvidence.languageTag, pin.language);
    assert.equal(provenance.sourceNoticeRawFile, 'SOURCE_NOTICE.html.txt');
    assert.equal(hash(bytes(id + '/SOURCE_NOTICE.html.txt')), provenance.members[pin.provider + '_about.htm']);
    assert.ok(bytes(id + '/NOTICE.txt').toString().includes(metadata.licenseUrl));
    assert.equal(Object.keys(provenance.generatedFileSha256).length, pin.files);
    const rows = [], omitted = [], empty = [];
    for (const entry of source.books) {
      const value = book(id, entry.id);
      assert.equal(value.id, entry.id);
      assert.equal(value.chapters.length, entry.chapters);
      for (const [index, section] of value.chapters.entries()) {
        const numbers = section.verses.map(verse => verse.number);
        assert.equal(section.number, index + 1);
        assert.deepEqual(numbers, [...new Set(numbers)].sort((a, b) => a - b));
        assert.equal(Math.max(...numbers), entry.verseCounts[index]);
        assert.equal(numbers.length, entry.verseRecordCounts[index]);
        const gaps = Array.from({ length: Math.max(...numbers) }, (_, offset) => offset + 1).filter(number => !numbers.includes(number));
        if (gaps.length) omitted.push({ bookId: entry.id, chapter: section.number, verseNumbers: gaps });
        for (const verse of section.verses) {
          rows.push({ bookId: entry.id, chapter: section.number, verse: verse.number, text: verse.text, editionId: id });
          if (verse.text === '') empty.push({ bookId: entry.id, chapter: section.number, verse: verse.number });
        }
      }
    }
    assert.equal(rows.length, pin.records);
    assert.equal(empty.length, pin.empty);
    assert.deepEqual(empty, provenance.emptySourceRecords);
    assert.deepEqual(omitted, provenance.omittedNumberedPositions);
    // Fresh clones omit this derived index; rebuild it from every actual source record.
    assert.equal(hash(JSON.stringify(rows) + '\n'), provenance.generatedFileSha256['search-index.json']);
    for (const [path, digest] of Object.entries(provenance.generatedFileSha256)) {
      if (path === 'search-index.json' && !existsSync(new URL(id + '/' + path, root))) continue;
      assert.equal(hash(bytes(id + '/' + path)), digest, id + '/' + path);
    }
    const acquired = read('acquisition-catalog.json').records.find(row => row.providerId === pin.provider);
    assert.equal(acquired.installedEditionId, id);
    assert.equal(acquired.installedSourceSha256, pin.sha);
    assert.equal(acquired.coverage, 'validated-full-bible');
  });
}

test('the installed inventory counts distinct source languages, editions and regional tags accurately', () => {
  assert.equal(editions.length, 32);
  assert.equal(new Set(editions.map(row => row.id)).size, 32);
  const original = new Set(['eng-web', 'deu1912', 'yor']);
  assert.equal(editions.filter(row => !original.has(row.id)).length, 29);
  assert.equal(new Set(editions.map(row => row.language)).size, 21);
  assert.equal(new Set(editions.map(row => new Intl.Locale(row.language).language)).size, 20);
  assert.equal(new Intl.Locale(manifest('spa-simple2026').edition.language).language, 'es');
  assert.equal(Object.values(expected).reduce((total, row) => total + row.records, 0) + manifest('eng-douay-rheims1899').totals.verses + manifest('hat-1985').totals.verses, 160266);
  const french = manifest('fra-darby2024').edition;
  assert.match(french.name, /BPC 2024/);
  assert.match(french.revision, /Not the distinct 2026 revised edition/);
  assert.ok(french.conditions.some(condition => condition.includes('2026 revised edition is CC BY-NC-ND and is not imported')));
});

test('all 32 publisher inventories identify the current revision and match real source metadata', () => {
  const coverage = JSON.parse(readFileSync(new URL('../data/speakers/publisher-coverage.json', import.meta.url)));
  assert.equal(coverage.editions.length, 32);
  assert.deepEqual(coverage.editions.map(row => row.editionId).sort(), editions.map(row => row.id).sort());
  for (const edition of editions) {
    const entry = coverage.editions.find(row => row.editionId === edition.id);
    const source = edition.id === 'eng-web' ? baseline : manifest(edition.id);
    assert.equal(entry.sourceSha256, edition.sha256, edition.id);
    assert.equal(entry.status, 'publisher-metadata');
    assert.deepEqual(entry.books.map(row => row.bookId), source.books.map(row => row.id));
    assert.equal(entry.totalSpans, entry.books.reduce((total, row) => total + row.spans, 0));
    assert.equal(entry.totalVerses, entry.books.reduce((total, row) => total + row.verses, 0));
    if (!expected[edition.id]) continue;
    for (const row of entry.books) {
      const actual = publisherSpeeches(book(edition.id, row.bookId), edition);
      assert.equal(row.spans, actual.speeches.length);
      assert.equal(row.verses, new Set(actual.speeches.map(speech => speech.reference.chapter + ':' + speech.reference.verse)).size);
      assert.equal(row.rejectedMetadata, actual.issues.length);
    }
  }
});

test('licensed text uses stay revision-bound and do not grant recordings or Tandroy model training', () => {
  const rights = validateEditionRightsRegister(read('rights-register.json'));
  for (const [id, pin] of Object.entries(expected)) {
    const row = rights.editions.find(entry => entry.editionId === id);
    const context = { today: '2026-11-05', sourceSha256: pin.sha };
    for (const operation of ['display', 'offline', 'searchIndex', 'documentExport', 'redistribution', 'peerSharing']) {
      const decision = decideEditionOperation(row, operation, context);
      assert.equal(decision.allowed, true, id + ':' + operation);
      assert.deepEqual(decision.conditions, manifest(id).edition.conditions);
    }
    assert.equal(row.operations.recordedAudio.state, 'unknown');
    assert.equal(decideEditionOperation(row, 'recordedAudio', context).allowed, false);
    assert.equal(decideEditionOperation(row, 'display', { ...context, sourceSha256: '0'.repeat(64) }).allowed, false);
    assert.equal(decideEditionOperation({ ...row, withdrawn: true }, 'offline', context).allowed, false);
    assert.equal(decideEditionOperation({ ...row, expiresOn: '2026-11-04' }, 'documentExport', context).allowed, false);
    assert.equal(decideEditionOperation({ ...row, territory: { scope: 'unknown', countries: [] } }, 'display', context).allowed, false);
    assert.equal(decideEditionOperation({ ...row, aiProductUse: { ...row.aiProductUse, state: 'unknown' } }, 'display', { ...context, aiProductEnabled: true }).allowed, false);
  }
  const tandroy = rights.editions.find(row => row.editionId === 'tdx-tandroy');
  assert.equal(tandroy.operations.modelTraining.state, 'unknown');
  assert.equal(decideEditionOperation(tandroy, 'modelTraining', { sourceSha256: expected['tdx-tandroy'].sha, aiProductEnabled: true }).allowed, false);
  assert.equal(tandroy.publicationStatus, 'publisher-draft');
  const edition = manifest('tdx-tandroy').edition;
  assert.equal(edition.license, 'CC BY-SA 4.0');
  assert.equal(edition.licenseDeedUrl, 'https://creativecommons.org/licenses/by-sa/4.0/');
  assert.match(edition.attribution, /Copyright © 2023 Steve Lellelid/);
  assert.match(bytes('tdx-tandroy/NOTICE.txt').toString(), /DRAFT VERSION/);
  assert.ok(tandroy.conditions.some(condition => /indication of changes and share-alike/.test(condition)));
});

test('publisher chapter numbering, empty verses and absent positions remain distinct in reader and export validation', () => {
  for (const id of ['fra-darby2024', 'tdx-tandroy']) {
    const source = manifest(id);
    assert.deepEqual(source.books.find(row => row.id === 'JOL').verseCounts, [20, 27, 5, 21]);
    assert.deepEqual(source.books.find(row => row.id === 'MAL').verseCounts, [14, 17, 24]);
    assert.equal(validateReference({ bookId: 'JOL', chapter: 4, verse: 21, editionId: id }, source.books, id), true);
    assert.equal(validateReference({ bookId: 'JOL', chapter: 4, verse: 22, editionId: id }, source.books, id), false);
    assert.equal(validateReference({ bookId: 'MAL', chapter: 3, verse: 24, editionId: id }, source.books, id), true);
    assert.equal(validateReference({ bookId: 'MAL', chapter: 4, verse: 1, editionId: id }, source.books, id), false);
  }
  const spanish = manifest('spa-simple2026');
  assert.equal(validateReference({ bookId: 'JOL', chapter: 4, verse: 1, editionId: 'spa-simple2026' }, spanish.books, 'spa-simple2026'), false);
  assert.equal(validateReference({ bookId: 'MAL', chapter: 4, verse: 6, editionId: 'spa-simple2026' }, spanish.books, 'spa-simple2026'), true);
  const french = chapter('fra-darby2024', 'ACT', 8).verses.filter(row => row.number >= 36 && row.number <= 38);
  assert.deepEqual(french.map(row => row.number), [36, 37, 38]);
  assert.equal(french[1].text, '');
  assert.throws(() => assertCompletePassage(french, { verse: 36, endVerse: 38 }), /missing source wording/);
  const tandroy = chapter('tdx-tandroy', '2SA', 13).verses.filter(row => row.number >= 2 && row.number <= 4);
  assert.deepEqual(tandroy.map(row => row.number), [2, 4]);
  assert.throws(() => assertCompletePassage(tandroy, { verse: 2, endVerse: 4 }), /missing source wording/);
  assert.doesNotThrow(() => assertCompletePassage([tandroy[0]], { verse: 2 }));
});

test('a Tandroy notebook retains exact wording and its draft, attribution, license and share-alike conditions', async () => {
  const id = 'tdx-tandroy', source = manifest(id), john = book(id, 'JHN');
  const ref = { bookId: 'JHN', chapter: 3, verse: 16, editionId: id };
  const text = john.chapters.find(row => row.number === 3).verses.find(row => row.number === 16).text;
  const notebook = await buildNotebook({ ...emptyStudy(), bookmarks: [ref] }, {
    manifest: async editionId => { assert.equal(editionId, id); return source; },
    book: async (bookId, editionId) => { assert.equal(bookId, 'JHN'); assert.equal(editionId, id); return john; },
  });
  assert.ok(notebook.includes('> 16. ' + text));
  assert.ok(notebook.includes(source.edition.name));
  assert.ok(notebook.includes(source.edition.attribution));
  assert.ok(notebook.includes(source.edition.licenseDeedUrl));
  for (const condition of source.edition.conditions) assert.ok(notebook.includes(condition), condition);
});

test('source comparison rejects changed exception receipts, Unicode normalization and source pins', () => {
  execFileSync(pythonCommand, ['-B', fileURLToPath(new URL('./next_edition_checks.py', import.meta.url))], { stdio: 'pipe' });
});

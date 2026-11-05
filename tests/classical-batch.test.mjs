import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateEditionRightsRegister, decideEditionOperation } from '../src/edition-rights.ts';

const expected = {
  'fra-ostervald': ['fra_fob', 'fr', 'Latn', 'ltr', 31107, 'db393ba4b0a91b4f631b35b0d27ba796514ff84182de06997669f4a14da52b21'],
  'epo-londona': ['epo', 'eo', 'Latn', 'ltr', 31102, '2e2859611073a1a023f92e1fd279078f5cedc5f4d97659fc2f8f84945450301d'],
  'arb-vandyck': ['arb-vd', 'ar', 'Arab', 'rtl', 31104, '070404da2e13e641b7550b50d7e777480b2cc2667e9669f2194d909ca04cd68a'],
  'mya-judson1840': ['myajvb', 'my', 'Mymr', 'ltr', 31102, 'bbbabb35e8373c718a3eb1af4e30ba5efeadd08fc047abde644709bdd7951adf'],
  'nld-1917': ['nld', 'nl', 'Latn', 'ltr', 31102, '1b725d623e86e639516b59cc9c292184066f2b2ca58df2e500f2878883dc3938'],
  'haw-1868': ['haw1868', 'haw', 'Latn', 'ltr', 31102, 'ed5a6d757d6532bc8a1cce2016c7ff53e7d9c9e0176c502261557e8de0fd85dc'],
  'rus-synodal': ['russyn', 'ru', 'Cyrl', 'ltr', 31169, 'e8f12f3f3e5856a859034ac5614a8a67d112c7afa59c2af9f42be46e45d68198'],
  'ukr-kulish1905': ['ukr1871', 'uk', 'Cyrl', 'ltr', 31082, 'd1913e04db9f4e2fc3405a98e40a9358ef332ac9b463d0d2e8aeb0b6b90d7014'],
  'vie-cadman': ['vie1934', 'vi', 'Latn', 'ltr', 31102, '54a1c70f875ac5c4315259665d7e1ad153b3b90f28a3a868db9cbd4c56e6e1d0'],
  'srp-danicic-karadzic': ['srp1868', 'sr-Cyrl', 'Cyrl', 'ltr', 31111, '40f38bfe0af0a6df4f31d2873cc76902caf576b3f54217d2c86adee6d57e196b'],
  'ton-revised-west': ['ton', 'to', 'Latn', 'ltr', 31102, '24cea17bdf324d7f59ea40367e6340a3b52f8d0157dcd68c6dc55df3302bb5fb'],
  'eng-geneva1599': ['enggnv', 'en', 'Latn', 'ltr', 31090, 'faa35b12d04bdacda78b5b53b35bc241d576c63e5d6cd5bccd99bb337b8f7ade'],
};
const root = new URL('../data/editions/', import.meta.url);
const bytes = path => readFileSync(new URL(path, root));
const read = path => JSON.parse(bytes(path));
const hash = value => createHash('sha256').update(value).digest('hex');

test('twelve distinct source editions preserve exact pins, complete notices, language evidence and every source record', () => {
  const catalog = read('catalog.json');
  const acquisition = read('acquisition-catalog.json');
  const textDigests = new Set();
  let total = 0;
  for (const [id, [provider, language, script, direction, verses, archiveSha]] of Object.entries(expected)) {
    const edition = catalog.editions.find(row => row.id === id);
    assert.ok(edition, id);
    assert.equal(edition.providerId, provider);
    assert.equal(edition.sha256, archiveSha);
    assert.equal(edition.language, language);
    assert.deepEqual(Intl.getCanonicalLocales(language), [language]);
    assert.equal(edition.script, script);
    assert.equal(edition.direction, direction);
    assert.ok(edition.nativeTitle.length > 0);
    assert.match(edition.sourceNoticeDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.deepEqual(edition.totals, { books: 66, chapters: 1189, verses });
    const manifest = read(`${id}/manifest.json`);
    const provenance = read(`${id}/provenance.json`);
    assert.deepEqual(manifest.edition, edition);
    assert.equal(provenance.archiveSha256, archiveSha);
    assert.equal(provenance.displayTextMember, `${provider}_vpl.txt`);
    assert.equal(provenance.sourceNoticeRawFile, 'SOURCE_NOTICE.html.txt');
    assert.equal(hash(bytes(`${id}/SOURCE_NOTICE.html.txt`)), provenance.members[`${provider}_about.htm`]);
    assert.match(bytes(`${id}/NOTICE.txt`).toString(), /Public Domain/);
    assert.ok(bytes(`${id}/NOTICE.txt`).toString().includes(edition.licenseUrl));
    assert.equal(provenance.languageEvidence.languageTag, language);
    assert.equal(provenance.languageEvidence.direction, direction);
    assert.equal(provenance.languageEvidence.registryFileDate, '2026-09-17');
    assert.equal(provenance.languageEvidence.registryUrl, 'https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry');
    if (direction === 'rtl') assert.ok(provenance.languageEvidence.sourceLetterBidiCounts.AL > 0);
    const rows = [];
    for (const bookMeta of manifest.books) {
      const book = read(`${id}/books/${bookMeta.id}.json`);
      assert.equal(book.id, bookMeta.id);
      assert.equal(book.chapters.length, bookMeta.chapters);
      for (const [index, chapter] of book.chapters.entries()) {
        const numbers = chapter.verses.map(verse => verse.number);
        assert.equal(chapter.number, index + 1);
        assert.deepEqual(numbers, [...new Set(numbers)].sort((a, b) => a - b));
        assert.equal(Math.max(...numbers), bookMeta.verseCounts[index]);
        assert.equal(numbers.length, bookMeta.verseRecordCounts[index]);
        for (const verse of chapter.verses) rows.push({ bookId: book.id, chapter: chapter.number, verse: verse.number, text: verse.text, editionId: id });
      }
    }
    assert.equal(rows.length, verses);
    const rebuilt = `${JSON.stringify(rows)}\n`;
    assert.equal(hash(rebuilt), provenance.generatedFileSha256['search-index.json'], `${id}: offline index reconstruction`);
    for (const [path, digest] of Object.entries(provenance.generatedFileSha256)) {
      // Derived indexes need not exist before prepare-content in a fresh clone.
      if (path === 'search-index.json' && !existsSync(new URL(`${id}/${path}`, root))) continue;
      assert.equal(hash(bytes(`${id}/${path}`)), digest, `${id}/${path}`);
    }
    const semanticDigest = hash(`${JSON.stringify(rows.map(({ editionId: ignored, ...row }) => row))}\n`);
    assert.ok(!textDigests.has(semanticDigest), `${id}: duplicate source corpus`);
    textDigests.add(semanticDigest);
    const acquired = acquisition.records.find(row => row.providerId === provider);
    assert.equal(acquired.installedEditionId, id);
    assert.equal(acquired.installedSourceSha256, archiveSha);
    assert.equal(acquired.coverage, 'validated-full-bible');
    total += verses;
  }
  assert.equal(total, 373275);
  assert.equal(textDigests.size, 12);
});

test('new source operations are revision-bound and deny recordings, withdrawal, unknown territory and expiry', () => {
  const register = validateEditionRightsRegister(read('rights-register.json'));
  for (const [id, [, , , , , archiveSha]] of Object.entries(expected)) {
    const row = register.editions.find(value => value.editionId === id);
    const context = { sourceSha256: archiveSha };
    for (const operation of ['display', 'offline', 'searchIndex', 'documentExport', 'redistribution', 'tts']) {
      assert.equal(decideEditionOperation(row, operation, context).allowed, true, `${id}:${operation}`);
      assert.ok(row.operations[operation].evidenceIds.includes(`${id}-pd`));
      assert.ok(row.operations[operation].evidenceIds.includes('ebible-pd-uses'));
    }
    assert.equal(row.operations.recordedAudio.state, 'unknown');
    assert.equal(decideEditionOperation(row, 'recordedAudio', context).allowed, false);
    assert.equal(decideEditionOperation(row, 'display', { sourceSha256: '0'.repeat(64) }).allowed, false);
    assert.equal(decideEditionOperation({ ...row, withdrawn: true }, 'display', context).allowed, false);
    assert.equal(decideEditionOperation({ ...row, expiresOn: '2000-01-01' }, 'display', context).allowed, false);
    assert.equal(decideEditionOperation({ ...row, territory: { scope: 'unknown', countries: [] } }, 'display', context).allowed, false);
    assert.ok(row.conditions.some(condition => condition.includes('not independent worldwide legal or human editorial approval')));
  }
});

test('source-specific formatting receipts and failed candidates remain bounded and honest', () => {
  const counts = { 'epo-londona': 2, 'haw-1868': 39, 'ukr-kulish1905': 2, 'ton-revised-west': 1238 };
  for (const id of Object.keys(expected)) {
    const provenance = read(`${id}/provenance.json`);
    assert.equal(provenance.publisherBracketFormatDifferences.length, counts[id] ?? 0);
    assert.equal(hash(`${JSON.stringify(provenance.publisherBracketFormatDifferences)}\n`), provenance.publisherBracketInventorySha256);
  }
  const tongan = read('ton-revised-west/provenance.json');
  assert.equal(tongan.publisherBracketPaddingExceptions.length, 1);
  assert.deepEqual(Object.fromEntries(['bookId', 'chapter', 'verse'].map(key => [key, tongan.publisherBracketPaddingExceptions[0][key]])), { bookId: 'MRK', chapter: 13, verse: 3 });
  const evidence = read('ton-revised-west/FORMAT_EVIDENCE.json');
  assert.equal(evidence.archiveSha256, 'd217d40dd70eafcd31c6531dd5bc9ea08c84e66d57164977cc1fb822d3af1d6d');
  assert.equal(evidence.memberSha256, '93ab55a0188882ec870dc996d8466994c0920cad896ea8850cc64c91a84e6cbb');
  assert.ok(evidence.sourceExcerpt.includes('\\add ʻo pehē! \\add*'));
  const catalog = read('catalog.json');
  const acquisition = read('acquisition-catalog.json');
  for (const provider of ['ita1927', 'pesOPV', 'kor']) {
    assert.ok(!catalog.editions.some(row => row.providerId === provider));
    const record = acquisition.records.find(row => row.providerId === provider);
    assert.equal(record.installedEditionId, null);
    assert.equal(record.sourceReview.state, 'deferred');
    assert.ok(record.sourceReview.reasons.length > 0);
  }
});

test('importer comparison and raw notice preservation reject source changes without broad normalization', () => {
  execFileSync('python3', ['-B', fileURLToPath(new URL('./classical-batch_checks.py', import.meta.url))], { stdio: 'pipe' });
});

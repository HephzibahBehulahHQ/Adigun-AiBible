import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { validateEditionRightsRegister, decideEditionOperation } from '../src/edition-rights.ts';

const counts = { 'eng-ylt': 31102, 'eng-dby': 31099, 'eng-webster': 31102, 'fra-lsg1910': 31170,
  'spa-rv1909': 31102, 'deu-elberfelder1905': 31102, 'deu-textbibel1906': 31157,
  'ces-kralicka1613': 31172, 'ita-diodati1885': 31095 };
const read = path => JSON.parse(readFileSync(new URL(`../data/editions/${path}`, import.meta.url), 'utf8'));
const hash = content => createHash('sha256').update(content).digest('hex');

test('nine exact historical editions retain independent source identity, notices and actual source counts', () => {
  const catalog = read('catalog.json');
  const inventory = read('acquisition-catalog.json');
  for (const [id, verses] of Object.entries(counts)) {
    const edition = catalog.editions.find(row => row.id === id);
    assert.ok(edition, id);
    assert.match(id, /^[a-z0-9-]+$/);
    assert.deepEqual(edition.totals, { books: 66, chapters: 1189, verses });
    const manifest = read(`${id}/manifest.json`);
    assert.deepEqual(manifest.edition, edition);
    const provenance = read(`${id}/provenance.json`);
    assert.equal(provenance.archiveSha256, edition.sha256);
    assert.equal(provenance.displayTextMember, `${edition.providerId}_vpl.txt`);
    assert.equal(provenance.totals.verses, verses);
    const notice = readFileSync(new URL(`../data/editions/${id}/NOTICE.txt`, import.meta.url));
    assert.equal(hash(notice), provenance.generatedFileSha256['NOTICE.txt']);
    assert.match(notice.toString(), /Public Domain/);
    assert.ok(notice.toString().includes(edition.licenseUrl));
    assert.ok(notice.toString().includes('https://ebible.org/legal.php'));
    const record = inventory.records.find(row => row.providerId === edition.providerId);
    assert.equal(record.installedEditionId, id);
    assert.equal(record.installedSourceSha256, edition.sha256);
    assert.equal(record.coverage, 'validated-full-bible');
  }
});

test('new source operation decisions bind individual evidence and deny changed revisions or third-party recordings', () => {
  const register = validateEditionRightsRegister(read('rights-register.json'));
  const catalog = read('catalog.json');
  for (const id of Object.keys(counts)) {
    const edition = catalog.editions.find(row => row.id === id);
    const row = register.editions.find(record => record.editionId === id);
    const context = { sourceSha256: edition.sha256 };
    for (const operation of ['display', 'offline', 'searchIndex', 'documentExport', 'redistribution']) {
      assert.equal(decideEditionOperation(row, operation, context).allowed, true, `${id}:${operation}`);
      assert.ok(row.operations[operation].evidenceIds.includes(`${id}-pd`));
      assert.ok(row.operations[operation].evidenceIds.includes('ebible-pd-uses'));
    }
    assert.equal(decideEditionOperation(row, 'display', { sourceSha256: '0'.repeat(64) }).allowed, false);
    assert.equal(decideEditionOperation(row, 'recordedAudio', context).allowed, false);
    assert.ok(row.conditions.some(condition => condition.includes('not an independent worldwide legal opinion')));
  }
});

test('source formatting exceptions remain narrowly pinned and never rewrite original text', () => {
  execFileSync('python3', ['-B', fileURLToPath(new URL('./edition_expansion_checks.py', import.meta.url))], { stdio: 'pipe' });
});

test('new editions remain within the current bounded batch file budget without claiming 100 editions', () => {
  let files = 0;
  for (const id of Object.keys(counts)) {
    const provenance = read(`${id}/provenance.json`);
    files += Object.keys(provenance.generatedFileSha256).length + 1;
    assert.equal(provenance.limitations.some(line => line.includes('excludes footnotes')), true);
    const manifest = read(`${id}/manifest.json`);
    const actual = manifest.books.reduce((total, book) => total + book.verseRecordCounts.reduce((sum, count) => sum + count, 0), 0);
    assert.equal(actual, counts[id]);
  }
  assert.equal(files, 630);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { decideEditionOperation, validateEditionRightsRegister } from '../src/edition-rights.ts';

const read = path => JSON.parse(readFileSync(new URL(`../data/editions/eng-bsb/${path}`, import.meta.url), 'utf8'));

test('USJ importer preserves Unicode/structure/gaps and rejects changed or unsupported source input', () => {
  execFileSync('python3', ['-B', fileURLToPath(new URL('./usj_import_checks.py', import.meta.url))], { stdio: 'pipe' });
});

test('installed BSB keeps source numbering, full verse wording and separately labeled Psalm titles', () => {
  const manifest = read('manifest.json');
  assert.deepEqual(manifest.totals, { books: 66, chapters: 1189, verses: 31086 });
  const matthew = read('books/MAT.json').chapters[16];
  assert.equal(matthew.verses.some(verse => verse.number === 21), false);
  assert.match(matthew.verses.find(verse => verse.number === 22).text, /^When they gathered together in Galilee,/);
  const genesis = read('books/GEN.json').chapters[0];
  assert.equal(genesis.verses[2].text, 'And God said, “Let there be light,” and there was light.');
  assert.equal(genesis.verses[2].notes.length, 1);
  assert.match(genesis.verses[4].text, /And there was evening, and there was morning/);
  const psalm = read('books/PSA.json').chapters[2];
  assert.match(psalm.verses[0].text, /^O LORD,/);
  assert.ok(psalm.headings.some(heading => heading.style === 'd' && heading.text.includes('A Psalm of David')));
  assert.match(read('books/ZEC.json').chapters[11].verses[0].text, /^This is the burden of the word of the LORD concerning Israel\. Thus declares the LORD,/);
  assert.equal(manifest.sourceStructure.notes, 4854);
  assert.equal(manifest.sourceStructure.speakerReviewStatus, 'publisher-markup-only-not-independently-reviewed');
  const heading = read('books/PSA.json').chapters[5].headings.find(row => row.style === 'd');
  assert.match(heading.text, /Sheminith\. A Psalm of David\./);
  assert.doesNotMatch(heading.text, /musical term|6:1/);
  assert.equal(heading.notes.length, 1);
  assert.match(heading.notes[0].text, /musical term/);
  assert.equal([...heading.text].slice(0, heading.notes[0].at).join('').endsWith('Sheminith.'), true);
  assert.equal(manifest.sourceStructure.headingNotes, 36);
});

test('ASV preserves supplied-word and cross-verse brackets with a pinned difference inventory', () => {
  const readAsv = path => JSON.parse(readFileSync(new URL(`../data/editions/eng-asv/${path}`, import.meta.url), 'utf8'));
  assert.deepEqual(readAsv('manifest.json').totals, { books: 66, chapters: 1189, verses: 31102 });
  assert.match(readAsv('books/GEN.json').chapters[0].verses.find(verse => verse.number === 11).text, /\[and\]/);
  assert.match(readAsv('books/PSA.json').chapters[2].verses.find(verse => verse.number === 2).text, /\[Selah$/);
  const john = readAsv('books/JHN.json');
  assert.match(john.chapters[6].verses.find(verse => verse.number === 53).text, /^\[And /);
  assert.match(john.chapters[7].verses.find(verse => verse.number === 11).text, /\]$/);
  const provenance = readAsv('provenance.json');
  assert.equal(provenance.publisherBracketFormatDifferences.length, 3748);
  assert.equal(createHash('sha256').update(`${JSON.stringify(provenance.publisherBracketFormatDifferences)}\n`).digest('hex'), provenance.publisherBracketInventorySha256);
});

test('every installed catalog edition has a matching usable display-rights revision', () => {
  const catalog = JSON.parse(readFileSync(new URL('../data/editions/catalog.json', import.meta.url), 'utf8'));
  const rights = validateEditionRightsRegister(JSON.parse(readFileSync(new URL('../data/editions/rights-register.json', import.meta.url), 'utf8')));
  for (const edition of catalog.editions) {
    const row = rights.editions.find(record => record.editionId === edition.id);
    assert.equal(decideEditionOperation(row, 'display', { sourceSha256: edition.sha256 }).allowed, true, edition.id);
    assert.equal(decideEditionOperation(row, 'recordedAudio', { sourceSha256: edition.sha256 }).allowed, false, edition.id);
  }
});

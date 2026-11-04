import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sourceReferences, sourceReferenceRanges } from '../src/reader/source-links.ts';
const read = path => JSON.parse(readFileSync(new URL(`../data/editions/eng-bsb/${path}`, import.meta.url), 'utf8'));
const manifest = read('manifest.json');

test('only supplied reference nodes become links, retaining publisher spelling and Unicode', () => {
  const chapter = read('books/JHN.json').chapters[2];
  assert.deepEqual(sourceReferences(chapter.headings[1].content), [
    { location: 'GEN 22:1-10', label: 'Genesis 22:1–10' },
    { location: 'ROM 5:6-11', label: 'Romans 5:6–11' },
  ]);
  assert.deepEqual(sourceReferences(['John 3:16', { type: 'note', content: [{ type: 'ref', loc: 'JHN 3:16', content: ['not part of this heading'] }] }]), []);
  assert.deepEqual(sourceReferences([{ type: 'ref', loc: 'JHN 3:16', content: ['Ọlọ́run ', { type: 'char', marker: 'it', content: ['àánú'] }] }]), [{ location: 'JHN 3:16', label: 'Ọlọ́run àánú' }]);
});

test('cross-chapter references retain the complete range in the named edition', () => {
  assert.deepEqual(sourceReferenceRanges('1CH 15:29-16:3', manifest), [
    { bookId: '1CH', chapter: 15, verse: 29, editionId: 'eng-bsb' },
    { bookId: '1CH', chapter: 16, verse: 1, endVerse: 3, editionId: 'eng-bsb' },
  ]);
  assert.deepEqual(sourceReferenceRanges('PSA 6', manifest), [{ bookId: 'PSA', chapter: 6, verse: 1, endVerse: 10, editionId: 'eng-bsb' }]);
  assert.deepEqual(sourceReferenceRanges('JHN 3:16', manifest), [{ bookId: 'JHN', chapter: 3, verse: 16, editionId: 'eng-bsb' }]);
});

test('invalid locations cannot become navigation URLs or silently shortened ranges', () => {
  for (const location of ['javascript:alert(1)', 'https://example.invalid', 'JHN 3:18-16', 'JHN 3:16-2:4', 'JHN 99:1', 'JHN 3:999', 'XYZ 1:1', 'JHN 3:0', 'JHN 0:1', 'JHN 3:16; ROM 1:1']) {
    assert.equal(sourceReferenceRanges(location, manifest), null, location);
  }
  assert.deepEqual(sourceReferences({ type: 'ref', loc: 'JHN 3:16', content: ['not an array'] }), []);
});

test('overdeep source markup is rejected without executing content', () => {
  let content = ['test'];
  for (let level = 0; level < 30; level++) content = [{ type: 'char', content }];
  assert.throws(() => sourceReferences(content), /supported bounds/);
});

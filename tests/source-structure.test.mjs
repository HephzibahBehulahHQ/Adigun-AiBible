import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildChapterStructure } from '../src/reader/source-structure.ts';

const loadBook = (code) => JSON.parse(readFileSync(new URL(`../data/editions/eng-bsb/books/${code}.json`, import.meta.url), 'utf8'));
const chapter = (verses, metadata = {}) => ({ number: 1, verses, ...metadata });
const note = (at, text = 'Source note') => ({ at, marker: 'f', caller: '+', text });
const exactText = (value, original) => assert.equal(value.segments.map((segment) => segment.text).join(''), original);
const plain = (value) => {
  assert.deepEqual(value.notes, []);
  assert.deepEqual(value.trailingNotes, []);
  for (const segment of value.segments) {
    assert.deepEqual(segment.markers, []);
    assert.deepEqual(segment.notesBefore, []);
    assert.equal(segment.paragraphIndex, null);
    assert.equal(segment.paragraphStyle, null);
    assert.equal(segment.paragraphStart, false);
  }
};

function getChapter(book, number) {
  return book.chapters.find((entry) => entry.number === number);
}

test('actual John 3:16 preserves nested added text, words of Jesus, and its footnote', () => {
  const source = getChapter(loadBook('JHN'), 3);
  const before = JSON.stringify(source);
  const result = buildChapterStructure(source);
  const verse = result.verses.find((entry) => entry.number === 16);
  const original = source.verses.find((entry) => entry.number === 16);
  exactText(verse, original.text);
  assert.deepEqual(verse.issues, []);
  assert.equal(verse.hasMetadata, true);
  assert.equal(result.hasMetadata, true);
  assert.equal(verse.segments.every((segment) => segment.markers.includes('wj')), true);
  const added = verse.segments.filter((segment) => segment.markers.includes('add'));
  assert.deepEqual(added.map(({ start, end, markers }) => ({ start, end, markers })), [
    { start: 40, end: 43, markers: ['wj', 'add'] },
  ]);
  assert.equal(added.map((segment) => segment.text).join(''), Array.from(original.text).slice(40, 43).join(''));
  assert.equal(verse.notes[0].at, 56);
  assert.equal(verse.notes[0].text, original.notes[0].text);
  assert.deepEqual(verse.notes[0].content, original.notes[0].content);
  assert.deepEqual(verse.segments.find((segment) => segment.start === 56).notesBefore, [verse.notes[0]]);
  assert.equal(verse.segments[0].paragraphStart, true);
  assert.deepEqual(verse.trailingNotes, []);
  assert.equal(JSON.stringify(source), before, 'input data must not be mutated');
});

test('actual Psalm 6 preserves heading notes, poetry, carryovers, and unannotated whitespace', () => {
  const source = getChapter(loadBook('PSA'), 6);
  const result = buildChapterStructure(source);
  const verse = result.verses.find((entry) => entry.number === 1);
  exactText(verse, source.verses[0].text);
  assert.deepEqual(verse.issues, []);
  const whitespace = verse.segments.find((segment) => segment.start === 38 && segment.end === 39);
  assert.equal(whitespace.text, ' ');
  assert.equal(whitespace.paragraphIndex, null);
  assert.equal(whitespace.paragraphStyle, null);
  assert.equal(whitespace.paragraphStart, false);
  assert.equal(verse.segments.find((segment) => segment.start === 0).paragraphStyle, 'q1');
  assert.equal(verse.segments.find((segment) => segment.start === 39).paragraphStyle, 'q2');
  const secondVerse = result.verses.find((entry) => entry.number === 2);
  assert.equal(secondVerse.segments[0].paragraphStart, true, 'zero-length carryover does not consume paragraph start');
  assert.equal(result.paragraphs.some((paragraph) => paragraph.spans.some((span) => span.start === span.end)), true);
  const headingIndex = source.headings.findIndex((heading) => heading.notes?.length);
  const heading = result.headings.find((entry) => entry.index === headingIndex);
  const rawHeading = source.headings[headingIndex];
  exactText(heading, rawHeading.text);
  assert.equal(heading.validAnchor, true);
  assert.deepEqual(heading.issues, []);
  assert.equal(heading.notes[0].text, rawHeading.notes[0].text);
  assert.deepEqual(heading.notes[0].content, rawHeading.notes[0].content);
  const positions = [...heading.segments.flatMap((segment) => segment.notesBefore), ...heading.trailingNotes];
  assert.deepEqual(positions, heading.notes);
});

test('unannotated source and empty annotation arrays stay exact plain text without requiring an offset unit', () => {
  const source = chapter([{ number: 1, text: '  Plain <b>text</b> & words.  ' }, { number: 2, text: '', notes: [], characterSpans: [] }], { headings: [], paragraphs: [] });
  const result = buildChapterStructure(source);
  assert.equal(result.hasMetadata, false);
  assert.deepEqual(result.issues, []);
  for (const [index, verse] of result.verses.entries()) {
    exactText(verse, source.verses[index].text);
    assert.equal(verse.hasMetadata, false);
    plain(verse);
  }
  assert.deepEqual(result.verses[1].segments, []);
});

test('astral characters and combining marks use code point offsets rather than UTF-16 or graphemes', () => {
  const text = 'A😀e\u0301Z';
  const result = buildChapterStructure(chapter([{
    number: 1,
    text,
    notes: [note(4, 'After combining mark'), note(1, 'Before emoji')],
    characterSpans: [{ start: 0, end: 5, marker: 'wj' }, { start: 1, end: 4, marker: 'add' }],
  }], {
    offsetUnit: 'unicode-codepoint',
    paragraphs: [{ style: 'q1', spans: [{ verse: 1, start: 1, end: 4 }] }],
  }));
  const verse = result.verses[0];
  exactText(verse, text);
  assert.deepEqual(verse.issues, []);
  assert.deepEqual(verse.segments.map(({ start, end, text }) => ({ start, end, text })), [
    { start: 0, end: 1, text: 'A' },
    { start: 1, end: 4, text: '😀e\u0301' },
    { start: 4, end: 5, text: 'Z' },
  ]);
  assert.deepEqual(verse.notes.map(({ index, at }) => ({ index, at })), [{ index: 1, at: 1 }, { index: 0, at: 4 }]);
  assert.deepEqual(verse.segments[1].markers, ['wj', 'add']);
  assert.equal(verse.segments[1].paragraphStart, true);
  assert.equal(verse.segments[2].paragraphIndex, null);
});

test('crossing character spans fail closed without losing text or applying a plausible subset', () => {
  const text = 'abcdefgh';
  const result = buildChapterStructure(chapter([{
    number: 1, text, notes: [note(3)],
    characterSpans: [{ start: 0, end: 5, marker: 'wj' }, { start: 3, end: 8, marker: 'add' }],
  }], { offsetUnit: 'unicode-codepoint' }));
  exactText(result.verses[0], text);
  plain(result.verses[0]);
  assert.match(result.verses[0].issues.join(' '), /cross/);
  assert.match(result.issues.join(' '), /Verse 1/);
});

test('equal, nested, touching, and zero-length character spans remain valid', () => {
  const result = buildChapterStructure(chapter([{
    number: 1, text: 'abcdef',
    characterSpans: [
      { start: 0, end: 6, marker: 'wj' },
      { start: 0, end: 6, marker: 'wj' },
      { start: 0, end: 3, marker: 'add' },
      { start: 3, end: 6, marker: 'add' },
      { start: 4, end: 4, marker: 'add' },
    ],
  }], { offsetUnit: 'unicode-codepoint' }));
  assert.deepEqual(result.issues, []);
  exactText(result.verses[0], 'abcdef');
  assert.equal(result.verses[0].segments.every((segment) => JSON.stringify(segment.markers) === JSON.stringify(['wj', 'add'])), true);
});

test('overlapping paragraph spans fail closed only for affected verse text', () => {
  const result = buildChapterStructure(chapter([{ number: 1, text: 'abcdefgh' }, { number: 2, text: 'safe' }], {
    offsetUnit: 'unicode-codepoint',
    paragraphs: [
      { style: 'q1', spans: [{ verse: 1, start: 0, end: 5 }] },
      { style: 'q2', spans: [{ verse: 1, start: 4, end: 8 }] },
      { style: 'p', spans: [{ verse: 2, start: 0, end: 4 }] },
    ],
  }));
  exactText(result.verses[0], 'abcdefgh');
  plain(result.verses[0]);
  assert.match(result.verses[0].issues.join(' '), /overlap/);
  assert.deepEqual(result.verses[1].issues, []);
  assert.equal(result.verses[1].segments[0].paragraphStyle, 'p');
});

test('invalid notes and character offsets fail closed for each affected verse', () => {
  for (const metadata of [
    { notes: [note(-1)] },
    { notes: [note(2.5)] },
    { notes: [note(7)] },
    { notes: [{ ...note(2), content: 'untrusted markup' }] },
    { characterSpans: [{ start: 4, end: 2, marker: 'wj' }] },
    { characterSpans: [{ start: 0, end: 7, marker: 'add' }] },
    { characterSpans: [{ start: 0, end: 6, marker: 'script' }] },
    { notes: null },
    { characterSpans: 'bad' },
  ]) {
    const result = buildChapterStructure(chapter([{ number: 1, text: 'source', ...metadata }], { offsetUnit: 'unicode-codepoint' }));
    exactText(result.verses[0], 'source');
    plain(result.verses[0]);
    assert.ok(result.verses[0].issues.length > 0);
  }
});

test('missing or unsupported offset units never apply offsets even if values fit', () => {
  for (const offsetUnit of [undefined, 'utf-16', 'utf8', null]) {
    const result = buildChapterStructure(chapter([{
      number: 1, text: '😀ab', notes: [note(1)], characterSpans: [{ start: 0, end: 3, marker: 'wj' }],
    }], {
      offsetUnit,
      paragraphs: [{ style: 'q1', spans: [{ verse: 1, start: 0, end: 3 }] }],
      headings: [{ afterVerse: null, style: 's1', text: 'Title', notes: [note(1)] }],
    }));
    exactText(result.verses[0], '😀ab');
    plain(result.verses[0]);
    assert.deepEqual(result.paragraphs, []);
    assert.ok(result.issues.length > 0);
    plain(result.headings[0]);
  }
});

test('empty text and end notes are safely represented as trailing notes, with stable ordering', () => {
  const result = buildChapterStructure(chapter([
    { number: 1, text: '', notes: [note(0, 'Empty source note')] },
    { number: 2, text: 'ab', notes: [note(2, 'First end'), note(0, 'Start'), note(2, 'Second end')] },
  ], {
    offsetUnit: 'unicode-codepoint',
    headings: [{ afterVerse: null, style: 'd', text: '', notes: [note(0, 'Empty heading note')] }],
  }));
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.verses[0].segments, []);
  assert.deepEqual(result.verses[0].trailingNotes, result.verses[0].notes);
  exactText(result.verses[1], 'ab');
  assert.deepEqual(result.verses[1].segments[0].notesBefore.map((entry) => entry.text), ['Start']);
  assert.deepEqual(result.verses[1].trailingNotes.map((entry) => entry.text), ['First end', 'Second end']);
  assert.deepEqual(result.headings[0].segments, []);
  assert.equal(result.headings[0].trailingNotes[0].text, 'Empty heading note');
});

test('headings preserve source content and reject invalid anchors and explicit unsupported offset units', () => {
  const content = [{ type: 'char', marker: 'ref', content: ['<script>source text</script>'] }];
  const result = buildChapterStructure(chapter([{ number: 1, text: 'A' }], {
    offsetUnit: 'unicode-codepoint',
    headings: [
      { afterVerse: null, style: 'd', text: 'Before', content, notes: [note(6)] },
      { afterVerse: 1, style: 's1', text: 'After', notes: [note(0)] },
      { afterVerse: 99, style: 's1', text: 'Unplaced', notes: [note(0)] },
      { afterVerse: 1, style: 's1', text: 'Wrong unit', offsetUnit: 'utf-16', notes: [note(0)] },
    ],
  }));
  assert.equal(result.headings[0].validAnchor, true);
  assert.equal(result.headings[0].afterVerse, null);
  assert.deepEqual(result.headings[0].content, content);
  assert.equal(result.headings[0].trailingNotes.length, 1);
  assert.equal(result.headings[1].validAnchor, true);
  assert.equal(result.headings[1].segments[0].notesBefore.length, 1);
  assert.equal(result.headings[2].validAnchor, false);
  assert.equal(result.headings[2].text, 'Unplaced');
  plain(result.headings[2]);
  plain(result.headings[3]);
  for (const heading of result.headings) exactText(heading, heading.text);
});

test('invalid paragraph bounds leave source exact and report the malformed metadata', () => {
  for (const spans of [
    [{ verse: 1, start: 0, end: 99 }],
    [{ verse: 1, start: 2, end: 1 }],
    [{ verse: 90, start: 0, end: 1 }],
    [{ verse: 1, start: 0, end: 2 }, { verse: 1, start: -1, end: 2 }],
  ]) {
    const result = buildChapterStructure(chapter([{ number: 1, text: 'abc' }], {
      offsetUnit: 'unicode-codepoint', paragraphs: [{ style: 'q1', spans }],
    }));
    exactText(result.verses[0], 'abc');
    plain(result.verses[0]);
    assert.ok(result.issues.length > 0);
  }
});

test('all chapter text in the four local source books round-trips without mutation', () => {
  for (const code of ['JHN', 'PSA', 'MAT', 'GEN']) {
    const book = loadBook(code);
    for (const source of book.chapters) {
      const result = buildChapterStructure(source);
      assert.equal(result.verses.length, source.verses.length);
      for (const [index, verse] of result.verses.entries()) exactText(verse, source.verses[index].text);
      for (const heading of result.headings) exactText(heading, source.headings[heading.index].text);
    }
  }
});

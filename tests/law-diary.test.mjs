import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { islamicSourceGuides, lawEntries } from '../src/law-diary/entries.ts';
import { bibleReference, lawSectionHash, readLawSection, searchLawEntries, validateLawEntries } from '../src/law-diary/model.ts';
import { bibleExcerpt, quranExcerpt } from '../src/law-diary/source.ts';

const json = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const manifest = json('../data/manifest.json');
const quranData = json('../data/editions/eng-clearquran/quran.json');
const catalog = json('../data/editions/catalog.json');
const quran = { ...quranData, edition: catalog.editions.find(edition => edition.id === 'eng-clearquran') };
const books = new Map();
const getBook = id => { if (!books.has(id)) books.set(id, json(`../data/books/${id}.json`)); return books.get(id); };

test('every Law Diary Bible and Quran citation resolves to real installed source units', () => {
  validateLawEntries([...lawEntries, ...islamicSourceGuides]);
  let checked = 0;
  for (const entry of [...lawEntries, ...islamicSourceGuides]) {
    for (const source of [...entry.sources, ...(entry.categorySamples?.flatMap(group => group.sources) || [])]) {
      if (source.type === 'bible') {
        const result = bibleExcerpt(getBook(source.bookId), manifest, source);
        assert.equal(result.missing.length, 0, `${entry.id}: ${source.bookId} ${source.chapter}:${source.verse}`);
        assert.equal(result.verses.length, (source.endVerse ?? source.verse) - source.verse + 1);
        assert.ok(result.verses.every(verse => verse.text.trim()));
        checked++;
      } else if (source.type === 'quran') {
        const result = quranExcerpt(quran, source);
        assert.equal(result.verses.length, (source.endAyah ?? source.ayah) - source.ayah + 1);
        assert.ok(result.verses.every(verse => verse.text.trim()));
        checked++;
      }
    }
  }
  assert.ok(checked >= 100, `Expected a substantial validated index, checked ${checked}.`);
});

test('source slicing preserves authoritative text and exposes edition numbering gaps', () => {
  const book = structuredClone(getBook('MAT'));
  const original = book.chapters.find(chapter => chapter.number === 5).verses.find(verse => verse.number === 17);
  const citation = { type: 'bible', bookId: 'MAT', bookName: 'Matthew', chapter: 5, verse: 17, endVerse: 20 };
  const result = bibleExcerpt(book, manifest, citation);
  assert.strictEqual(result.verses[0], original);
  assert.equal(result.context[0].number, 15);
  assert.equal(result.context.at(-1).number, 22);
  book.chapters.find(chapter => chapter.number === 5).verses = book.chapters.find(chapter => chapter.number === 5).verses.filter(verse => verse.number !== 18);
  const withGap = bibleExcerpt(book, manifest, citation);
  assert.deepEqual(withGap.missing, [18]);
  assert.deepEqual(withGap.verses.map(verse => verse.number), [17, 19, 20]);
  assert.throws(() => bibleExcerpt(getBook('JHN'), manifest, citation), /does not match/);
  assert.throws(() => bibleExcerpt(book, manifest, { ...citation, chapter: 90 }), /absent/);
  assert.throws(() => quranExcerpt(quran, { type: 'quran', surah: 112, ayah: 1, endAyah: 9 }), /absent/);
});

test('research validation rejects fabricated approval, relationship assignments and source category mixing', () => {
  const change = patch => [{ ...structuredClone(lawEntries[0]), ...patch }];
  assert.throws(() => validateLawEntries(change({ humanReviewStatus: 'approved' })), /approval/);
  assert.throws(() => validateLawEntries(change({ relationship: 'agrees' })), /relationship/);
  assert.throws(() => validateLawEntries(change({ sources: [] })), /provenance/);
  assert.throws(() => validateLawEntries(change({ sources: [{ type: 'quran', surah: 4, ayah: 159, collection: 'Bukhari' }] })), /Quran/);
  assert.throws(() => validateLawEntries(change({ sources: [{ type: 'quran', surah: 115, ayah: 1 }] })), /Quran/);
  assert.throws(() => validateLawEntries(change({ sources: [{ type: 'hadith', title: 'Report', note: 'Source', url: 'javascript:alert(1)' }] })), /Unsafe/);
  assert.throws(() => validateLawEntries([lawEntries[0], lawEntries[0]]), /Duplicate/);
  const descent = lawEntries.find(entry => entry.id === 'hadith-descent');
  assert.ok(descent.sources.every(source => source.type === 'hadith'));
  assert.ok(lawEntries.filter(entry => entry.section === 'apostles' && ['bartholomew', 'matthew', 'james-alphaeus', 'simon'].includes(entry.id)).every(entry => entry.debate && entry.researchGap));
});

test('nested law routes retain reading query and reject unknown sections without corrupting state', () => {
  const hash = '#/law-diary/social?book=JHN&chapter=3&verse=16&end=18&edition=deu1912';
  assert.equal(readLawSection(hash), 'social');
  assert.equal(readLawSection('#/law-diary/not-a-section?verse=1'), 'timeline');
  assert.equal(lawSectionHash('money', hash), '#/law-diary/money?book=JHN&chapter=3&verse=16&end=18&edition=deu1912');
  assert.throws(() => lawSectionHash('not-a-section', hash), /Unknown/);
  const source = lawEntries.find(entry => entry.id === 'justice').sources[0];
  assert.deepEqual(bibleReference(source, 'deu1912'), { bookId: 'EXO', chapter: 20, verse: 16, editionId: 'deu1912' });
});

test('section search matches actual citations without changing source or spanning other sections', () => {
  const entries = searchLawEntries(lawEntries, 'social', ' quran 4:135 ');
  assert.deepEqual(entries.map(entry => entry.id), ['justice']);
  assert.ok(searchLawEntries(lawEntries, 'apostles', 'Eusebius').every(entry => entry.section === 'apostles'));
  assert.deepEqual(searchLawEntries(lawEntries, 'social', 'not-present-anywhere'), []);
  assert.equal(searchLawEntries(lawEntries, 'sermons', '').length, 7);
});

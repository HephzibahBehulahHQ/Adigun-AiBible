import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import test from 'node:test';

const root = new URL('../data/original-language/oshb/', import.meta.url);
const bytes = (path) => readFileSync(new URL(path, root));
const json = (path) => JSON.parse(bytes(path));
const digest = (value) => createHash('sha256').update(value).digest('hex');
const manifest = json('manifest.json');
const pins = json('source.json');
const integrity = json('integrity.json');
const morphology = json('morphology.json');
const revision = '3d15126fb1ef74867fc1434be1942e837932691f';

function* nodes(content, reading = null) {
  for (const node of content) {
    if (typeof node === 'string') continue;
    const context = node.tag === 'rdg' ? node.attributes.type ?? 'unspecified' : reading;
    yield [node, context];
    yield* nodes(node.content, context);
  }
}

test('OSHB source, exact complete notices and derived outputs retain verified provenance', () => {
  assert.equal(pins.upstream.commit, revision);
  assert.equal(manifest.sourceRevision, revision);
  assert.equal(pins.upstream.archiveSha256, 'f979b5357fb18391928cd42ee1b95594db6e4f71d8da4e893c6c18f2688093a6');
  assert.equal(pins.sourceFiles.length, 44);
  assert.equal(pins.sourceFiles.filter((file) => file.path.startsWith('wlc/')).length, 39);
  assert.ok(!pins.sourceFiles.some((file) => file.path.endsWith('VerseMap.xml')));
  assert.equal(integrity.sourcePinSha256, digest(bytes('source.json')));
  for (const file of integrity.files) {
    const actual = bytes(file.path);
    assert.equal(actual.length, file.bytes, file.path);
    assert.equal(digest(actual), file.sha256, file.path);
  }
  const expected = [...integrity.files.map((file) => file.path), 'source.json', 'integrity.json'].sort();
  const actual = readdirSync(root, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => {
    const absolute = join(entry.parentPath, entry.name);
    return absolute.slice(root.pathname.length).replaceAll('\\', '/');
  }).sort();
  assert.deepEqual(actual, expected);
  const notices = { 'LICENSE.md': 'LICENSE.md', 'README.md': 'README.md', 'parsing/README.md': 'parsing-README.md', 'parsing/HebrewMorphologyCodes.html': 'HebrewMorphologyCodes.html.txt', 'parsing/Oshm.xml': 'Oshm.xml.txt' };
  for (const [source, target] of Object.entries(notices)) {
    const pin = pins.sourceFiles.find((file) => file.path === source);
    assert.equal(digest(bytes(`notices/${target}`)), pin.sha256, source);
  }
  assert.match(bytes('notices/LICENSE.md').toString(), /Original work of the Open Scriptures Hebrew Bible available at https:\/\/github.com\/openscriptures\/morphhb/);
  assert.match(bytes('notices/HebrewMorphologyCodes.html.txt').toString(), /creativecommons.org\/licenses\/by\/4.0/);
  assert.equal(manifest.alignment, null);
  assert.equal(manifest.glosses, null);
});

test('every source word and verse is inventoried without merging written and alternative readings', () => {
  const totals = Object.fromEntries(Object.keys(manifest.counts).map((key) => [key, 0]));
  const ids = new Set();
  const unknown = {};
  let verseCount = 0;
  let chapterCount = 0;
  for (const entry of manifest.books) {
    const book = json(entry.path);
    assert.equal(book.book, entry.id);
    assert.equal(book.sourceRevision, revision);
    assert.equal(digest(bytes(entry.path)), entry.sha256);
    assert.equal(book.chapters.length, entry.chapterCount);
    const bookCounts = Object.fromEntries(Object.keys(totals).map((key) => [key, 0]));
    let bookVerses = 0;
    for (const [index, chapter] of book.chapters.entries()) {
      chapterCount += 1;
      assert.equal(chapter.osisId, entry.chapters[index].osisId);
      assert.deepEqual(chapter.verses.map((verse) => verse.number), entry.chapters[index].verseNumbers);
      const counts = Object.fromEntries(Object.keys(totals).map((key) => [key, 0]));
      for (const verse of chapter.verses) {
        verseCount += 1;
        bookVerses += 1;
        assert.equal(verse.osisId, `${chapter.osisId}.${verse.number}`);
        for (const [node, reading] of nodes(verse.content)) {
          assert.ok(manifest.supportedMarkup.attributes[node.tag]);
          for (const attr of Object.keys(node.attributes)) assert.ok(manifest.supportedMarkup.attributes[node.tag].includes(attr));
          if (node.tag === 'w') {
            counts.words += 1;
            counts[reading === null ? 'mainTextWords' : 'readingWords'] += 1;
            counts.ketivWords += Number(node.attributes.type === 'x-ketiv');
            counts.qereWords += Number(reading === 'x-qere');
            for (const [attribute, name] of [['id', 'missingWordIds'], ['lemma', 'missingLemma'], ['morph', 'missingMorphology']]) counts[name] += Number(!node.attributes[attribute]);
            assert.ok(!ids.has(node.attributes.id), node.attributes.id);
            ids.add(node.attributes.id);
            if (node.attributes.morph && !Object.hasOwn(morphology.codes, node.attributes.morph)) unknown[node.attributes.morph] = (unknown[node.attributes.morph] ?? 0) + 1;
          } else if (node.tag === 'note') {
            counts.notes += 1;
            counts.variantNotes += Number(node.attributes.type === 'variant');
            counts.accentAlternatives += Number(node.attributes.type === 'alternative');
          } else if (node.tag === 'seg') counts.segments += 1;
        }
      }
      assert.deepEqual(counts, entry.chapters[index].counts, chapter.osisId);
      for (const key of Object.keys(totals)) bookCounts[key] += counts[key];
    }
    assert.deepEqual(bookCounts, entry.counts, entry.id);
    assert.equal(bookVerses, entry.verseCount);
    for (const key of Object.keys(totals)) totals[key] += bookCounts[key];
  }
  assert.deepEqual(totals, manifest.counts);
  assert.equal(manifest.bookCount, 39);
  assert.equal(chapterCount, 929);
  assert.equal(verseCount, 23213);
  assert.equal(totals.mainTextWords, 305507);
  assert.equal(totals.readingWords, 1278);
  assert.equal(ids.size, 306785);
  assert.deepEqual(manifest.duplicateWordIds, {});
  assert.deepEqual(unknown, manifest.unexpandedMorphologyCodes);
  assert.equal(Object.keys(unknown).length, 8);
  assert.equal(Object.values(unknown).reduce((a, b) => a + b, 0), 9);
});

test('actual source alternatives, special-letter segments and source numbering remain distinct', () => {
  const chronicles = json('books/1Chr.json');
  const verse = chronicles.chapters.find((chapter) => chapter.number === '9').verses.find((value) => value.number === '4');
  const readings = [...nodes(verse.content)].filter(([node]) => node.tag === 'rdg');
  assert.ok(readings.some(([reading]) => [...nodes(reading.content)].filter(([node]) => node.tag === 'w').length === 2));
  const deuteronomy = json('books/Deut.json');
  const shema = deuteronomy.chapters.find((chapter) => chapter.number === '6').verses.find((value) => value.number === '4');
  assert.ok([...nodes(shema.content)].some(([node]) => node.tag === 'w' && node.content.some((child) => typeof child !== 'string' && child.tag === 'seg' && child.attributes.type === 'x-large')));
  assert.equal(manifest.books.find((book) => book.id === 'Joel').chapterCount, 4);
  assert.equal(manifest.books.find((book) => book.id === 'Mal').chapterCount, 3);
  assert.equal(Object.keys(morphology.codes).length, 3481);
  assert.equal(morphology.tables.length, 17);
  assert.match(morphology.codes.HVqp3ms, /Hebrew: Verb qal perfect third person masculine singular/);
});

test('importer fails closed on unfamiliar readings and bad pins while preserving unknown annotations', () => {
  const run = spawnSync('python3', ['-B', new URL('./oshb_checks.py', import.meta.url).pathname], { encoding: 'utf8' });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
});

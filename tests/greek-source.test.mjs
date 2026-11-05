import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import test from 'node:test';

const root = new URL('../data/original-language/morphgnt-sblgnt/', import.meta.url);
const bytes = path => readFileSync(new URL(path, root));
const json = path => JSON.parse(bytes(path));
const hash = data => createHash('sha256').update(data).digest('hex');
const blob = data => createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex');
const pins = json('source.json'), manifest = json('manifest.json'), ledger = json('integrity.json'), grammar = json('morphology.json');
const revision = 'aaed91e57c8e4a8dc9a2383e129ca5e75fe6393d';
const increment = (counter, key) => { counter[key] = (counter[key] ?? 0) + 1; };
const sorted = object => Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b, 'en')));

test('Greek corpus and complete notices have explicit pinned source and distinct license identities', () => {
  assert.equal(pins.upstream.commit, revision);
  assert.equal(manifest.sourceRevision, revision);
  assert.equal(pins.upstream.tree, 'c518c6af640829bf882d884559bc8c77a01affec');
  assert.equal(pins.upstream.archiveSha256, 'e760c941eebae0eb25665a4937cf3b29b04a842f952f4b46d4181601d0e91872');
  assert.equal(pins.sourceFiles.length, 28);
  assert.equal(manifest.textLicense, 'CC-BY-4.0');
  assert.equal(manifest.annotationLicense, 'CC-BY-SA-3.0');
  assert.equal(pins.license.independentLegalReview, false);
  assert.equal(manifest.humanEditorialApproval, false);
  assert.equal(ledger.sourcePinSha256, hash(bytes('source.json')));
  for (const file of ledger.files) {
    const actual = bytes(file.path);
    assert.equal(actual.length, file.bytes, file.path);
    assert.equal(hash(actual), file.sha256, file.path);
  }
  const expected = [...ledger.files.map(file => file.path), 'source.json', 'integrity.json'].sort();
  const actual = readdirSync(root, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile()).map(entry => join(entry.parentPath, entry.name).slice(root.pathname.length)).sort();
  assert.deepEqual(actual, expected);
  for (const [source, target, inventory] of [
    ['README.md', 'MorphGNT-README.md', pins.sourceFiles],
    ['README.md', 'SBLGNT-README.md', pins.textLicenseFiles],
    ['About.md', 'SBLGNT-About.md', pins.textLicenseFiles],
    ['LICENSE', 'CC-BY-4.0.txt', pins.textLicenseFiles],
  ]) {
    const original = inventory.find(file => file.path === source), actual = bytes(`notices/${target}`);
    assert.equal(hash(actual), original.sha256, target);
    assert.equal(blob(actual), original.gitBlobSha, target);
  }
  assert.equal(hash(bytes('notices/CC-BY-SA-3.0.txt')), pins.annotationLicenseDocument.sha256);
  assert.equal(blob(bytes('notices/CC-BY-SA-3.0.txt')), '604209a804632b6e5274005a22293976d07c3099');
  assert.match(bytes('notices/MorphGNT-README.md').toString(), /morphological parsing and lemmatization/);
  assert.match(bytes('notices/MorphGNT-README.md').toString(), /creativecommons.org\/licenses\/by-sa\/3.0/);
  assert.match(bytes('notices/SBLGNT-README.md').toString(), /Copyright 2010/);
});

test('every source field and row reconstructs all 27 original Git blobs without normalization or padding', () => {
  let tokens = 0, chapters = 0, verses = 0;
  const lemmas = new Set(), normalized = new Set(), pos = {}, parsing = {}, symbols = {}, unknown = {}, punctuation = {};
  const sourceFiles = new Set();
  for (const [bookIndex, entry] of manifest.books.entries()) {
    const book = json(entry.path);
    assert.equal(book.sourceId, 'morphgnt-sblgnt');
    assert.equal(book.sourceRevision, revision);
    assert.equal(book.book, entry.id);
    assert.equal(book.sourceBookNumber, String(bookIndex + 1).padStart(2, '0'));
    assert.equal(book.sourceFile, entry.sourcePath);
    assert.equal(hash(bytes(entry.path)), entry.sha256);
    assert.equal(book.chapters.length, entry.chapterCount);
    const rows = []; let bookVerses = 0;
    for (const [chapterIndex, chapter] of book.chapters.entries()) {
      chapters++;
      assert.equal(chapter.sourcePrefix, book.sourceBookNumber + chapter.number.padStart(2, '0'));
      assert.equal(chapter.sourcePrefix, entry.chapters[chapterIndex].sourcePrefix);
      assert.deepEqual(chapter.verses.map(verse => verse.number), entry.chapters[chapterIndex].verseNumbers);
      let chapterTokens = 0;
      for (const verse of chapter.verses) {
        verses++; bookVerses++;
        assert.equal(verse.reference, chapter.sourcePrefix + verse.number.padStart(2, '0'));
        for (const [index, token] of verse.tokens.entries()) {
          tokens++; chapterTokens++;
          assert.equal(token.sourceLine, rows.length + 1);
          assert.equal(token.ordinal, index + 1);
          assert.deepEqual(Object.keys(token).sort(), ['sourceLine', 'ordinal', 'partOfSpeech', 'parsing', 'text', 'word', 'normalized', 'lemma'].sort());
          assert.match(token.parsing, /^[A-Z0-9-]{8}$/);
          rows.push([verse.reference, token.partOfSpeech, token.parsing, token.text, token.word, token.normalized, token.lemma].join(' '));
          lemmas.add(token.lemma); normalized.add(token.normalized);
          increment(pos, token.partOfSpeech); increment(parsing, token.parsing);
          let hasUnknown = false;
          if (!Object.hasOwn(grammar.partOfSpeech, token.partOfSpeech)) { increment(symbols, `partOfSpeech:${token.partOfSpeech}`); hasUnknown = true; }
          for (const [position, symbol] of [...token.parsing].entries()) if (symbol !== '-' && !Object.hasOwn(grammar.positions[position].codes, symbol)) {
            increment(symbols, `${grammar.positions[position].name}:${symbol}`); hasUnknown = true;
          }
          if (hasUnknown) increment(unknown, token.parsing);
          for (const character of token.text) if (!/[\p{L}\p{M}]/u.test(character)) increment(punctuation, character);
        }
      }
      assert.equal(chapterTokens, entry.chapters[chapterIndex].tokenCount);
    }
    const original = Buffer.from(rows.join('\n') + '\n'), source = pins.sourceFiles.find(file => file.path === book.sourceFile);
    assert.ok(source && !sourceFiles.has(source.path)); sourceFiles.add(source.path);
    assert.equal(original.length, source.bytes, source.path);
    assert.equal(hash(original), source.sha256, source.path);
    assert.equal(blob(original), source.gitBlobSha, source.path);
    assert.equal(rows.length, entry.tokenCount);
    assert.equal(bookVerses, entry.verseCount);
  }
  assert.equal(sourceFiles.size, 27);
  assert.deepEqual([manifest.bookCount, chapters, verses, tokens], [27, 260, 7927, 137554]);
  assert.deepEqual([chapters, verses, tokens], [manifest.chapterCount, manifest.verseCount, manifest.tokenCount]);
  assert.equal(lemmas.size, manifest.uniqueLemmaCount);
  assert.equal(normalized.size, manifest.uniqueNormalizedFormCount);
  assert.deepEqual(sorted(pos), sorted(manifest.observedPartOfSpeech));
  assert.deepEqual(sorted(parsing), sorted(manifest.observedParsingCodes));
  assert.deepEqual(sorted(symbols), sorted(manifest.unexpandedSymbols));
  assert.deepEqual(sorted(unknown), sorted(manifest.unexpandedParsingCodes));
  assert.deepEqual(punctuation, Object.fromEntries(manifest.observedNonletterTextCodepoints.map(item => [item.character, item.count])));
});

test('source gaps, literal apparatus signs and undefined morphology remain distinct from invented alignments', () => {
  assert.deepEqual(manifest.unexpandedSymbols, { 'case:V': 668 });
  assert.equal(grammar.positions[4].name, 'case');
  assert.equal(Object.hasOwn(grammar.positions[4].codes, 'V'), false);
  for (const field of ['alignment', 'glosses', 'transliteration', 'audio', 'alternativeReadings', 'strongs']) assert.equal(manifest[field], null, field);
  const john = json('books/Jn.json');
  assert.equal(john.chapters.find(chapter => chapter.number === '7').verses.at(-1).number, '52');
  assert.equal(john.chapters.find(chapter => chapter.number === '8').verses[0].number, '12');
  const marks = Object.fromEntries(manifest.observedNonletterTextCodepoints.map(item => [item.character, item.count]));
  assert.equal(marks['⸂'], 1764); assert.equal(marks['⸃'], 1765);
  assert.equal(marks['⸄'], 6); assert.equal(marks['⸅'], 5);
  assert.equal(marks['⟦'], 2); assert.equal(marks['⟧'], 2);
  assert.equal(marks['1'], 2); assert.equal(marks['2'], 1);
  assert.match(bytes('books/Jn.json').toString(), /ἐστί\(ν\)/u);
  const sourceReadme = bytes('notices/MorphGNT-README.md').toString();
  for (const [code, description] of Object.entries(grammar.partOfSpeech)) assert.ok(sourceReadme.includes(`${code} ${description}`));
  for (const position of grammar.positions) for (const [code, description] of Object.entries(position.codes)) assert.ok(sourceReadme.includes(`${code}=${description}`));
});

test('Greek importer rejects unsafe sources and preserves unknown data in adversarial fixtures', () => {
  const result = spawnSync('python3', ['-B', new URL('./greek-source-importer.test.py', import.meta.url).pathname], { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /Ran 15 tests/);
});

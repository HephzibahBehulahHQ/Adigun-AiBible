import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defaultGospelSelection, gospelReferenceKey, readGospelSelection, resolvePaneReference, setPaneLinked, validateGospelReference, validateGospelSelection, withGospelSelection } from '../src/gospels/model.ts';
import { extractGospelExcerpt, loadGospelExcerpt } from '../src/gospels/source.ts';

const json = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const manifests = { 'eng-web': json('data/manifest.json'), 'eng-bsb': json('data/editions/eng-bsb/manifest.json'), yor: json('data/editions/yor/manifest.json') };
const bookPath = (edition, book) => edition === 'eng-web' ? `data/books/${book}.json` : `data/editions/${edition}/books/${book}.json`;
const sources = overrides => ({
  getManifest: async id => manifests[id],
  getBook: async (book, id) => json(bookPath(id, book)),
  requirePermission: async () => {},
  ...overrides,
});
const ref = (values = {}) => ({ bookId: 'MAT', chapter: 13, verse: 1, endVerse: 23, editionId: 'eng-web', ...values });
const minimal = 'gospelGroup=sower&gospelEdition=eng-web&gospelBooks=MAT,MRK,LUK';

test('supplied Sower group keeps the three different Gospel ranges and exact source records', async () => {
  const selection = defaultGospelSelection('eng-web');
  assert.deepEqual(selection.panes.map(pane => resolvePaneReference(selection, pane)), [
    ref(), ref({ bookId: 'MRK', chapter: 4, endVerse: 20 }), ref({ bookId: 'LUK', chapter: 8, verse: 4, endVerse: 15 }),
  ]);
  const excerpts = await Promise.all(selection.panes.map(pane => loadGospelExcerpt(resolvePaneReference(selection, pane), sources())));
  assert.deepEqual(excerpts.map(excerpt => excerpt.verses.length), [23, 20, 12]);
  for (const excerpt of excerpts) {
    const chapter = json(bookPath(excerpt.edition.id, excerpt.reference.bookId)).chapters.find(chapter => chapter.number === excerpt.reference.chapter);
    assert.deepEqual(excerpt.verses, chapter.verses.filter(verse => verse.number >= excerpt.reference.verse && verse.number <= excerpt.reference.endVerse));
    assert.deepEqual(excerpt.context, chapter.verses);
    assert.deepEqual(excerpt.gaps, []);
  }
});

test('unlink snapshots the effective range and an independent pane survives shared edition changes', () => {
  const initial = defaultGospelSelection('yor');
  initial.panes[0].independent = { chapter: 1, verse: 1, endVerse: 2, editionId: 'eng-bsb' };
  const independent = setPaneLinked(initial, 'MAT', false);
  assert.deepEqual(independent.panes[0].independent, { chapter: 13, verse: 1, endVerse: 23, editionId: 'yor' });
  independent.panes[0].independent = { chapter: 17, verse: 20, endVerse: 22, editionId: 'eng-bsb' };
  independent.editionId = 'eng-web';
  assert.deepEqual(resolvePaneReference(independent, independent.panes[0]), ref({ chapter: 17, verse: 20, endVerse: 22, editionId: 'eng-bsb' }));
  assert.equal(resolvePaneReference(independent, independent.panes[1]).editionId, 'eng-web');
  const relinked = setPaneLinked(independent, 'MAT', true);
  assert.deepEqual(resolvePaneReference(relinked, relinked.panes[0]), ref());
  assert.equal(independent.panes[0].linked, false);
  assert.deepEqual(initial.panes[0].independent, { chapter: 1, verse: 1, endVerse: 2, editionId: 'eng-bsb' });
});

test('John can be chosen independently but never gains an invented Sower counterpart', () => {
  const selection = defaultGospelSelection('eng-web');
  selection.panes.push({ bookId: 'JHN', linked: false, independent: { chapter: 3, verse: 16, endVerse: 18, editionId: 'yor' } });
  assert.deepEqual(resolvePaneReference(selection, selection.panes[3]), ref({ bookId: 'JHN', chapter: 3, verse: 16, endVerse: 18, editionId: 'yor' }));
  assert.throws(() => setPaneLinked(selection, 'JHN', true), /no John passage/);
  selection.panes[3].linked = true;
  assert.throws(() => validateGospelSelection(selection), /no John passage/);
});

test('selection validation rejects missing, duplicated, foreign and unbounded coordinates', () => {
  const initial = defaultGospelSelection('eng-web');
  for (const invalid of [
    { ...initial, panes: initial.panes.slice(0, 1) },
    { ...initial, panes: [initial.panes[0], initial.panes[0]] },
    { ...initial, groupId: 'invented-group' },
    { ...initial, editionId: '../private' },
    { ...initial, panes: [{ ...initial.panes[0], bookId: 'GEN' }, initial.panes[1]] },
    { ...initial, panes: [{ ...initial.panes[0], independent: { ...initial.panes[0].independent, bookId: 'MAT' } }, initial.panes[1]] },
  ]) assert.throws(() => validateGospelSelection(invalid));
  for (const changes of [{ chapter: 0 }, { verse: 0 }, { verse: 24 }, { endVerse: 177 }, { chapter: 1.5 }, { endVerse: Infinity }, { bookId: 'ACT' }]) assert.throws(() => validateGospelReference(ref(changes)));
  assert.throws(() => resolvePaneReference(initial, { bookId: 'JHN', linked: false, independent: { chapter: 1, verse: 1, endVerse: 2, editionId: 'eng-web' } }), /not in/);
});

test('Gospel query updates preserve the original Bible path, full range and unrelated encoded bytes', () => {
  const original = '#/gospels/JHN/3?verse=16&end=18&edition=yor&extra=a%20b&oshbBook=Ruth&greekBook=Jn';
  assert.deepEqual(readGospelSelection(original, 'yor'), defaultGospelSelection('yor'));
  let selected = setPaneLinked(defaultGospelSelection('eng-web'), 'MAT', false);
  selected.panes[0].independent = { chapter: 17, verse: 20, endVerse: 22, editionId: 'eng-bsb' };
  selected.panes.push({ bookId: 'JHN', linked: false, independent: { chapter: 3, verse: 16, endVerse: 18, editionId: 'yor' } });
  const updated = withGospelSelection(original, selected);
  assert.ok(updated.startsWith(`${original}&gospelGroup=sower&gospelEdition=eng-web&`));
  assert.deepEqual(readGospelSelection(updated, 'yor'), selected);
  assert.equal(withGospelSelection(updated, selected), updated);
  assert.deepEqual(readGospelSelection(`#/gospels/GEN/1?verse=1&${minimal}`, 'yor'), defaultGospelSelection('eng-web'));
  selected = setPaneLinked(selected, 'MAT', true);
  const changed = withGospelSelection(updated, selected);
  assert.ok(changed.startsWith(`${original}&`));
  assert.deepEqual(readGospelSelection(changed, 'yor'), selected);
});

test('ambiguous, partial and malformed Gospel links fail instead of silently selecting other text', () => {
  const invalid = [
    'gospelEdition=eng-web',
    `${minimal}&gospel%47roup=sower`,
    `${minimal}&gospelMATLinked=2`,
    `${minimal}&gospelMATLinked=0`,
    `${minimal}&gospelMATChapter=1`,
    `${minimal}&gospelMATLinked=1&gospelMATChapter=1`,
    `${minimal}&gospelJHNLinked=0`,
    `${minimal}&gospelUnknown=1`,
    minimal.replace('MAT,MRK,LUK', 'MAT,MAT'),
    minimal.replace('MAT,MRK,LUK', 'MAT,JHN'),
    minimal.replace('MAT,MRK,LUK', 'MAT,GEN'),
    `${minimal}&gospelMATLinked=0&gospelMATChapter=01&gospelMATVerse=1&gospelMATEnd=2&gospelMATEdition=eng-web`,
    `${minimal}&gospelMATLinked=0&gospelMATChapter=1&gospelMATVerse=3&gospelMATEnd=2&gospelMATEdition=eng-web`,
    `${minimal}&gospelMATLinked=0&gospelMATChapter=1&gospelMATVerse=1&gospelMATEnd=2&gospelMATEdition=`,
  ];
  for (const query of invalid) assert.throws(() => readGospelSelection(`#/gospels/JHN/3?verse=16&${query}`, 'eng-web'), /Gospel|John|source edition/);
  assert.throws(() => readGospelSelection('#/gospels?' + 'x'.repeat(16_384), 'eng-web'), /too long/);
});

test('reference keys distinguish source edition, Gospel, chapter and complete ranges', () => {
  const choices = [ref(), ref({ editionId: 'yor' }), ref({ bookId: 'MRK' }), ref({ chapter: 12 }), ref({ verse: 2 }), ref({ endVerse: 22 })];
  assert.equal(new Set(choices.map(gospelReferenceKey)).size, choices.length);
});

test('real BSB verse omission stays visible without renumbering, trimming or replacing nearby wording', () => {
  const book = json(bookPath('eng-bsb', 'MAT')), chapter = book.chapters.find(chapter => chapter.number === 17);
  const excerpt = extractGospelExcerpt(ref({ chapter: 17, verse: 20, endVerse: 22, editionId: 'eng-bsb' }), manifests['eng-bsb'], book);
  assert.deepEqual(excerpt.gaps, [{ number: 21, reason: 'absent' }]);
  assert.deepEqual(excerpt.verses.map(verse => verse.number), [20, 22]);
  assert.strictEqual(excerpt.verses[0], chapter.verses.find(verse => verse.number === 20));
  assert.strictEqual(excerpt.verses[1], chapter.verses.find(verse => verse.number === 22));
  assert.strictEqual(excerpt.context, chapter.verses);
  assert.strictEqual(excerpt.edition, manifests['eng-bsb'].edition);
  assert.equal(excerpt.sourceSha256, manifests['eng-bsb'].edition.sha256);
  assert.ok(excerpt.verses[0].notes?.length, 'publisher notes remain attached to their source record');
});

test('empty source positions differ from absent records and original Unicode is untouched', () => {
  const book = json(bookPath('yor', 'MAT')), chapter = book.chapters.find(chapter => chapter.number === 13);
  chapter.verses[0] = { ...chapter.verses[0], text: '  \n' };
  chapter.verses = chapter.verses.filter(verse => verse.number !== 2);
  const before = JSON.stringify(book), excerpt = extractGospelExcerpt(ref({ endVerse: 3, editionId: 'yor' }), manifests.yor, book);
  assert.deepEqual(excerpt.gaps, [{ number: 1, reason: 'empty' }, { number: 2, reason: 'absent' }]);
  assert.equal(excerpt.verses[0].text, '  \n');
  assert.strictEqual(excerpt.verses[1], chapter.verses.find(verse => verse.number === 3));
  assert.equal(JSON.stringify(book), before);
  assert.ok(excerpt.attribution.includes(manifests.yor.edition.licenseDeedUrl));
  for (const condition of manifests.yor.edition.conditions || []) assert.ok(excerpt.attribution.includes(condition));
});

test('full source bounds and structural integrity are checked without silently repairing the source', () => {
  const manifest = manifests['eng-web'], original = json(bookPath('eng-web', 'MAT'));
  for (const changes of [{ chapter: 29 }, { endVerse: 176 }]) assert.throws(() => extractGospelExcerpt(ref(changes), manifest, original), /absent|coverage/);
  assert.throws(() => extractGospelExcerpt(ref(), manifest, { ...original, id: 'MRK' }), /does not match/);
  const duplicatedChapter = structuredClone(original);
  duplicatedChapter.chapters.push(duplicatedChapter.chapters.find(chapter => chapter.number === 13));
  assert.throws(() => extractGospelExcerpt(ref(), manifest, duplicatedChapter), /duplicated/);
  for (const change of ['duplicate', 'reorder']) {
    const book = structuredClone(original), chapter = book.chapters.find(chapter => chapter.number === 13);
    if (change === 'duplicate') chapter.verses.splice(1, 0, chapter.verses[0]);
    else [chapter.verses[0], chapter.verses[1]] = [chapter.verses[1], chapter.verses[0]];
    assert.throws(() => extractGospelExcerpt(ref(), manifest, book), /duplicate, unordered/);
  }
});

test('display permission must pass before any Gospel book is loaded', async () => {
  let reads = 0; const checks = [];
  await assert.rejects(loadGospelExcerpt(ref(), sources({
    requirePermission: async (edition, operation) => { checks.push([edition.id, operation]); throw new Error('Display rights denied for this isolated test.'); },
    getBook: async () => { reads++; throw new Error('A denied book must not load.'); },
  })), /rights denied/);
  assert.equal(reads, 0);
  assert.deepEqual(checks, [['eng-web', 'display']]);
});

test('source identity, exact revision and safe rights links are checked before book loading', async () => {
  const badEditions = [
    { id: 'yor' }, { corpus: 'quran' }, { sha256: undefined }, { sha256: 'a'.repeat(63) },
    { sourceUrl: 'javascript:alert(1)' }, { licenseUrl: 'data:text/plain,unsafe' },
    { licenseDeedUrl: 'https://user:secret@example.test/rights' }, { sourceUrl: 'https://example.test/\nsource' },
    { noticePath: '../private.txt' }, { noticePath: 'yor//notice.txt' }, { noticePath: 'https://example.test/notice' },
  ];
  for (const changes of badEditions) {
    let loaded = false;
    const manifest = structuredClone(manifests['eng-web']); Object.assign(manifest.edition, changes);
    await assert.rejects(loadGospelExcerpt(ref(), sources({ getManifest: async () => manifest, getBook: async () => { loaded = true; return json(bookPath('eng-web', 'MAT')); } })));
    assert.equal(loaded, false);
  }
  await assert.rejects(loadGospelExcerpt(ref(), sources(), 'f'.repeat(64)), /revision/);
  await assert.rejects(loadGospelExcerpt(ref(), sources(), 'invalid'), /revision/);
});

test('a revision changing during source loading cannot be presented as the earlier source', async () => {
  const manifest = structuredClone(manifests['eng-web']);
  await assert.rejects(loadGospelExcerpt(ref(), sources({
    getManifest: async () => manifest,
    getBook: async () => { manifest.edition.sha256 = 'a'.repeat(64); return json(bookPath('eng-web', 'MAT')); },
  })), /changed while/);
});

test('concurrent requests retain their own exact source identity when completed in reverse order', async () => {
  let releaseFirst;
  const firstBook = new Promise(resolve => { releaseFirst = resolve; });
  const dependencies = sources({ getBook: (book, id) => id === 'eng-web' ? firstBook : Promise.resolve(json(bookPath(id, book))) });
  const first = loadGospelExcerpt(ref(), dependencies), second = loadGospelExcerpt(ref({ editionId: 'yor' }), dependencies);
  const later = await second;
  assert.equal(later.reference.editionId, 'yor');
  assert.strictEqual(later.edition, manifests.yor.edition);
  releaseFirst(json(bookPath('eng-web', 'MAT')));
  const earlier = await first;
  assert.equal(earlier.reference.editionId, 'eng-web');
  assert.strictEqual(earlier.edition, manifests['eng-web'].edition);
  assert.notEqual(gospelReferenceKey(earlier.reference), gospelReferenceKey(later.reference));
});

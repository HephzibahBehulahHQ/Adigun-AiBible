import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { defaultGospelSelection, gospelReferenceKey, resolvePaneReference, setPaneLinked } from '../src/gospels/model.ts';
import { emptyGospelStudy } from '../src/gospels/study-model.ts';
import { captureGospelStudyPassages, checkGospelStudySources, gospelStudyMarkdown, loadSavedGospelPassage } from '../src/gospels/study-source.ts';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const json = path => JSON.parse(read(path));
const manifests = { 'eng-web': json('data/manifest.json'), 'eng-bsb': json('data/editions/eng-bsb/manifest.json'), yor: json('data/editions/yor/manifest.json') };
const bookPath = (edition, book) => edition === 'eng-web' ? `data/books/${book}.json` : `data/editions/${edition}/books/${book}.json`;
const digest = value => createHash('sha256').update(value).digest('hex');
const notice = edition => {
  const path = `data/editions/${edition.noticePath}`, text = read(path);
  return { path, text, bytes: Buffer.byteLength(text), sha256: digest(text) };
};
const sources = overrides => ({
  getManifest: async id => manifests[id],
  getBook: async (book, edition) => json(bookPath(edition, book)),
  requirePermission: async () => {},
  getNotice: async edition => notice(edition),
  ...overrides,
});
const mixedSelection = () => {
  const selection = setPaneLinked(defaultGospelSelection('eng-web'), 'MAT', false);
  selection.panes[0].independent = { chapter: 17, verse: 20, endVerse: 22, editionId: 'eng-bsb' };
  selection.panes.push({ bookId: 'JHN', linked: false, independent: { chapter: 3, verse: 16, endVerse: 18, editionId: 'yor' } });
  return selection;
};
const makeRow = async (selection = defaultGospelSelection('eng-web'), dependencies = sources()) => ({
  id: 'gospel-study-source-test', title: 'My account comparison', note: 'Private observation, not Scripture.', selection,
  passages: await captureGospelStudyPassages(selection, dependencies), createdAt: '2026-11-05T12:00:00.000Z', updatedAt: '2026-11-05T12:00:00.000Z',
});
const stateWith = rows => ({ ...emptyGospelStudy(), rows });

test('saved Gospel pins retain mixed pane order, exact labels, full context and real source gaps', async () => {
  const selection = mixedSelection(), passages = await captureGospelStudyPassages(selection, sources());
  assert.deepEqual(passages.map(passage => passage.reference), selection.panes.map(pane => resolvePaneReference(selection, pane)));
  assert.deepEqual(passages.map(passage => passage.sourceSha256), passages.map(passage => manifests[passage.reference.editionId].edition.sha256));
  for (const passage of passages) assert.deepEqual(Object.keys(passage).sort(), ['bookName', 'editionName', 'reference', 'sourceSha256']);
  const bsb = await loadSavedGospelPassage(passages[0], sources());
  assert.deepEqual(bsb.gaps, [{ number: 21, reason: 'absent' }]);
  assert.deepEqual(bsb.verses.map(verse => verse.number), [20, 22]);
  assert.deepEqual(bsb.context, json(bookPath('eng-bsb', 'MAT')).chapters.find(chapter => chapter.number === 17).verses);
  const yoruba = await loadSavedGospelPassage(passages[3], sources());
  assert.deepEqual(yoruba.verses, json(bookPath('yor', 'JHN')).chapters.find(chapter => chapter.number === 3).verses.filter(verse => verse.number >= 16 && verse.number <= 18));
  assert.equal(yoruba.edition.name, manifests.yor.edition.name);
});

test('editing a study cannot silently upgrade a source pin, but a deliberately changed reference captures its current source', async () => {
  const copies = structuredClone(manifests), dependencies = sources({ getManifest: async id => copies[id] });
  const selection = mixedSelection(), before = await captureGospelStudyPassages(selection, dependencies);
  copies['eng-bsb'].edition.sha256 = 'a'.repeat(64);
  await assert.rejects(captureGospelStudyPassages(selection, dependencies, before), /revision/);
  const changed = structuredClone(selection);
  changed.panes[0].independent.verse = 22;
  const after = await captureGospelStudyPassages(changed, dependencies, before);
  assert.equal(after[0].reference.verse, 22);
  assert.equal(after[0].sourceSha256, copies['eng-bsb'].edition.sha256);
  assert.deepEqual(after.slice(1), before.slice(1));
  assert.notEqual(before[0].sourceSha256, after[0].sourceSha256);
});

test('forged source labels and ambiguous pins fail without being treated as alternate editions', async () => {
  const row = await makeRow();
  for (const changes of [{ editionName: 'A different publisher' }, { bookName: 'A different book' }]) {
    await assert.rejects(loadSavedGospelPassage({ ...row.passages[0], ...changes }, sources()), /label or reference/);
  }
  await assert.rejects(loadSavedGospelPassage({ ...row.passages[0], sourceSha256: 'f'.repeat(64) }, sources()), /revision/);
  await assert.rejects(loadSavedGospelPassage({ ...row.passages[0], text: 'Copied text is not a pin.' }, sources()), /fields/);
  await assert.rejects(captureGospelStudyPassages(row.selection, sources(), [row.passages[0], row.passages[0]]), /ambiguous/);
});

test('a delayed source response captures the original selection, not later input mutations', async () => {
  const selection = defaultGospelSelection('eng-web');
  let releaseMatthew;
  const waiting = new Promise(resolve => { releaseMatthew = resolve; });
  const dependencies = sources({ getBook: async (book, edition) => book === 'MAT' ? waiting : json(bookPath(edition, book)) });
  const pending = captureGospelStudyPassages(selection, dependencies);
  selection.panes[0] = { bookId: 'JHN', linked: false, independent: { chapter: 3, verse: 16, endVerse: 18, editionId: 'yor' } };
  releaseMatthew(json(bookPath('eng-web', 'MAT')));
  const captured = await pending;
  assert.equal(captured[0].reference.bookId, 'MAT');
  assert.equal(captured[0].reference.chapter, 13);
  assert.equal(captured[0].reference.editionId, 'eng-web');
});

test('import validation rechecks source pins and cannot hide forged labels behind duplicate references', async () => {
  const row = await makeRow(), second = { ...structuredClone(row), id: 'second-study' };
  const valid = stateWith([row, second]);
  assert.deepEqual(await checkGospelStudySources(valid, sources()), valid);
  second.passages[0].editionName = 'Forged source identity';
  await assert.rejects(checkGospelStudySources(stateWith([row, second]), sources()), /label or reference/);
  const changed = structuredClone(manifests['eng-web']); changed.edition.sha256 = 'f'.repeat(64);
  await assert.rejects(checkGospelStudySources(stateWith([row]), sources({ getManifest: async () => changed })), /revision/);
  assert.equal(row.passages[0].sourceSha256, manifests['eng-web'].edition.sha256);
});

test('display denial is checked before a saved Gospel book is read', async () => {
  const row = await makeRow(); let reads = 0;
  await assert.rejects(loadSavedGospelPassage(row.passages[0], sources({
    requirePermission: async () => { throw new Error('Display denied in this isolated test.'); },
    getBook: async () => { reads++; throw new Error('No denied book should load.'); },
  })), /Display denied/);
  assert.equal(reads, 0);
});

test('Markdown keeps exact named source quotations separate from escaped user notes', async () => {
  const row = await makeRow();
  row.title = '<img src=x> &copy;';
  row.note = '<script>alert(1)</script>\n[Private link](javascript:alert(1))\n```\n# My writing';
  const output = await gospelStudyMarkdown(row, sources());
  const sourceVerse = json(bookPath('eng-web', 'MAT')).chapters.find(chapter => chapter.number === 13).verses[0];
  const quoted = output.split('\n').find(line => line.startsWith('> 13:1 ')).slice('> 13:1 '.length)
    .replace(/\\([\\`*_{}\[\]<>()#+.!|~-])/g, '$1').replace(/&amp;/g, '&');
  assert.equal(quoted, sourceVerse.text);
  assert.ok(output.includes('## Private notes · user writing'));
  assert.ok(output.includes('not independently reviewed'));
  assert.ok(output.includes(row.passages[0].sourceSha256));
  assert.ok(!output.includes('<script>'));
  assert.ok(!output.includes('<img src=x>'));
  assert.ok(output.includes('&amp;copy;'));
  assert.ok(output.includes('\\[Private link\\]\\(javascript:alert\\(1\\)\\)'));
});

test('Markdown preserves missing verse numbers and includes complete notices and license conditions', async () => {
  const row = await makeRow(mixedSelection()), notices = [];
  const output = await gospelStudyMarkdown(row, sources({ getNotice: async edition => { notices.push(edition.id); return notice(edition); } }));
  assert.ok(output.includes('> 17:20 '));
  assert.ok(output.includes('> 17:22 '));
  assert.ok(!output.includes('> 17:21 '));
  assert.ok(output.includes('17:21 — No verse record in this edition.'));
  for (const id of ['eng-bsb', 'yor']) {
    const complete = notice(manifests[id].edition);
    assert.ok(output.includes(complete.text));
    assert.ok(output.includes(`Notice SHA-256: ${complete.sha256}`));
  }
  assert.deepEqual(notices, ['eng-bsb', 'yor']);
  assert.ok(output.includes('CC BY\\-SA 4\\.0'));
});

test('empty numbered source records remain distinct from absent records in notebook exports', async () => {
  const dependencies = sources({ getBook: async (book, edition) => {
    const value = json(bookPath(edition, book));
    if (book === 'MAT') value.chapters.find(chapter => chapter.number === 13).verses[0].text = '  \n';
    return value;
  } });
  const row = await makeRow(defaultGospelSelection('eng-web'), dependencies);
  const output = await gospelStudyMarkdown(row, dependencies);
  assert.ok(output.includes('> 13:1   \n> '));
  assert.ok(output.includes('13:1 — The numbered source record has no wording.'));
  assert.ok(!output.includes('13:1 — No verse record'));
});

test('document export denial prevents notice access and produces no notebook', async () => {
  const row = await makeRow(mixedSelection()); let noticeReads = 0;
  await assert.rejects(gospelStudyMarkdown(row, sources({
    requirePermission: async (_edition, operation) => { if (operation === 'documentExport') throw new Error('Document export denied in this isolated test.'); },
    getNotice: async edition => { noticeReads++; return notice(edition); },
  })), /Document export denied/);
  assert.equal(noticeReads, 0);
});

test('missing, tampered, misaddressed and oversized publisher notices all block export', async () => {
  const row = await makeRow(defaultGospelSelection('yor')), original = notice(manifests.yor.edition);
  await assert.rejects(gospelStudyMarkdown(row, sources({ getNotice: undefined })), /verified publisher notice/);
  await assert.rejects(gospelStudyMarkdown(row, sources({ getNotice: async () => { throw new Error('Notice unavailable.'); } })), /Notice unavailable/);
  for (const invalid of [
    { ...original, path: 'data/editions/another/NOTICE.txt' },
    { ...original, text: `X${original.text.slice(1)}` },
    { ...original, bytes: original.bytes + 1 },
    { ...original, bytes: 256_001 },
    { ...original, sha256: 'f'.repeat(64) },
    { ...original, text: '' },
  ]) await assert.rejects(gospelStudyMarkdown(row, sources({ getNotice: async () => invalid })), /notice|inventory/);
  const withoutNotice = structuredClone(manifests.yor); delete withoutNotice.edition.noticePath;
  await assert.rejects(gospelStudyMarkdown(row, sources({ getManifest: async () => withoutNotice })), /complete publisher notice is unavailable/);
});

test('source identity or permission metadata changing during asynchronous export fails closed', async () => {
  const row = await makeRow();
  for (const changes of [{ sha256: 'a'.repeat(64) }, { name: 'Changed edition' }, { licenseUrl: 'https://example.test/changed-terms' }]) {
    const copy = structuredClone(manifests['eng-web']);
    await assert.rejects(gospelStudyMarkdown(row, sources({
      getManifest: async () => copy,
      requirePermission: async (_edition, operation) => { if (operation === 'documentExport') Object.assign(copy.edition, changes); },
    })), /source identity changed/);
  }
  assert.equal(gospelReferenceKey(row.passages[0].reference), gospelReferenceKey(resolvePaneReference(row.selection, row.selection.panes[0])));
});

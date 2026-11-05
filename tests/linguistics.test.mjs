import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { hashContent } from '../src/editorial.ts';
import { parseLexicon, searchLexicon, strongId, validateLexicon } from '../src/linguistics/lexicon.ts';
import { emptyLinguistics, linguisticsBackup, mergeLinguisticsImport, newExperiment, parseLinguisticsBackup, previewLinguisticsImport, validateExperiment } from '../src/linguistics/model.ts';
import { resolveExperiment, verifyLinguisticsImport } from '../src/linguistics/source-core.ts';
import { resolveMinistrySource } from '../src/ministry/source-core.ts';

const read = async path => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));
const manifest = await read('data/linguistics/manifest.json');
const dictionary = async id => { const descriptor = manifest.dictionaries.find(row => row.id === id); return parseLexicon(await readFile(new URL(`../data/linguistics/${descriptor.path}`, import.meta.url), 'utf8'), descriptor); };
const greek = await dictionary('greek'), hebrew = await dictionary('hebrew'), entries = [...greek.entries, ...hebrew.entries];
const bibleManifest = await read('data/manifest.json'), book = await read('data/books/GEN.json');
const sourceAccess = { getLexicon: async id => id === 'greek' ? greek : hebrew, getManifest: async () => bibleManifest, getBook: async () => book, requirePermission: async () => {} };
const reference = { bookId: 'GEN', editionId: 'eng-web', chapter: 1, verse: 1, endVerse: 2 };
const context = await resolveMinistrySource(reference, sourceAccess);
const newStudy = () => newExperiment(hebrew.entries.find(row => row.id === 'H1'), hebrew, context.passage, 'en', new Date('2026-11-05T10:00:00.000Z'));

test('pinned public-domain XML importer receipts and every normalized entry verify', () => {
  const output = execFileSync('python3', ['scripts/import-lexicon.py', '--verify'], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
  assert.match(output, /Verified 14298/);
  assert.equal(greek.entries.length, manifest.dictionaries.find(row => row.id === 'greek').records);
  assert.equal(hebrew.entries.filter(row => row.language === 'arc').length, manifest.dictionaries.find(row => row.id === 'hebrew').languageCounts.arc);
});

test('lookup resolves padded IDs, accented and unaccented scripts, transliteration and source meaning', () => {
  assert.equal(strongId('g00026'), 'G26'); assert.equal(strongId('G0'), null);
  assert.equal(searchLexicon(entries, 'g00026')[0].id, 'G26');
  assert.ok(searchLexicon(entries, 'αγαπη', 'lemma').some(row => row.id === 'G26'));
  assert.ok(searchLexicon(entries, 'agape', 'lemma').some(row => row.id === 'G26'));
  assert.ok(searchLexicon(entries, 'אב', 'lemma').some(row => row.id === 'H1'));
  assert.ok(searchLexicon(entries, 'affection benevolence', 'definition').some(row => row.id === 'G26'));
  assert.deepEqual(searchLexicon(entries, 'H2', 'all', 'arc').map(row => row.id), ['H2']);
  assert.equal(searchLexicon(entries, 'H2', 'all', 'heb').length, 0);
  assert.equal(searchLexicon(entries, 'inventedmissingwordvalue').length, 0);
});

test('historical text, cross references and missing-number records remain exact rather than generated', async () => {
  const love = greek.entries.find(row => row.id === 'G26'), father = hebrew.entries.find(row => row.id === 'H2'), unused = greek.entries.find(row => row.id === 'G2717');
  assert.equal(love.definition, 'love, i.e. affection or benevolence; specially (plural) a love-feast'); assert.deepEqual(love.relatedIds, ['G25']);
  assert.equal(father.language, 'arc'); assert.deepEqual(father.relatedIds, ['H1']); assert.equal(father.lexicalTag, 'n-m'); assert.equal(father.pronunciation, 'ab');
  assert.equal(unused.lemma, ''); assert.equal(unused.definition, ''); assert.equal(unused.notes, 'Not Used');
  assert.throws(() => newExperiment(unused, greek, context.passage), /unused number/);
  const { entrySha256, ...payload } = father; assert.equal(await hashContent(payload), entrySha256);
});

test('download checksums, duplicate dictionary IDs and wrong source revisions fail closed', async () => {
  const descriptor = manifest.dictionaries[0], raw = await readFile(new URL(`../data/linguistics/${descriptor.path}`, import.meta.url), 'utf8');
  await assert.rejects(parseLexicon(raw.replace('love, i.e.', 'changed wording'), descriptor), /pinned source checksum/);
  const altered = JSON.parse(raw); altered.entries[1] = altered.entries[0]; assert.throws(() => validateLexicon(altered, descriptor), /duplicated/);
  altered.sourceSha256 = 'a'.repeat(64); assert.throws(() => validateLexicon(altered, descriptor), /revision/);
});

test('private translation exercises retain immutable exact Bible and dictionary identities', async () => {
  const value = { ...newStudy(), title: 'My language study', choiceA: 'First personal wording', choiceB: 'Second personal wording', notes: 'Private uncertainty' };
  const resolved = await resolveExperiment(value, sourceAccess);
  assert.equal(resolved.context.verses[0].text, book.chapters[0].verses[0].text); assert.equal(resolved.entry.id, 'H1');
  const raw = linguisticsBackup({ ...emptyLinguistics(), revision: 5, experiments: [value] }), restored = parseLinguisticsBackup(raw);
  assert.deepEqual(restored.experiments[0], value); assert.equal(restored.revision, 0);
  assert.ok(raw.includes('Private uncertainty')); assert.ok(!raw.includes(book.chapters[0].verses[0].text)); assert.ok(!raw.includes(resolved.entry.definition));
  assert.equal(restored.experiments[0].status, 'private_user_exercise');
});

test('forged approval, lexical alignment and malformed experiment imports cannot become saved exercises', () => {
  const value = newStudy();
  assert.throws(() => validateExperiment({ ...value, status: 'approved' }), /invalid/);
  assert.throws(() => validateExperiment({ ...value, review: { status: 'approved' } }), /Approval/);
  assert.throws(() => validateExperiment({ ...value, verseAlignment: ['token'] }), /alignment/);
  assert.throws(() => validateExperiment({ ...value, dictionaryId: 'greek' }), /source dictionary/);
  assert.throws(() => parseLinguisticsBackup('{'), /not valid JSON/);
  assert.throws(() => parseLinguisticsBackup(JSON.stringify({ kind: 'another-app', schemaVersion: 1, experiments: [] })), /Choose an Adigun/);
});

test('changed dictionary hashes, unavailable verse references and revoked source display stop restore', async () => {
  const value = newStudy();
  for (const patch of [{ entrySha256: 'b'.repeat(64) }, { dictionarySourceSha256: 'c'.repeat(64) }, { entryId: 'H9999' }]) await assert.rejects(resolveExperiment({ ...value, ...patch }, sourceAccess), /original dictionary/);
  const changed = structuredClone(value); changed.passage.sourceSha256 = 'd'.repeat(64); await assert.rejects(resolveExperiment(changed, sourceAccess), /revision has changed/);
  const missing = structuredClone(value); missing.passage.reference.chapter = 150; await assert.rejects(resolveExperiment(missing, sourceAccess), /absent/);
  await assert.rejects(verifyLinguisticsImport({ ...emptyLinguistics(), experiments: [value] }, { ...sourceAccess, requirePermission: async () => { throw new Error('Display permission withdrawn'); } }), /withdrawn/);
});

test('restore conflict copies preserve current private writing and immutable experiment sources', () => {
  const first = newStudy(), current = { ...emptyLinguistics(), revision: 6, experiments: [first] }, incoming = { ...emptyLinguistics(), experiments: [{ ...first, notes: 'Other device reasoning' }] };
  assert.deepEqual(previewLinguisticsImport(current, incoming), { added: 0, identical: 0, conflicts: 1 });
  const merged = mergeLinguisticsImport(current, incoming); assert.equal(merged.revision, 6); assert.deepEqual(merged.experiments[0], first);
  assert.notEqual(merged.experiments[1].id, first.id); assert.equal(merged.experiments[1].notes, 'Other device reasoning'); assert.deepEqual(merged.experiments[1].passage, first.passage);
  assert.equal(mergeLinguisticsImport(current, current).experiments.length, 1);
});

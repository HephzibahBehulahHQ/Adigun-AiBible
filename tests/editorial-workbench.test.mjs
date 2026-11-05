import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publishEditorial } from '../scripts/publish-editorial.mjs';
import { hashSourceText } from '../src/editorial.ts';
import { emptyWorkbench, mergeDraftImport, newEditorialDraft, parseWorkbenchPackage, previewDraftImport, pruneHistory, reviewPackage, reviseDraft, validateDraft, validateSnapshot, workbenchBackup, writingDiff } from '../src/editorial-workbench/model.ts';
import { bibleSnapshot, quranSnapshot, verifyDraftSources, verifyWorkbenchSources } from '../src/editorial-workbench/source-core.ts';
import { bookCoverage, filterAcquisition, validateAcquisition } from '../src/editorial-workbench/coverage.ts';

const read = async path => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));
const manifest = await read('data/manifest.json'), genesis = await read('data/books/GEN.json');
const quranManifest = await read('data/editions/eng-clearquran/manifest.json'), quranData = await read('data/editions/eng-clearquran/quran.json');
const quran = { ...quranData, edition: quranManifest.edition }, permissions = [];
const sources = { getManifest: async () => manifest, getBook: async () => genesis, getQuran: async () => quran, getNotice: async edition => readFile(new URL(`../data/editions/${edition.noticePath}`, import.meta.url), 'utf8'), requirePermission: async (edition, operation) => { permissions.push(`${edition.id}:${operation}`); } };
const reference = { editionId: 'eng-web', bookId: 'GEN', chapter: 1, verse: 1, endVerse: 2 };
const initialAt = new Date('2026-11-05T10:00:00.000Z'), correctedAt = new Date('2026-11-05T11:00:00.000Z');
async function draft(kind = 'paraphrase') { const evidence = [await bibleSnapshot(reference, sources)]; if (kind === 'comparison') evidence.push(await quranSnapshot(1, 1, 2, sources)); return newEditorialDraft(kind, evidence, 'en', initialAt); }

test('exact installed source snapshots preserve text and both immutable edition and per-unit checksums', async () => {
  const value = await draft('comparison');
  assert.equal(value.sources[0].editionSha256, manifest.edition.sha256);
  assert.equal(value.sources[0].units[0].text, genesis.chapters[0].verses[0].text);
  assert.equal(value.sources[0].units[0].sha256, await hashSourceText(genesis.chapters[0].verses[0].text));
  assert.equal(value.sources[1].units[0].text, quran.surahs[0].verses[0].text);
  assert.deepEqual(value.sources[1].conditions, quran.edition.conditions);
  assert.equal(value.sources[1].notice, await sources.getNotice(quran.edition));
  await verifyDraftSources(value, sources);
  assert.equal(value.approvalState, 'unreviewed_draft');
});

test('review and approval forgeries are rejected throughout draft packages', async () => {
  const value = await draft(), envelope = JSON.parse(workbenchBackup({ ...emptyWorkbench(), drafts: [value] }));
  for (const mutation of [
    item => { item.approvalState = 'approved'; },
    item => { item.review = { status: 'approved', reviewerId: 'invented-human' }; },
    item => { item.writing.reviewerId = 'invented-human'; },
    item => { item.sources[0].units[0].approved = true; },
  ]) { const changed = structuredClone(envelope); mutation(changed.drafts[0]); assert.throws(() => parseWorkbenchPackage(JSON.stringify(changed)), /approval|Approval|reviewer/); }
  assert.throws(() => parseWorkbenchPackage('{'), /not valid JSON/);
  assert.throws(() => parseWorkbenchPackage(JSON.stringify({ ...envelope, published: true })), /unsupported/);
});

test('unknown refs, omitted source wording and unsupported source corpora fail before acceptance', async () => {
  await assert.rejects(bibleSnapshot({ ...reference, chapter: 999 }, sources), /absent/);
  await assert.rejects(bibleSnapshot({ ...reference, editionId: 'missing-edition' }, sources), /absent/);
  await assert.rejects(bibleSnapshot({ ...reference, bookId: 'EXO' }, sources), /original Bible source/);
  await assert.rejects(quranSnapshot(1, 7, 8, sources), /missing source wording/);
  await assert.rejects(bibleSnapshot(reference, { ...sources, getBook: async () => ({ ...genesis, chapters: [{ number: 1, verses: [genesis.chapters[0].verses[0]] }] }) }), /missing source wording/);
  const value = await draft(); assert.throws(() => validateSnapshot({ ...value.sources[0], corpus: 'hadith' }), /Only installed/);
  assert.throws(() => validateDraft({ ...value, kind: 'comparison' }), /both Bible and Quran/);
});

test('rehashed text tampering, revision drift and mislabeled source identity cannot pass import validation', async () => {
  const value = await draft();
  const forged = structuredClone(value); forged.sources[0].units[0].text = 'Different words'; forged.sources[0].units[0].sha256 = await hashSourceText('Different words');
  await assert.rejects(verifyDraftSources(forged, sources), /differs from the installed/);
  for (const change of [source => { source.editionSha256 = 'a'.repeat(64); }, source => { source.editionName = 'Another translation'; }, source => { source.referenceSystemId = 'different-numbering'; }, source => { source.units[0].sha256 = 'b'.repeat(64); }]) { const tampered = structuredClone(value); change(tampered.sources[0]); await assert.rejects(verifyDraftSources(tampered, sources), /differs from the installed/); }
});

test('permission withdrawal and disallowed adaptation or export stop draft operations', async () => {
  const value = await draft(); permissions.length = 0;
  await verifyDraftSources(value, sources, true);
  assert.deepEqual(permissions, ['eng-web:documentExport', 'eng-web:studyParaphrase']);
  await assert.rejects(verifyWorkbenchSources({ ...emptyWorkbench(), drafts: [value] }, { ...sources, requirePermission: async (_edition, operation) => { if (operation === 'studyParaphrase') throw new Error('Adaptation unavailable'); } }), /Adaptation unavailable/);
  await assert.rejects(verifyDraftSources(value, { ...sources, requirePermission: async () => { throw new Error('Permission withdrawn'); } }, true), /Permission withdrawn/);
  const comparison = await draft('comparison'); permissions.length = 0; await verifyDraftSources(comparison, sources, true);
  assert.deepEqual(permissions, ['eng-web:documentExport', 'eng-clearquran:documentExport']);
});

test('corrections preserve original writing and snapshots, require reasons and detect tampered history', async () => {
  const initial = await draft(), writing = { ...initial.writing, title: 'My Genesis study', text: 'My unreviewed study writing.' };
  assert.throws(() => reviseDraft(initial, writing, '', '', correctedAt), /Correction reason/);
  const revised = reviseDraft(initial, writing, 'PRIVATE NOTES', 'Clarified my draft', correctedAt);
  assert.deepEqual(revised.original, initial.original); assert.deepEqual(revised.sources, initial.sources);
  assert.equal(revised.history.length, 1); assert.equal(revised.history[0].reason, 'Clarified my draft');
  assert.deepEqual(writingDiff(revised.original, revised.writing).map(row => row.field), ['title', 'text']);
  assert.throws(() => validateDraft({ ...revised, writing: { ...writing, text: 'Tampered current writing' } }), /correction history/);
  const pruned = pruneHistory(revised, new Date('2026-11-05T12:00:00.000Z'));
  assert.deepEqual(pruned.original, initial.original); assert.equal(pruned.history.length, 0); assert.ok(pruned.historyPrunedAt);
  assert.deepEqual(reviseDraft(pruned, { ...writing, text: 'Further correction' }, 'PRIVATE NOTES', 'Second correction', new Date('2026-11-05T13:00:00.000Z')).history[0].before, writing);
});

test('private backups retain author notes while review packages omit them and never claim approval', async () => {
  const initial = await draft(), value = reviseDraft(initial, { ...initial.writing, text: 'My study paraphrase' }, 'PRIVATE-DO-NOT-EXPORT', 'Initial writing', correctedAt);
  const backup = workbenchBackup({ ...emptyWorkbench(), revision: 8, drafts: [value] }), review = reviewPackage(value);
  assert.ok(backup.includes('PRIVATE-DO-NOT-EXPORT')); assert.ok(!review.includes('PRIVATE-DO-NOT-EXPORT'));
  assert.equal(parseWorkbenchPackage(backup).revision, 0); assert.deepEqual(parseWorkbenchPackage(backup).drafts[0], value);
  assert.equal(parseWorkbenchPackage(review).drafts[0].privateNotes, ''); assert.equal(JSON.parse(review).drafts[0].approvalState, 'unreviewed_draft');
  const comparison = await draft('comparison'); assert.throws(() => reviewPackage(comparison), /proposition/);
});

test('restore preview and conflict-copy merge preserve existing drafts and original identities', async () => {
  const first = await draft(), changed = reviseDraft(first, { ...first.writing, title: 'Backup revision' }, '', 'Retitled', correctedAt);
  const current = { ...emptyWorkbench(), revision: 3, drafts: [first] }, incoming = { ...emptyWorkbench(), drafts: [changed] };
  assert.deepEqual(previewDraftImport(current, incoming), { added: 0, identical: 0, conflicts: 1 });
  const result = mergeDraftImport(current, incoming); assert.equal(result.revision, 3); assert.deepEqual(result.drafts[0], first);
  assert.notEqual(result.drafts[1].id, first.id); assert.equal(result.drafts[1].writing.title, 'Backup revision');
  assert.equal(mergeDraftImport(current, current).drafts.length, 1);
});

test('coverage uses actual record counts and keeps unavailable approval evidence unknown', async () => {
  const bsb = await read('data/editions/eng-bsb/manifest.json');
  const outputDirectory = await mkdtemp(join(tmpdir(), 'adigun-workbench-publication-'));
  try {
  // Derive the real publication from checked-in records and installed sources.
  // No prebuilt ignored artifact or synthetic approval is accepted as a prerequisite.
  const publication = await publishEditorial({ outputPath: join(outputDirectory, 'publication.json') });
  const actual = bookCoverage(bsb, publication), original = bookCoverage(manifest, publication);
  assert.equal(actual.reduce((sum, row) => sum + row.sourceUnits, 0), bsb.totals.verses);
  assert.equal(original.reduce((sum, row) => sum + row.sourceUnits, 0), manifest.totals.verses);
  assert.equal(actual.reduce((sum, row) => sum + row.counts.unreviewed, 0), bsb.totals.verses);
  assert.equal(actual.reduce((sum, row) => sum + row.paraphrases, 0), 0);
  assert.equal(bookCoverage(manifest, null)[0].publicationAvailable, false);
  const mixed = { ...publication, coverage: [{ bibleRef: { corpus: 'bible', editionId: 'eng-web', workId: 'GEN', start: { chapter: 1, unit: '1' } }, status: 'reviewed_no_match', approvedLinkIds: [] }] };
  const book = bookCoverage(manifest, mixed)[0]; assert.equal(book.counts.reviewed_no_match, 1); assert.equal(book.counts.unreviewed, book.sourceUnits - 1); assert.equal(book.counts.reviewed_with_links, 0);
  } finally { await rm(outputDirectory, { recursive: true, force: true }); }
});

test('provider inventory remains searchable metadata and rejects unsafe external URLs', async () => {
  const raw = await read('data/editions/acquisition-catalog.json'), inventory = validateAcquisition(raw);
  assert.equal(inventory.records.length, raw.records.length); assert.ok(filterAcquisition(inventory, 'Arabic').length > 0);
  const row = inventory.records.find(item => item.availability === 'metadata-only'); assert.ok(row, 'The acquisition inventory must retain real uninstalled source leads.');
  assert.ok(filterAcquisition(inventory, row.providerId).some(item => item.providerId === row.providerId));
  const installed = inventory.records.filter(item => item.availability === 'installed');
  assert.ok(installed.length > 0); assert.ok(installed.every(item => typeof item.installedEditionId === 'string' && item.installedEditionId.length > 0));
  assert.equal(row.availability, 'metadata-only'); assert.equal(row.installedEditionId, null);
  const invalid = structuredClone(raw); invalid.records[0].sourceUrl = 'javascript:alert(1)'; assert.throws(() => validateAcquisition(invalid), /unsafe/);
});

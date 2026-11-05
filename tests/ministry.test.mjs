import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calendarOutlines, emptyMinistry, mergeMinistry, ministryBackup, newMinistryOutline, parseMinistryBackup, previewMinistryImport, validateMinistry, validateMinistryOutline } from '../src/ministry/model.ts';
import { checkMinistryImportSources, ministryMarkdown, resolveMinistrySource } from '../src/ministry/source-core.ts';

const manifest = JSON.parse(await readFile(new URL('../data/manifest.json', import.meta.url), 'utf8'));
const book = JSON.parse(await readFile(new URL('../data/books/GEN.json', import.meta.url), 'utf8'));
const reference = { editionId: 'eng-web', bookId: 'GEN', chapter: 1, verse: 1, endVerse: 2 };
const permissionCalls = [];
const sources = { getManifest: async () => manifest, getBook: async () => book, requirePermission: async (edition, operation) => { permissionCalls.push([edition.id, operation]); } };
function outline() {
  const value = newMinistryOutline('passage', new Date('2026-11-05T10:00:00.000Z'));
  value.title = 'Reading together'; value.summary = 'Our public introduction';
  value.contextNotes = 'CONFIDENTIAL CONTEXT'; value.facilitatorNotes = 'CONFIDENTIAL ANSWERS';
  value.sections[0].writing = 'Observe the exact source wording.';
  return value;
}
async function quotedOutline() {
  const value = outline(), source = await resolveMinistrySource(reference, sources);
  value.quotes = [{ id: 'quote-genesis', passage: source.passage }]; value.sections[0].quoteIds = ['quote-genesis'];
  return value;
}

test('ministry backup preserves private writing and source identity without storing source quotation text', async () => {
  const document = await quotedOutline(), state = { ...emptyMinistry(), revision: 7, outlines: [document] };
  const raw = ministryBackup(state), restored = parseMinistryBackup(raw);
  assert.equal(restored.revision, 0); assert.deepEqual(restored.outlines[0], document);
  assert.ok(raw.includes('CONFIDENTIAL ANSWERS'));
  assert.ok(!raw.includes(book.chapters[0].verses[0].text));
  assert.equal(restored.outlines[0].quotes[0].passage.sourceSha256, manifest.edition.sha256);
});

test('malformed imports fail before a merge and bounded fields reject unsafe or impossible values', async () => {
  const value = await quotedOutline();
  assert.throws(() => parseMinistryBackup('{'), /not valid JSON/);
  assert.throws(() => parseMinistryBackup(JSON.stringify({ kind: 'another-app', version: 1 })), /Adigun ministry/);
  assert.throws(() => validateMinistryOutline({ ...value, sections: [{ ...value.sections[0], quoteIds: ['absent'] }] }), /missing or duplicate/);
  assert.throws(() => validateMinistryOutline({ ...value, scheduledDate: '2026-02-31' }), /calendar date/);
  assert.throws(() => validateMinistryOutline({ ...value, timeZone: 'unknown/local' }), /IANA/);
  assert.throws(() => validateMinistryOutline({ ...value, contentLanguage: 'genz' }), /writing register/);
  assert.throws(() => validateMinistryOutline({ ...value, title: 'bad\u0000title' }), /invalid/);
  assert.throws(() => validateMinistry({ ...emptyMinistry(), outlines: [value, value] }), /Duplicate/);
  assert.throws(() => validateMinistry({ ...emptyMinistry(), revision: Number.MAX_SAFE_INTEGER }), /revision/);
});

test('restore preview distinguishes duplicates and explicit conflict choices retain unrelated records', () => {
  const first = outline(), extra = { ...outline(), title: 'Keep this unrelated outline' };
  const current = { ...emptyMinistry(), revision: 4, outlines: [first, extra] };
  const changed = { ...first, summary: 'Writing from backup' };
  const incoming = { ...emptyMinistry(), outlines: [changed] };
  assert.deepEqual(previewMinistryImport(current, incoming), { added: 0, identical: 0, conflicts: 1 });
  assert.equal(mergeMinistry(current, incoming, 'keep-device').outlines[0].summary, first.summary);
  const merged = mergeMinistry(current, incoming, 'use-backup');
  assert.equal(merged.outlines[0].summary, 'Writing from backup'); assert.equal(merged.revision, 4);
  assert.deepEqual(merged.outlines[1], extra); assert.equal(current.outlines[0].summary, first.summary);
  assert.deepEqual(previewMinistryImport(current, current), { added: 0, identical: 2, conflicts: 0 });
});

test('participant handouts include exact source attribution and exclude both private fields', async () => {
  const value = await quotedOutline(); permissionCalls.length = 0;
  const handout = await ministryMarkdown(value, 'participant', sources);
  assert.ok(handout.includes('Participant handout'));
  assert.ok(handout.includes('Our public introduction'));
  assert.match(handout, /World English Bible/); assert.ok(handout.includes(manifest.edition.sha256));
  assert.ok(!handout.includes('CONFIDENTIAL'));
  assert.match(handout, /In the beginning/);
  assert.deepEqual(permissionCalls, [['eng-web', 'documentExport']]);
  const privateEdition = await ministryMarkdown(value, 'facilitator', sources);
  assert.ok(privateEdition.includes('CONFIDENTIAL CONTEXT')); assert.ok(privateEdition.includes('CONFIDENTIAL ANSWERS'));
  assert.ok(privateEdition.includes('PRIVATE FACILITATOR EDITION'));
});

test('Markdown exports escape user-supplied active content instead of creating remote image loads', async () => {
  const value = outline(); value.sections[0].writing = '![remote](https://example.test/track) <script>alert(1)</script>';
  const output = await ministryMarkdown(value, 'participant', sources);
  assert.ok(!output.includes('![remote](')); assert.ok(!output.includes('<script>'));
  assert.ok(output.includes('\\!\\[remote\\]\\('));
});

test('source permission withdrawal, revision changes and missing verse positions stop quotation exports', async () => {
  const value = await quotedOutline();
  await assert.rejects(ministryMarkdown(value, 'participant', { ...sources, requirePermission: async () => { throw new Error('Permission withdrawn'); } }), /Permission withdrawn/);
  await assert.rejects(ministryMarkdown(value, 'participant', { ...sources, getManifest: async () => ({ ...manifest, edition: { ...manifest.edition, sha256: 'b'.repeat(64) } }) }), /revision has changed/);
  const missingBook = cloneBook(); missingBook.chapters[0].verses = missingBook.chapters[0].verses.filter(verse => verse.number !== 2);
  await assert.rejects(resolveMinistrySource(reference, { ...sources, getBook: async () => missingBook }), /missing source wording/);
  await assert.rejects(resolveMinistrySource({ ...reference, editionId: 'missing-edition' }, sources), /saved edition/);
});
function cloneBook() { return structuredClone(book); }

test('import verifies original reference revisions for outlines and personal templates before accepting sources', async () => {
  const value = await quotedOutline(), template = { ...value, id: 'personal-template' };
  await checkMinistryImportSources({ ...emptyMinistry(), outlines: [value], templates: [template] }, sources);
  const changed = structuredClone(template); changed.quotes[0].passage.sourceSha256 = 'c'.repeat(64);
  await assert.rejects(checkMinistryImportSources({ ...emptyMinistry(), outlines: [value], templates: [changed] }, sources), /revision has changed/);
  const mislabeled = structuredClone(value); mislabeled.quotes[0].passage.editionName = 'A different translation';
  await assert.rejects(checkMinistryImportSources({ ...emptyMinistry(), outlines: [mislabeled] }, sources), /source label/);
});

test('calendar sorts local planning dates and excludes unscheduled outlines without changing their timezone', () => {
  const a = { ...outline(), title: 'Later', scheduledDate: '2026-12-01', timeZone: 'Europe/Berlin' };
  const b = { ...outline(), title: 'Earlier', scheduledDate: '2026-11-12', timeZone: 'Africa/Lagos' };
  const unscheduled = outline(), input = [a, unscheduled, b], result = calendarOutlines(input);
  assert.deepEqual(result.map(item => item.title), ['Earlier', 'Later']); assert.equal(result[0].timeZone, 'Africa/Lagos'); assert.equal(input[0], a);
});

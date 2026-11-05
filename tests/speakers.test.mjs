import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkSpeakerSource, emptyCorrections, mergeCorrections, publishedSpeakerAnnotations, publisherSpeeches, searchPublisherSpeeches, speakerEditorialDraft, validateCorrections, validateSpeakerPayload } from '../src/speakers/model.ts';
import { loadPublisherStudy, loadReviewedSpeakers, publisherCoverage } from '../src/speakers/source.ts';
import { editorialContentHash, hashSourceText, validateEditorialContent } from '../src/editorial.ts';
import { validatePublication } from '../src/publication.ts';

const json = path => JSON.parse(readFileSync(new URL(`../data/${path}`, import.meta.url), 'utf8'));
const prefix = id => id === 'eng-web' ? '' : `editions/${id}/`;
const manifest = id => json(`${prefix(id)}manifest.json`);
const book = (id, editionId) => json(`${prefix(editionId)}books/${id}.json`);
const dependencies = { getManifest: async id => manifest(id), getBook: async (id, editionId) => book(id, editionId), requirePermission: async () => {} };
const bsb = manifest('eng-bsb').edition;

async function proposal() {
  const speech = publisherSpeeches(book('JHN', 'eng-bsb'), bsb).speeches.find(s => s.reference.chapter === 3 && s.reference.verse === 16);
  const annotation = { schemaVersion: 1, id: 'test-only-speaker', reference: speech.reference, editionSha256: bsb.sha256, sourceTextHash: await hashSourceText(speech.fullVerse), offsetUnit: 'unicode-codepoint', start: speech.start, end: speech.end, speakerId: 'Test-only attribution', audience: ['Test-only audience'], quotedSpeakerId: 'Test-only nested attribution', speechKind: 'quotation', uncertainty: 'disputed', evidenceIds: ['eng-bsb:JHN:3:16'] };
  return { id: 'test-only-speaker', annotation, reason: 'Synthetic private correction, not a production review.', createdAt: '2026-11-05T12:00:00.000Z', status: 'draft' };
}

test('publisher coverage exactly matches validated real metadata across every installed edition', () => {
  for (const row of publisherCoverage.editions) {
    const source = manifest(row.editionId);
    assert.equal(row.sourceSha256, source.edition.sha256);
    let spans = 0, verses = 0;
    assert.deepEqual(row.books.map(entry => entry.bookId), source.books.map(entry => entry.id));
    for (const entry of row.books) {
      const extracted = publisherSpeeches(book(entry.bookId, row.editionId), source.edition);
      assert.equal(extracted.speeches.length, entry.spans, `${row.editionId}:${entry.bookId}`);
      assert.equal(new Set(extracted.speeches.map(s => `${s.reference.chapter}:${s.reference.verse}`)).size, entry.verses);
      assert.equal(extracted.issues.length, entry.rejectedMetadata);
      for (const speech of extracted.speeches) assert.equal(speech.text, Array.from(speech.fullVerse).slice(speech.start, speech.end).join(''));
      spans += entry.spans; verses += entry.verses;
    }
    assert.equal(spans, row.totalSpans); assert.equal(verses, row.totalVerses);
  }
});

test('a source without publisher markings does not infer speech from names or quoted text', async () => {
  let bookReads = 0;
  const result = await loadPublisherStudy('eng-web', '', { ...dependencies, getBook: async (...args) => { bookReads++; return dependencies.getBook(...args); } });
  assert.equal(result.speeches.length, 0); assert.equal(bookReads, 0);
  assert.equal(publishedSpeakerAnnotations(null).length, 0);
});

test('publisher extraction uses Unicode code points, never a whole-verse inference, and rejects malformed offsets', () => {
  const source = { id: 'JHN', name: 'Synthetic fixture', chapters: [{ number: 1, offsetUnit: 'unicode-codepoint', verses: [{ number: 1, text: 'A 😀 answer. Narration.', characterSpans: [{ start: 2, end: 10, marker: 'wj' }] }] }] };
  const extracted = publisherSpeeches(source, bsb);
  assert.equal(extracted.speeches[0].text, '😀 answer');
  assert.equal(extracted.speeches[0].fullVerse, source.chapters[0].verses[0].text);
  source.chapters[0].verses[0].characterSpans[0].end = 999;
  assert.equal(publisherSpeeches(source, bsb).speeches.length, 0);
  source.chapters[0].offsetUnit = 'utf16';
  assert.equal(publisherSpeeches(source, bsb).speeches.length, 0);
});

test('publisher search changes indexing only and honors scope, permission and cancellation', async () => {
  const result = await loadPublisherStudy('eng-bsb', 'JHN', dependencies);
  assert.ok(result.speeches.length > 100);
  assert.ok(result.speeches.every(value => value.reference.bookId === 'JHN'));
  const text = result.speeches[0].text;
  assert.ok(searchPublisherSpeeches(result.speeches, text.toUpperCase()).some(row => row.text === text));
  await assert.rejects(loadPublisherStudy('eng-bsb', 'JHN', { ...dependencies, requirePermission: async (_edition, operation) => { assert.equal(operation, 'searchIndex'); throw new Error('Permission denied'); } }), /Permission denied/);
  const abort = new AbortController();
  await assert.rejects(loadPublisherStudy('eng-bsb', 'JHN', { ...dependencies, getBook: async (...args) => { abort.abort(); return dependencies.getBook(...args); } }, abort.signal), /cancelled/);
  await assert.rejects(loadPublisherStudy('eng-bsb', 'JHN', { ...dependencies, getManifest: async () => ({ ...manifest('eng-bsb'), edition: { ...bsb, sha256: '0'.repeat(64) } }) }), /source revision/);
});

test('speaker claims bind full source and edition revisions plus exact nested quotation boundaries', async () => {
  const draft = await proposal(), original = book('JHN', 'eng-bsb').chapters[2].verses.find(v => v.number === 16).text;
  const payload = validateSpeakerPayload(draft.annotation);
  assert.equal(await checkSpeakerSource(payload, bsb, original), Array.from(original).slice(payload.start, payload.end).join(''));
  assert.equal(payload.quotedSpeakerId, 'Test-only nested attribution');
  await assert.rejects(checkSpeakerSource(payload, bsb, original + ' changed'), /source revision/);
  await assert.rejects(checkSpeakerSource(payload, { ...bsb, sha256: '0'.repeat(64) }, original), /source revision/);
  await assert.rejects(checkSpeakerSource({ ...payload, end: 10000 }, bsb, original), /outside/);
  for (const range of [{ start: -1 }, { end: 0 }, { start: 1.5 }, { offsetUnit: 'utf16' }, { sourceTextHash: 'missing' }]) assert.throws(() => validateSpeakerPayload({ ...payload, ...range }));
});

test('only the existing human reviewer publication pipeline can admit independently reviewed annotations', async () => {
  const draft = await proposal(), content = speakerEditorialDraft(draft.annotation), sourceId = content.basePassageIds[0];
  assert.equal(content.review.status, 'draft'); assert.equal(content.review.reviewerId, undefined);
  const original = book('JHN', 'eng-bsb').chapters[2].verses.find(v => v.number === 16).text;
  content.review = { status: 'approved', reviewerId: 'test-only-human', reviewedAt: '2026-11-04', reviewedContentHash: await editorialContentHash(content), evidenceIds: [sourceId] };
  const context = { now: new Date('2026-11-05T12:00:00Z'), reviewers: [], inventory: [{ id: bsb.id, corpus: 'bible', version: bsb.sha256, referenceSystemId: 'eng-bsb:publisher-numbering', rights: { redistribute: true, adapt: true }, rightsEvidence: [bsb.licenseUrl], works: [{ id: 'JHN', chapters: [{ chapter: 3, units: ['16'] }] }] }], resolveSource: id => id === sourceId ? { id, ref: { corpus: 'bible', workId: 'JHN', editionId: 'eng-bsb', referenceSystemId: 'eng-bsb:publisher-numbering', start: { chapter: 3, unit: '16' } }, editionVersion: bsb.sha256, text: original, sourceContentHash: draft.annotation.sourceTextHash } : undefined };
  assert.equal((await validateEditorialContent(content, context)).valid, false);
  context.reviewers = [{ id: 'test-only-human', displayName: 'Isolated test reviewer', kind: 'human', active: true }];
  assert.equal((await validateEditorialContent(content, context)).valid, true);
  const raw = { schemaVersion: 1, editionId: 'eng-web', approvedComparisons: [], approvedParaphrases: [], approvedContent: [content], coverage: [], coverageCounts: { unreviewed: 1, in_review: 0, reviewed_with_links: 0, reviewed_no_match: 0, disputed: 0 }, backlog: { totalSourceUnits: 1, remainingSourceUnits: 1, candidateCount: 0 } };
  assert.equal(publishedSpeakerAnnotations(raw).length, 0, 'unvalidated data cannot establish reviewed speech');
  const publication = await validatePublication(raw, context.now);
  assert.ok(publication);
  assert.equal(publishedSpeakerAnnotations(publication).length, 1);
  assert.equal((await loadReviewedSpeakers(publication, 'eng-bsb', dependencies)).records.length, 1);
  const changed = await loadReviewedSpeakers(publication, 'eng-bsb', { ...dependencies, getManifest: async () => ({ ...manifest('eng-bsb'), edition: { ...bsb, sha256: '0'.repeat(64) } }) });
  assert.equal(changed.records.length, 0); assert.equal(changed.blocked, 1);
});

test('private correction backups preserve source identities and reject approvals, conflicts and malformed bounds', async () => {
  const draft = await proposal(), state = { ...emptyCorrections(), proposals: [draft] };
  assert.deepEqual(validateCorrections(JSON.parse(JSON.stringify(state))), state);
  assert.equal(mergeCorrections(state, state).proposals.length, 1);
  assert.throws(() => validateCorrections({ ...state, proposals: [{ ...draft, status: 'approved' }] }), /approval/);
  assert.throws(() => validateCorrections({ ...state, proposals: [{ ...draft, annotation: { ...draft.annotation, review: { status: 'approved' } } }] }), /approval/);
  assert.throws(() => validateCorrections({ ...state, proposals: [draft, draft] }), /malformed/);
  assert.throws(() => mergeCorrections(state, { ...state, proposals: [{ ...draft, reason: 'A different version' }] }), /different content/);
  assert.throws(() => validateCorrections({ ...state, schemaVersion: 99 }), /Unsupported/);
  assert.equal(Object.hasOwn(draft, 'fullVerse'), false);
});

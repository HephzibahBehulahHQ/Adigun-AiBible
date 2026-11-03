import test from 'node:test';
import assert from 'node:assert/strict';
import { comparisonContentHash, coverageContentHash, editorialContentHash, explanationContentHash, hashSourceText, sourceRevision } from '../src/editorial.ts';
import { createPublicationLoader, isValidatedPublication, matchesReference, quranEvidenceMatches, readQuranPassage, selectApprovedParaphrase, selectComparisons, selectExplanation, selectPassageCoverage, validatePublication } from '../src/publication.ts';

// Synthetic wording, citations and reviewer identities stay in tests, never production publications.
const now = new Date('2026-11-03T12:00:00Z');
const bible = (verse, endVerse, editionId = 'eng-web') => ({ corpus: 'bible', workId: 'JHN', editionId, referenceSystemId: `${editionId}:publisher-numbering`, start: { chapter: 3, unit: String(verse) }, ...(endVerse ? { end: { chapter: 3, unit: String(endVerse) } } : {}) });
const quran = (chapter, verse, endVerse, editionId = 'eng-clearquran') => ({ corpus: 'quran', workId: 'QUR', editionId, referenceSystemId: `${editionId}:publisher-numbering`, start: { chapter, unit: String(verse) }, ...(endVerse ? { end: { chapter, unit: String(endVerse) } } : {}) });
const selected = (verse = 16, endVerse, editionId) => ({ bookId: 'JHN', chapter: 3, verse, ...(endVerse ? { endVerse } : {}), ...(editionId ? { editionId } : {}) });
const approval = (hash, evidenceIds) => ({ status: 'approved', reviewerId: 'test-only-reviewer', reviewedAt: '2026-11-02', reviewedContentHash: hash, evidenceIds });
const corpus = {
  schemaVersion: 1,
  edition: { id: 'eng-clearquran', name: 'TEST FIXTURE edition', language: 'en', license: 'TEST ONLY', sourceUrl: 'https://example.invalid/test-source', licenseUrl: 'https://example.invalid/test-rights' },
  surahs: [1, 2].map(number => ({ number, verses: [1, 2, 3].map(verse => ({ number: verse, text: `TEST FIXTURE ${number}:${verse}` })) }))
};
async function approveLink(link) {
  const revision = await sourceRevision(link);
  const evidence = [...link.bibleEvidencePassageIds, ...link.quranEvidencePassageIds];
  for (const [locale, explanation] of Object.entries(link.explanationByLocale)) {
    explanation.derivedFromRevision = revision;
    explanation.review = approval(await explanationContentHash(locale, explanation, revision), evidence);
  }
  link.review = approval(await comparisonContentHash(link), evidence);
  return link;
}
function envelope(links = [], overrides = []) {
  const coverage = links.flatMap(link => [16, 17, 18].map(verse => ({ bibleRef: bible(verse), status: 'reviewed_with_links', approvedLinkIds: [link.id] })));
  coverage.push(...overrides);
  const counts = { unreviewed: 10 - coverage.length, in_review: 0, reviewed_with_links: 0, reviewed_no_match: 0, disputed: 0 };
  for (const row of coverage) counts[row.status]++;
  return { schemaVersion: 1, editionId: 'eng-web', approvedComparisons: links, approvedParaphrases: [], approvedContent: [], coverage, coverageCounts: counts, backlog: { totalSourceUnits: 10, remainingSourceUnits: counts.unreviewed + counts.in_review + counts.disputed, candidateCount: 2 } };
}
async function fixture() {
  const bibleIds = [16, 17, 18].map(verse => `eng-web:JHN:3:${verse}`);
  const quranIds = ['eng-clearquran:QUR:1:1', 'eng-clearquran:QUR:2:1', 'eng-clearquran:QUR:2:2'];
  const hashes = {};
  for (const id of bibleIds) hashes[id] = await hashSourceText(`TEST BIBLE ${id}`);
  for (const id of quranIds) {
    const [, , chapter, verse] = id.split(':');
    hashes[id] = await hashSourceText(corpus.surahs.find(s => s.number === Number(chapter)).verses.find(v => v.number === Number(verse)).text);
  }
  const explanation = text => ({ text, origin: 'human_authored', derivedFromRevision: '', review: { status: 'draft', evidenceIds: [] } });
  const link = await approveLink({ id: 'test-comparison', bibleRefs: [bible(16, 18)], quranRefs: [quran(1, 1), quran(2, 1, 2)], bibleEvidencePassageIds: bibleIds, quranEvidencePassageIds: quranIds, reviewedSourceHashes: hashes, relationship: 'thematic', sourceLocale: 'en', proposition: 'TEST limited proposition', explanationByLocale: { en: explanation('TEST English explanation'), de: explanation('TEST German explanation') }, sourceIds: ['https://example.invalid/test-evidence'], review: { status: 'draft', evidenceIds: [] } });
  return { link, raw: envelope([link]) };
}

test('absent or unvalidated publication data stays unreviewed; an empty list is never a no-match claim', async () => {
  assert.equal(selectPassageCoverage(null, selected()).status, 'unreviewed');
  const { raw } = await fixture();
  assert.deepEqual(selectComparisons(raw, selected()), [], 'Raw records cannot bypass publication validation.');
  assert.equal(selectPassageCoverage(raw, selected()).status, 'unreviewed');
  const empty = await validatePublication(envelope(), now);
  assert.ok(empty);
  assert.equal(selectPassageCoverage(empty, selected()).status, 'unreviewed');
  assert.deepEqual(selectComparisons(empty, selected()), []);
});

test('validated comparison selection matches edition, book, chapter and overlapping verse ranges', async () => {
  const { raw } = await fixture();
  const publication = await validatePublication(raw, now);
  assert.ok(publication);
  assert.equal(selectComparisons(publication, selected(17)).length, 1);
  assert.equal(selectComparisons(publication, selected(15, 16)).length, 1);
  assert.equal(selectComparisons(publication, selected(19)).length, 0);
  assert.equal(selectComparisons(publication, selected(16, undefined, 'different-edition')).length, 0);
  assert.equal(selectComparisons(publication, { ...selected(), bookId: 'GEN' }).length, 0);
  assert.equal(selectComparisons(publication, { ...selected(), chapter: 4 }).length, 0);
  const crossChapter = { ...bible(36), end: { chapter: 4, unit: '2' } };
  assert.equal(matchesReference(crossChapter, { ...selected(1), chapter: 4 }), true);
  assert.equal(matchesReference(crossChapter, selected(35)), false);
});

test('coverage reports partial reviewed selections without marking the remaining verses reviewed', async () => {
  const { raw } = await fixture();
  const publication = await validatePublication(raw, now);
  assert.equal(selectPassageCoverage(publication, selected(16)).status, 'reviewed_with_links');
  const partial = selectPassageCoverage(publication, selected(16, 20));
  assert.equal(partial.status, 'partial');
  assert.equal(partial.reviewedUnits, 3);
  assert.equal(partial.totalUnits, 5);
  assert.deepEqual(partial.rows.slice(3).map(row => row.status), ['unreviewed', 'unreviewed']);
  assert.equal(selectPassageCoverage(publication, selected(16, undefined, 'other')).reviewedUnits, 0);
});

test('localized explanations require their own approval and disclose a source-language fallback', async () => {
  const { raw } = await fixture();
  const publication = await validatePublication(raw, now);
  const [link] = selectComparisons(publication, selected());
  const german = selectExplanation(publication, link, 'de');
  assert.equal(german.locale, 'de');
  assert.equal(german.isFallback, false);
  const yoruba = selectExplanation(publication, link, 'yo');
  assert.equal(yoruba.locale, 'en');
  assert.equal(yoruba.isFallback, true);
  assert.equal(selectExplanation(publication, raw.approvedComparisons[0], 'en'), null, 'A raw clone must not bypass validation.');
  const unapproved = structuredClone(raw);
  unapproved.approvedComparisons[0].explanationByLocale.de.review.status = 'draft';
  assert.equal(await validatePublication(unapproved, now), null);
});

test('changed claims, source dependencies and translations invalidate a formerly approved publication', async () => {
  const { raw } = await fixture();
  const changes = [
    link => { link.proposition += ' changed'; },
    link => { link.explanationByLocale.de.text += ' changed'; },
    link => { link.reviewedSourceHashes[link.quranEvidencePassageIds[0]] = '0'.repeat(64); },
    link => { link.explanationByLocale.en.derivedFromRevision = '0'.repeat(64); },
    link => { link.review.reviewedContentHash = '0'.repeat(64); },
    link => { link.review.reviewedAt = '2999-01-01'; },
    link => { link.review.status = 'in_review'; }
  ];
  for (const change of changes) {
    const altered = structuredClone(raw);
    change(altered.approvedComparisons[0]);
    assert.equal(await validatePublication(altered, now), null);
  }
});

test('malformed corpus references, dangling coverage and inconsistent summary counts fail closed', async () => {
  const { raw } = await fixture();
  const changes = [
    p => { p.schemaVersion = 2; },
    p => { p.approvedComparisons[0].quranRefs[0].corpus = 'hadith'; },
    p => { p.approvedComparisons[0].quranRefs = []; },
    p => { p.approvedComparisons[0].explanationByLocale = null; },
    p => { p.coverage[0].approvedLinkIds = ['missing']; },
    p => { p.coverage[0].approvedLinkIds = []; },
    p => { p.coverageCounts.reviewed_with_links += 1; },
    p => { p.backlog.remainingSourceUnits = 0; },
    p => { p.coverage.push(structuredClone(p.coverage[0])); },
    p => { p.approvedComparisons.push(structuredClone(p.approvedComparisons[0])); }
  ];
  for (const change of changes) {
    const bad = structuredClone(raw);
    change(bad);
    assert.equal(await validatePublication(bad, now), null);
  }
  for (const bad of [null, [], {}, { ...raw, coverageCounts: null }, { ...raw, approvedContent: 'draft' }]) assert.equal(await validatePublication(bad, now), null);
});

test('a no-match claim needs intact reviewed scope/evidence and applies only to its reviewed units', async () => {
  const { link } = await fixture();
  const evidenceIds = ['eng-web:JHN:3:19', 'eng-clearquran:QUR:1:1'];
  const row = { bibleRef: bible(19), status: 'reviewed_no_match', approvedLinkIds: [], reviewScope: 'TEST limited review scope', evidenceIds, reviewedSourceHashes: Object.fromEntries(await Promise.all(evidenceIds.map(async id => [id, await hashSourceText(`TEST ${id}`)]))) };
  row.review = approval(await coverageContentHash(row), evidenceIds);
  const raw = envelope([link], [row]);
  const publication = await validatePublication(raw, now);
  assert.ok(publication);
  assert.equal(selectPassageCoverage(publication, selected(19)).status, 'reviewed_no_match');
  assert.equal(selectPassageCoverage(publication, selected(19, 20)).status, 'partial');
  const missing = structuredClone(raw);
  delete missing.coverage.at(-1).review;
  assert.equal(await validatePublication(missing, now), null);
  const stale = structuredClone(raw);
  stale.coverage.at(-1).reviewScope += ' expanded';
  assert.equal(await validatePublication(stale, now), null);
});

test('approved paraphrases match the exact evidenced range, edition, locale and requested register', async () => {
  const { raw, link } = await fixture();
  const content = { id: 'test-paraphrase', kind: 'paraphrase', locale: 'en', register: 'genz', text: 'TEST editorial explanation of the whole range', origin: 'human_authored', basePassageIds: [...link.bibleEvidencePassageIds], reviewedSourceHashes: Object.fromEntries(link.bibleEvidencePassageIds.map(id => [id, link.reviewedSourceHashes[id]])), sourceIds: ['https://example.invalid/test-source'] };
  content.review = approval(await editorialContentHash(content), content.basePassageIds);
  raw.approvedParaphrases.push(content);
  const publication = await validatePublication(raw, now);
  assert.ok(publication);
  assert.equal(selectApprovedParaphrase(publication, selected(16, 18), 'en').id, content.id);
  assert.equal(selectApprovedParaphrase(publication, selected(16), 'en'), null, 'Do not relabel a range paraphrase as a single verse.');
  assert.equal(selectApprovedParaphrase(publication, selected(16, 18, 'other-edition'), 'en'), null);
  assert.equal(selectApprovedParaphrase(publication, selected(16, 18), 'yo'), null);
  assert.equal(selectApprovedParaphrase(publication, selected(16, 18), 'en', 'plain'), null);
  const stale = structuredClone(raw);
  stale.approvedParaphrases[0].text += ' changed';
  assert.equal(await validatePublication(stale, now), null);
});

test('publication validation removes raw draft metadata and protects the validated snapshot from later mutation', async () => {
  const { raw } = await fixture();
  raw.blocked = [{ text: 'UNREVIEWED DRAFT: do not publish' }];
  raw.backlog.candidates = [{ text: 'UNREVIEWED CANDIDATE' }];
  const publication = await validatePublication(raw, now);
  assert.ok(isValidatedPublication(publication));
  assert.equal(publication.blocked, undefined);
  assert.equal(publication.backlog.candidates, undefined);
  raw.approvedComparisons[0].proposition = 'Changed after validation';
  assert.notEqual(publication.approvedComparisons[0].proposition, raw.approvedComparisons[0].proposition);
  assert.throws(() => { publication.approvedComparisons[0].proposition = 'Unsafe mutation'; }, TypeError);
});

test('publication loader shares successful requests, fails closed on errors, and permits a later retry', async () => {
  const { raw } = await fixture();
  let calls = 0;
  const load = createPublicationLoader(async () => { calls++; return raw; });
  const [a, b] = await Promise.all([load(), load()]);
  assert.ok(a);
  assert.strictEqual(a, b);
  assert.strictEqual(await load(), a);
  assert.equal(calls, 1);
  let failures = 0;
  const retry = createPublicationLoader(async () => { if (failures++ === 0) throw new Error('Offline'); return raw; });
  assert.equal(await retry(), null);
  assert.ok(await retry());
  let invalid = true;
  const repair = createPublicationLoader(async () => invalid ? { schemaVersion: 99 } : raw);
  assert.equal(await repair(), null);
  invalid = false;
  assert.ok(await repair());
});

test('one-to-many Quran references resolve actual selected units and surrounding context from the exact edition', async () => {
  const { link } = await fixture();
  assert.equal(link.quranRefs.length, 2);
  const first = readQuranPassage(corpus, link.quranRefs[0]);
  const second = readQuranPassage(corpus, link.quranRefs[1]);
  assert.deepEqual(first.verses.map(v => v.text), ['TEST FIXTURE 1:1']);
  assert.deepEqual(second.verses.map(v => v.text), ['TEST FIXTURE 2:1', 'TEST FIXTURE 2:2']);
  assert.deepEqual(second.after.map(v => v.number), [3]);
  const contextual = readQuranPassage(corpus, quran(2, 2));
  assert.deepEqual(contextual.before.map(v => v.number), [1]);
  assert.deepEqual(contextual.after.map(v => v.number), [3]);
  assert.equal(await quranEvidenceMatches(first, link), true);
  assert.equal(await quranEvidenceMatches(second, link), true);
});

test('missing Quran editions, missing units and changed reviewed wording never substitute a quote', async () => {
  const { link } = await fixture();
  assert.equal(readQuranPassage(corpus, quran(1, 1, undefined, 'other-quran-edition')), null);
  assert.equal(readQuranPassage(corpus, quran(2, 1, 4)), null);
  assert.equal(readQuranPassage(corpus, { ...quran(2, 2), end: { chapter: 2, unit: '1' } }), null);
  assert.equal(readQuranPassage(corpus, { ...quran(2, 1), corpus: 'hadith' }), null);
  assert.equal(readQuranPassage(null, quran(1, 1)), null);
  const missing = structuredClone(corpus);
  missing.surahs[1].verses.splice(1, 1);
  assert.equal(readQuranPassage(missing, quran(2, 1, 3)), null);
  const changed = structuredClone(corpus);
  changed.surahs[0].verses[0].text += ' UNREVIEWED CHANGE';
  assert.equal(await quranEvidenceMatches(readQuranPassage(changed, quran(1, 1)), link), false);
  const swapped = structuredClone(corpus);
  swapped.surahs[0].verses[0].text = corpus.surahs[1].verses[0].text;
  assert.equal(await quranEvidenceMatches(readQuranPassage(swapped, quran(1, 1)), link), false, 'Another approved verse hash cannot validate a changed reference.');
});

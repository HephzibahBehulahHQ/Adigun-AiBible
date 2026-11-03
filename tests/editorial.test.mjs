import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { comparisonContentHash, coverageContentHash, coverageCounts, editorialContentHash, explanationContentHash, expandReference, getCoverage, hashSourceText, invalidateComparison, sourceRevision, validateComparison, validateCoverage, validateEditorialContent, validateReference } from '../src/editorial.ts';
import { publishEditorial } from '../scripts/publish-editorial.mjs';

// Synthetic evidence and reviewer identities exist only in tests and never in production datasets.
const now = new Date('2026-11-03T12:00:00Z');
const ref = (corpus, workId, unit = '1') => ({ corpus, workId, editionId: `${corpus}-test`, referenceSystemId: `${corpus}-units`, start: { chapter: 1, unit } });
async function fixture() {
  const inventory = ['bible','quran','historical','hadith'].map(corpus => ({ id: `${corpus}-test`, corpus, version: 'test-v1', referenceSystemId: `${corpus}-units`, rights: { redistribute: true, adapt: true }, rightsEvidence: ['test-only-evidence'], works: [{ id: ({ bible: 'GEN', quran: 'QUR', historical: 'TEST-WORK', hadith: 'TEST-COLLECTION' })[corpus], chapters: [{ chapter: 1, units: ['1','2'] }] }] }));
  const sources = new Map();
  for (const [id, r] of [['b1',ref('bible','GEN')],['b2',ref('bible','GEN','2')],['q1',ref('quran','QUR')],['q2',ref('quran','QUR','2')]]) {
    const text = `TEST FIXTURE ${id}`;
    sources.set(id, { id, ref: r, editionVersion: 'test-v1', text, sourceContentHash: await hashSourceText(text) });
  }
  const ctx = { inventory, reviewers: [{ id: 'test-human', displayName: 'Test fixture reviewer', kind: 'human', active: true }], resolveSource: id => sources.get(id), now };
  const link = { id: 'test-link', bibleRefs: [ref('bible','GEN')], quranRefs: [ref('quran','QUR')], bibleEvidencePassageIds: ['b1'], quranEvidencePassageIds: ['q1'], reviewedSourceHashes: Object.fromEntries([...sources].map(([id,s]) => [id,s.sourceContentHash])), relationship: 'thematic', sourceLocale: 'en', proposition: 'Test-only limited proposition', explanationByLocale: { en: { text: 'Test-only explanation', origin: 'human_authored', derivedFromRevision: '', review: { status: 'draft', evidenceIds: ['b1','q1'] } } }, sourceIds: ['test-only-evidence'], review: { status: 'draft', evidenceIds: ['b1','q1'] } };
  return { ctx, sources, link };
}
const approval = (hash, evidenceIds) => ({ status: 'approved', reviewerId: 'test-human', reviewedAt: '2026-11-02', reviewedContentHash: hash, evidenceIds });
async function approve(link) {
  const revision = await sourceRevision(link);
  for (const [locale, explanation] of Object.entries(link.explanationByLocale)) {
    explanation.derivedFromRevision = revision;
    explanation.review = approval(await explanationContentHash(locale, explanation, revision), [...link.bibleEvidencePassageIds,...link.quranEvidencePassageIds]);
  }
  link.review = approval(await comparisonContentHash(link), [...link.bibleEvidencePassageIds,...link.quranEvidencePassageIds]);
  return link;
}

test('references include corpus, work, edition and inventory; Quran rejects Hadith and bad bounds', async () => {
  const { ctx } = await fixture();
  assert.equal(validateReference(ref('quran','QUR'),ctx.inventory,'quran').valid,true);
  assert.equal(validateReference(ref('hadith','TEST-COLLECTION'),ctx.inventory,'quran').valid,false);
  assert.equal(validateReference(ref('quran','QUR','3'),ctx.inventory).valid,false);
  assert.equal(validateReference(ref('bible','JHN'),ctx.inventory).valid,false);
  assert.equal(validateReference({ ...ref('bible','GEN'), editionId:'missing' },ctx.inventory).valid,false);
  assert.equal(validateReference(ref('historical','TEST-WORK'),ctx.inventory).valid,true);
  assert.equal(validateReference({ ...ref('bible','GEN','2'), end:{chapter:1,unit:'1'} },ctx.inventory).valid,false);
  assert.equal(expandReference({ ...ref('bible','GEN'),end:{chapter:1,unit:'2'} },ctx.inventory).length,2);
});
test('real approval dependencies validate; absent registry and forged identity fail', async () => {
  const { ctx, link } = await fixture(); await approve(link);
  assert.deepEqual(await validateComparison(link,ctx),{valid:true,errors:[]});
  assert.equal((await validateComparison(link,{...ctx,reviewers:[]})).valid,false);
  link.review.reviewerId = 'invented'; assert.equal((await validateComparison(link,ctx)).valid,false);
});
test('approval needs a date and a complete exact range of edition-specific evidence', async () => {
  const { ctx, link } = await fixture(); link.bibleRefs[0].end = {chapter:1,unit:'2'}; await approve(link);
  assert.equal((await validateComparison(link,ctx)).valid,false);
  link.bibleEvidencePassageIds.push('b2'); await approve(link); assert.equal((await validateComparison(link,ctx)).valid,true);
  link.review.reviewedAt = '2026-02-30'; assert.equal((await validateComparison(link,ctx)).valid,false);
  link.review.reviewedAt = '2099-01-01'; assert.equal((await validateComparison(link,ctx)).valid,false);
});
test('edits to a claim, reference, evidence ID or exact source text invalidate publication', async () => {
  const { ctx, link, sources } = await fixture(); await approve(link);
  for (const mutate of [l=>{l.proposition+=' changed';},l=>{l.bibleRefs[0].start.unit='2';},l=>{l.bibleEvidencePassageIds=['b2'];},l=>{l.reviewedSourceHashes.b1='bad';}]) {
    const edited=structuredClone(link); mutate(edited); assert.equal((await validateComparison(edited,ctx)).valid,false);
  }
  sources.get('b1').text += ' changed'; assert.equal((await validateComparison(link,ctx)).valid,false);
});
test('translations need independent approval; source edits stale every translation', async () => {
  const { ctx, link } = await fixture(); await approve(link);
  link.explanationByLocale.yo={text:'Test-only Yoruba fixture',origin:'ai_assisted',derivedFromRevision:await sourceRevision(link),review:{status:'draft',evidenceIds:['b1','q1']}};
  link.review=approval(await comparisonContentHash(link),['b1','q1']); assert.equal((await validateComparison(link,ctx)).valid,false);
  await approve(link); assert.equal((await validateComparison(link,ctx)).valid,true);
  const next=structuredClone(link); next.explanationByLocale.en.text+=' revised';
  const invalidated=await invalidateComparison(link,next);
  assert.equal(invalidated.review.status,'in_review'); assert.equal(invalidated.explanationByLocale.yo.review.status,'in_review');
  assert.equal((await validateComparison(next,ctx)).valid,false);
});
test('unavailable or unevidenced rights fail closed; exact edition versions matter', async () => {
  const { ctx, link, sources } = await fixture(); await approve(link);
  ctx.inventory[1].rightsEvidence=[]; assert.equal((await validateComparison(link,ctx)).valid,false);
  ctx.inventory[1].rightsEvidence=['test-only']; sources.get('q1').editionVersion='test-v2'; assert.equal((await validateComparison(link,ctx)).valid,false);
});
test('five states are explicit; empty links default to unreviewed, never no-match', async () => {
  const { ctx, link } = await fixture(); const bibleRef=ref('bible','GEN');
  assert.equal(getCoverage([],bibleRef).status,'unreviewed');
  const row={bibleRef,status:'reviewed_no_match',approvedLinkIds:[],reviewScope:'Test-only Quran units 1:1–2',evidenceIds:['b1','q1','q2'],reviewedSourceHashes:link.reviewedSourceHashes};
  row.review=approval(await coverageContentHash(row),row.evidenceIds);
  assert.equal((await validateCoverage(row,[],ctx)).valid,true);
  const bad={...row,reviewScope:''}; assert.equal((await validateCoverage(bad,[],ctx)).valid,false);
  const counts=coverageCounts(['unreviewed','in_review','reviewed_with_links','reviewed_no_match','disputed'].map(status=>({bibleRef,status,approvedLinkIds:[]})));
  assert.deepEqual(Object.values(counts),[1,1,1,1,1]);
  assert.equal((await validateCoverage({bibleRef,status:'reviewed_with_links',approvedLinkIds:[]},[],ctx)).valid,false);
  assert.equal((await validateCoverage({...row,status:'disputed'},[],ctx)).valid,false);
});
test('paraphrases and discovery commentary require reviewed evidence and adaptation permission', async () => {
  const { ctx, link } = await fixture();
  const content={id:'test-paraphrase',kind:'paraphrase',locale:'en',text:'Test-only paraphrase',origin:'ai_assisted',basePassageIds:['b1'],reviewedSourceHashes:link.reviewedSourceHashes,sourceIds:['test-only-source'],review:{status:'draft',evidenceIds:['b1']}};
  assert.equal((await validateEditorialContent(content,ctx)).valid,false);
  content.review=approval(await editorialContentHash(content),['b1']); assert.equal((await validateEditorialContent(content,ctx)).valid,true);
  ctx.inventory[0].rights.adapt=false; assert.equal((await validateEditorialContent(content,ctx)).valid,false);
});
test('malformed imports return validation errors rather than approval or crashes', async () => {
  const { ctx, link }=await fixture();
  assert.equal((await validateComparison(null,ctx)).valid,false);
  link.explanationByLocale.en=null; assert.equal((await validateComparison(link,ctx)).valid,false);
  assert.equal((await validateEditorialContent({},ctx)).valid,false);
  assert.equal((await validateCoverage({},[],ctx)).valid,false);
});
test('all 50 original research leads survive verbatim and production has no test reviewers', async () => {
  const root=new URL('../',import.meta.url);
  const spec=await readFile(new URL('docs/specs/Adigun-AiBible_Codex_Master_Prompt.md',root),'utf8');
  const rows=spec.match(/^\| \d{2} \|.*$/gm);
  const {candidates}=JSON.parse(await readFile(new URL('content/editorial/candidates.json',root),'utf8'));
  assert.equal(candidates.length,50); assert.deepEqual(candidates.map(c=>c.originalTableRow),rows);
  assert.ok(candidates.every(c=>c.status==='draft'&&c.review.status==='draft'&&c.coverageStatus==='unreviewed'));
  const registry=JSON.parse(await readFile(new URL('content/editorial/reviewers.json',root),'utf8'));
  assert.deepEqual(registry.reviewers,[]);
});
test('publisher derives full backlog, publishes no fake approval, and fails closed on a forged approval', async () => {
  const root=await mkdtemp(join(tmpdir(),'editorial-tests-'));
  try {
    const write=async (path,value)=>{await mkdir(join(root,path,'..'),{recursive:true});await writeFile(join(root,path),JSON.stringify(value));};
    await write('data/manifest.json',{edition:{id:'eng-web',sha256:'test-sha'},books:[{id:'GEN'}]});
    await write('data/provenance.json',{editionId:'eng-web',archiveSha256:'test-sha',license:'Public domain TEST FIXTURE',licenseUrl:'test-only'});
    await write('data/books/GEN.json',{id:'GEN',chapters:[{number:1,verses:[{number:1,text:'TEST FIXTURE ONE'},{number:2,text:'TEST FIXTURE TWO'}]}]});
    await write('content/editorial/records.json',{schemaVersion:1,comparisons:[],content:[],coverage:[]});
    await write('content/editorial/reviewers.json',{schemaVersion:1,reviewers:[]});
    await write('content/editorial/candidates.json',{schemaVersion:1,candidates:[]});
    await write('content/editorial/source-inventory.json',{schemaVersion:1,editions:[],sources:[]});
    const artifact=await publishEditorial({root,now});
    assert.equal(artifact.approvedComparisons.length,0);assert.equal(artifact.backlog.totalSourceUnits,2);assert.equal(artifact.coverageCounts.unreviewed,2);
    const {link}=await fixture();await approve(link);
    await write('content/editorial/records.json',{schemaVersion:1,comparisons:[link],content:[],coverage:[]});
    await assert.rejects(()=>publishEditorial({root,now}),/Publication blocked/);
    const after=JSON.parse(await readFile(join(root,'data/editorial-published.json'),'utf8')); assert.deepEqual(after,artifact);
  } finally { await rm(root,{recursive:true,force:true}); }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { scanTranscript } from '../src/evidence/scanner.ts';
import { buildEvidenceReport, currentReview, evidenceKey, validateSession } from '../src/evidence/session.ts';

const session = {schemaVersion:1,id:'session-test',title:'My private transcript',transcript:'John 11:35 says "Jesus wept."',createdAt:'2026-11-04T07:00:00.000Z',updatedAt:'2026-11-04T07:00:00.000Z',reviews:{}};
const manifest = JSON.parse(await readFile(new URL('../data/manifest.json', import.meta.url), 'utf8'));
const report = await scanTranscript(session.transcript, [{manifest,book:async id=>JSON.parse(await readFile(new URL(`../data/books/${id}.json`, import.meta.url),'utf8'))}]);

test('session backups preserve private text but reject malformed identity, review state and size', () => {
  assert.deepEqual(validateSession(session), session);
  for (const invalid of [ {...session,schemaVersion:2}, {...session,id:'../unsafe'}, {...session,transcript:'x'.repeat(200001)}, {...session,reviews:{'finding-0-10':{status:'approved',note:'',evidenceKey:'abc:'}}}, {...session,reviews:JSON.parse('{"__proto__":{"status":"checked","note":"","evidenceKey":"abc:"}}')}, {...session,updatedAt:'yesterday'} ]) assert.throws(()=>validateSession(invalid));
});

test('import validation strips fabricated findings and editorial approval from backups', () => {
  const validated = validateSession({...session,report:{findings:[{category:'exact_quotation'}]},approved:true});
  assert.equal(validated.report, undefined);
  assert.equal(validated.approved, undefined);
});

test('review decisions are invalidated when transcript or compared source wording changes', () => {
  const finding = report.findings[0];
  const review = {status:'challenge',note:'I want to inspect the broader chapter.',evidenceKey:evidenceKey(report,finding)};
  const reviews = {[finding.id]:review};
  assert.deepEqual(currentReview(report,finding,reviews),review);
  assert.equal(currentReview({...report,transcriptHash:'0'.repeat(64)},finding,reviews).status,'pending');
  const changed = {...finding,evidence:finding.evidence.map(item=>({...item,passageHash:'f'.repeat(64)}))};
  assert.equal(currentReview(report,changed,reviews).status,'pending');
  assert.equal(currentReview(report,changed,reviews).note,'');
});

test('exported report includes exact transcript, source context, attribution, hash, uncertainty and personal review', () => {
  const finding = report.findings[0];
  const text = buildEvidenceReport(session.title,session.transcript,report,{[finding.id]:{status:'checked',note:'Read the surrounding account.',evidenceKey:evidenceKey(report,finding)}});
  for (const expected of ['Jesus wept.',session.transcript,'World English Bible',manifest.edition.licenseUrl,'Surrounding context:',finding.evidence[0].passageHash,'Read the surrounding account.','not editorial approval','No live audio']) assert.ok(text.includes(expected), expected);
});

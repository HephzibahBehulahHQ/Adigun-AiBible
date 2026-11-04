import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compareQuotation, detectReferences, MAX_SCAN_REFERENCES, MAX_TRANSCRIPT_LENGTH, scanTranscript, sha256 } from '../src/evidence/scanner.ts';

const manifest = JSON.parse(await readFile(new URL('../data/manifest.json', import.meta.url), 'utf8'));
const source = { manifest, book: async id => JSON.parse(await readFile(new URL(`../data/books/${id}.json`, import.meta.url), 'utf8')) };

test('scanner detects full book names, numbered aliases, ranges and exact transcript positions', () => {
  const text = '[01:20] First Corinthians 13:4–7; Jn. 3:16 and II Timothy 3:16.\n[00:02:14.500] Song of Songs 2:1.';
  const refs = detectReferences(text, manifest.books);
  assert.deepEqual(refs.map(item => item.reference), [{bookId:'1CO',chapter:13,verse:4,endVerse:7},{bookId:'JHN',chapter:3,verse:16},{bookId:'2TI',chapter:3,verse:16},{bookId:'SNG',chapter:2,verse:1}]);
  assert.equal(refs[0].timestamp.seconds, 80);
  assert.equal(refs[3].timestamp.seconds, 134.5);
  for (const ref of refs) assert.equal(text.slice(ref.span.start, ref.span.end), ref.span.text);
});

test('scanner retains invalid and cross-chapter citations as correction findings', async () => {
  const report = await scanTranscript('John 99:1 and John 3:16–4:2 and Genesis 1:99.', [source]);
  assert.equal(report.findings.length, 3);
  assert.ok(report.findings.every(finding => finding.category === 'insufficient_evidence' && !finding.evidence.length));
  assert.match(report.findings[1].uncertainty.join(' '), /crosses chapters/);
});

test('exact source evidence retains edition, cited words, surrounding context and checksum', async () => {
  const book = await source.book('JHN');
  const verse = book.chapters.find(chapter => chapter.number === 3).verses.find(item => item.number === 16);
  const text = `[00:42] John 3:16 says “${verse.text}”`;
  const report = await scanTranscript(text, [source]);
  const finding = report.findings[0], evidence = finding.evidence[0];
  assert.equal(finding.category, 'exact_quotation');
  assert.equal(finding.quotation.text, verse.text);
  assert.equal(finding.timestamp.seconds, 42);
  assert.equal(evidence.reference.editionId, 'eng-web');
  assert.deepEqual(evidence.verses, [verse]);
  assert.deepEqual(evidence.context.map(item => item.number), [14,15,16,17,18]);
  assert.match(evidence.passageHash, /^[a-f0-9]{64}$/);
  assert.equal(report.transcriptHash, await sha256(text));
  assert.equal(evidence.editionHash, manifest.edition.sha256);
});

test('a reference mention does not invent a quotation or assess a sermon’s interpretation', async () => {
  const report = await scanTranscript('Please read John 3:16. Here is my understanding of this passage.', [source]);
  assert.equal(report.findings[0].category, 'missing_context_requiring_review');
  assert.equal(report.findings[0].quotation, undefined);
  assert.equal(report.findings[0].evidence[0].match, 'not_compared');
});

test('different wording and a negation are never certified as exact Scripture', async () => {
  assert.notEqual(compareQuotation('God did not love the world', 'God did love the world'), 'exact_words');
  const report = await scanTranscript('John 3:16 says "People should always borrow a blue bicycle."', [source]);
  assert.equal(report.findings[0].category, 'insufficient_evidence');
  assert.match(report.findings[0].uncertainty.join(' '), /not proof of misquotation/);
});

test('explicit paraphrases remain labeled and alternative editions are compared independently', async () => {
  const report = await scanTranscript('To paraphrase John 3:16, "God loves people."', [source]);
  assert.equal(report.findings[0].category, 'explicit_paraphrase');
  const fixtureSource = { manifest: {...manifest,edition:{...manifest.edition,id:'test-fixture',name:'TEST FIXTURE — never published'}}, book: async id => ({id,name:'John',chapters:[{number:3,verses:[{number:16,text:'Fixture alternate wording for comparison testing only.'}]}]}) };
  const alternatives = await scanTranscript('John 3:16 says "Fixture alternate wording for comparison testing only."', [source, fixtureSource]);
  assert.equal(alternatives.findings[0].category, 'likely_alternative_edition');
  assert.equal(alternatives.findings[0].evidence[1].reference.editionId, 'test-fixture');
});

test('quotation association does not steal a nearby quote assigned to another reference', async () => {
  const report = await scanTranscript('John 11:35 says "Jesus wept." John 3:16 is also mentioned.', [source]);
  assert.equal(report.findings[0].category, 'exact_quotation');
  assert.equal(report.findings[1].quotation, undefined);
});

test('source absence, blank verse positions and wrong book identity remain unverified', async () => {
  const absent = await scanTranscript('Acts 8:37 says "A quotation unavailable in this edition."', [source]);
  assert.equal(absent.findings[0].category, 'insufficient_evidence');
  assert.equal(absent.findings[0].evidence.length, 0);
  const wrong = await scanTranscript('John 3:16', [{manifest,book:async()=>({id:'GEN',name:'Genesis',chapters:[]})}]);
  assert.match(wrong.findings[0].uncertainty.join(' '), /identity/);
  const offline = await scanTranscript('John 3:16', [{manifest,book:async()=>{throw Error('Book unavailable offline.');}}]);
  assert.match(offline.findings[0].uncertainty.join(' '), /offline/);
});

test('oversized inputs are rejected, reference limits disclosed and cancellation honored', async () => {
  assert.throws(() => detectReferences('x'.repeat(MAX_TRANSCRIPT_LENGTH + 1), manifest.books), /split/);
  const report = await scanTranscript('John 3:16\n'.repeat(MAX_SCAN_REFERENCES + 2), [source]);
  assert.equal(report.findings.length, MAX_SCAN_REFERENCES);
  assert.equal(report.detectedReferences, MAX_SCAN_REFERENCES + 2);
  assert.match(report.scope, /80 of 82/);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(scanTranscript('John 3:16', [source], {signal:abort.signal}), {name:'AbortError'});
});

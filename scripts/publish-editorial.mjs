#!/usr/bin/env node
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { coverageCounts, expandReference, getCoverage, hashSourceText, referenceKey, validateComparison, validateCoverage, validateEditorialContent } from '../src/editorial.ts';

const readJSON = async path => JSON.parse(await readFile(path, 'utf8'));
const ensureArray = (value, name) => { if (!Array.isArray(value)) throw new Error(`${name} must be an array.`); return value; };
const unique = (rows, key, label) => { const seen = new Set(); for (const row of rows) { const id = key(row); if (!id || seen.has(id)) throw new Error(`Missing or duplicate ${label}: ${id}`); seen.add(id); } };

/** Build from actual imported units; extra inventories/resolvers allow separate Quran imports. */
export async function publishEditorial({ root = resolve(import.meta.dirname, '..'), outputPath, inventoryPath, now = new Date() } = {}) {
  const editorial = resolve(root, 'content/editorial');
  const [manifest, provenance, records, registry, queue, external] = await Promise.all([
    readJSON(resolve(root, 'data/manifest.json')), readJSON(resolve(root, 'data/provenance.json')),
    readJSON(resolve(editorial, 'records.json')), readJSON(resolve(editorial, 'reviewers.json')),
    readJSON(resolve(editorial, 'candidates.json')), readJSON(inventoryPath ?? resolve(editorial, 'source-inventory.json')),
  ]);
  for (const [name, doc] of Object.entries({ records, registry, queue, external })) if (doc.schemaVersion !== 1) throw new Error(`${name}: unsupported schema version.`);
  const comparisons = ensureArray(records.comparisons, 'comparisons');
  const content = ensureArray(records.content, 'content');
  const coverageRows = ensureArray(records.coverage, 'coverage');
  const candidates = ensureArray(queue.candidates, 'candidates');
  const reviewers = ensureArray(registry.reviewers, 'reviewers');
  const extraEditions = ensureArray(external.editions, 'editions');
  const extraSources = ensureArray(external.sources, 'sources');
  unique([...comparisons, ...content], r => r.id, 'editorial record ID');
  unique(reviewers, r => r.id, 'reviewer ID');
  unique(candidates, r => r.id, 'candidate ID');
  unique(coverageRows, r => referenceKey(r.bibleRef), 'coverage address');
  if (candidates.some(c => c.status !== 'draft' || c.review?.status !== 'draft' || c.coverageStatus !== 'unreviewed')) throw new Error('Seed queue must remain unreviewed; create a separate comparison record for editorial work.');
  if (!manifest.edition?.id || !manifest.edition.sha256 || provenance.editionId !== manifest.edition.id || provenance.archiveSha256 !== manifest.edition.sha256) throw new Error('Bible edition provenance does not match its manifest.');
  const editionId = manifest.edition.id;
  const referenceSystemId = `${editionId}:publisher-numbering`;
  const books = await Promise.all(manifest.books.map(book => readJSON(resolve(root, 'data/books', `${book.id}.json`))));
  const sourceMap = new Map();
  const baseInventory = { id: editionId, corpus: 'bible', version: manifest.edition.sha256, referenceSystemId,
    rights: { redistribute: /public domain/i.test(provenance.license ?? ''), adapt: /public domain/i.test(provenance.license ?? '') },
    rightsEvidence: provenance.licenseUrl ? [provenance.licenseUrl] : [],
    works: books.map(book => ({ id: book.id, chapters: book.chapters.map(ch => ({ chapter: ch.number, units: ch.verses.map(v => String(v.number)) })) })) };
  const inventory = [baseInventory, ...extraEditions];
  unique(inventory, e => e.id, 'edition ID');
  for (const edition of inventory) {
    if (!['bible','quran','historical','hadith'].includes(edition.corpus) || !edition.version || !edition.referenceSystemId || !edition.rights || !Array.isArray(edition.rightsEvidence) || !Array.isArray(edition.works)) throw new Error('Malformed edition inventory.');
    unique(edition.works, w => w.id, 'work ID');
    for (const work of edition.works) {
      unique(ensureArray(work.chapters, 'chapters'), ch => ch.chapter, 'chapter');
      for (const ch of work.chapters) {
        if (!Number.isInteger(ch.chapter) || ch.chapter < 1 || !Array.isArray(ch.units) || ch.units.some(u => typeof u !== 'string' || !u.trim())) throw new Error('Malformed unit inventory.');
        unique(ch.units, u => u, 'source unit');
      }
    }
  }
  const needed = new Set([
    ...comparisons.flatMap(c => [...(c.bibleEvidencePassageIds ?? []), ...(c.quranEvidencePassageIds ?? [])]),
    ...content.flatMap(c => c.basePassageIds ?? []), ...coverageRows.flatMap(c => c.evidenceIds ?? []),
  ]);
  const allBibleRefs = [];
  for (const book of books) for (const chapter of book.chapters) for (const verse of chapter.verses) {
    const id = `${editionId}:${book.id}:${chapter.number}:${verse.number}`;
    const ref = { corpus: 'bible', workId: book.id, editionId, referenceSystemId, start: { chapter: chapter.number, unit: String(verse.number) } };
    allBibleRefs.push(ref);
    if (needed.has(id)) sourceMap.set(id, { id, ref, editionVersion: baseInventory.version, text: verse.text, sourceContentHash: await hashSourceText(verse.text) });
  }
  unique(extraSources, s => s.id, 'external source ID');
  for (const source of extraSources) { if (sourceMap.has(source.id) || source.ref?.editionId === editionId) throw new Error('External sources cannot replace the imported Bible edition.'); sourceMap.set(source.id, source); }
  const ctx = { inventory, reviewers, now, resolveSource: id => sourceMap.get(id) };
  const approvedComparisons = [], approvedParaphrases = [], approvedContent = [], blocked = [];
  let rejectedApprovals = 0;
  for (const link of comparisons) {
    const checked = await validateComparison(link, ctx);
    if (checked.valid) approvedComparisons.push(link);
    else { blocked.push({ id: link.id, kind: 'comparison', errors: checked.errors }); if (link.review?.status === 'approved') rejectedApprovals++; }
  }
  for (const entry of content) {
    const checked = await validateEditorialContent(entry, ctx);
    if (checked.valid) (entry.kind === 'paraphrase' ? approvedParaphrases : approvedContent).push(entry);
    else { blocked.push({ id: entry.id, kind: entry.kind, errors: checked.errors }); if (entry.review?.status === 'approved') rejectedApprovals++; }
  }
  const acceptedCoverage = [];
  for (const row of coverageRows) {
    const checked = await validateCoverage(row, approvedComparisons, ctx);
    if (checked.valid) acceptedCoverage.push(row);
    else { blocked.push({ id: referenceKey(row.bibleRef), kind: 'coverage', errors: checked.errors }); if (['reviewed_with_links','reviewed_no_match','disputed'].includes(row.status)) rejectedApprovals++; }
  }
  const byAddress = new Map(acceptedCoverage.map(c => [referenceKey(c.bibleRef), c]));
  // Only genuinely validated links can establish positive coverage. Empty arrays prove nothing.
  for (const link of approvedComparisons) for (const ref of link.bibleRefs) for (const unit of expandReference(ref, inventory)) {
    const key = referenceKey(unit), existing = byAddress.get(key);
    if (existing?.status === 'reviewed_no_match' || existing?.status === 'disputed') { blocked.push({ id: key, kind: 'coverage', errors: ['Approved link conflicts with explicit no-match/disputed coverage.'] }); rejectedApprovals++; continue; }
    byAddress.set(key, { bibleRef: unit, status: 'reviewed_with_links', approvedLinkIds: [...new Set([...(existing?.approvedLinkIds ?? []), link.id])] });
  }
  const coverage = allBibleRefs.map(ref => byAddress.get(referenceKey(ref)) ?? getCoverage([], ref));
  const artifact = { schemaVersion: 1, editionId, referenceSystemId, approvedComparisons, approvedParaphrases, approvedContent,
    coverage, coverageCounts: coverageCounts(coverage), backlog: { totalSourceUnits: allBibleRefs.length, remainingSourceUnits: coverage.filter(c => c.status === 'unreviewed' || c.status === 'in_review' || c.status === 'disputed').length,
      candidateCount: candidates.length, candidates: candidates.map(({ id, bibleCandidateRaw, quranCandidateRaw, editorialRationale, rightsIssues, coverageStatus }) => ({ id, bibleCandidateRaw, quranCandidateRaw, editorialRationale, rightsIssues, coverageStatus })) }, blocked };
  if (rejectedApprovals) throw new Error(`Publication blocked: ${rejectedApprovals} purported approval(s) failed validation. ${JSON.stringify(blocked)}`);
  const path = outputPath ?? resolve(root, 'data/editorial-published.json');
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, JSON.stringify(artifact) + '\n');
  await rename(temporary, path);
  return artifact;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const inventoryIndex = process.argv.indexOf('--inventory');
  const outputIndex = process.argv.indexOf('--output');
  const artifact = await publishEditorial({ inventoryPath: inventoryIndex < 0 ? undefined : resolve(process.argv[inventoryIndex + 1]), outputPath: outputIndex < 0 ? undefined : resolve(process.argv[outputIndex + 1]) });
  console.log(JSON.stringify({ approvedComparisons: artifact.approvedComparisons.length, approvedParaphrases: artifact.approvedParaphrases.length, approvedContent: artifact.approvedContent.length, coverage: artifact.coverageCounts, backlog: artifact.backlog.remainingSourceUnits, pendingSeeds: artifact.backlog.candidateCount }));
}

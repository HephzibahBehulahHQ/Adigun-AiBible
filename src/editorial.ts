/** Editorial contracts and fail-closed publication gates. No generated approvals. */
export type Corpus = 'bible' | 'quran' | 'historical' | 'hadith';
export type UiLocale = 'en' | 'de' | 'yo' | 'pcm';
export type EditorialStatus = 'draft' | 'in_review' | 'approved' | 'disputed' | 'rejected';
export type CoverageStatus = 'unreviewed' | 'in_review' | 'reviewed_with_links' | 'reviewed_no_match' | 'disputed';
export type Relationship = 'shared_claim' | 'differing_claim' | 'mixed' | 'thematic';
export interface PassageRef { corpus: Corpus; workId: string; editionId: string; referenceSystemId: string; start: { chapter: number; unit: string }; end?: { chapter: number; unit: string } }
export interface EditionInventory { id: string; corpus: Corpus; version: string; referenceSystemId: string; rights: { redistribute: boolean; adapt: boolean }; rightsEvidence: string[]; works: { id: string; chapters: { chapter: number; units: string[] }[] }[] }
export interface SourcePassage { id: string; ref: PassageRef; editionVersion: string; text: string; sourceContentHash: string }
export interface Reviewer { id: string; displayName: string; kind: 'human'; active: boolean }
export interface ReviewRecord { status: EditorialStatus; reviewerId?: string; reviewedAt?: string; reviewedContentHash?: string; evidenceIds: string[]; notes?: string }
export interface LocalizedExplanation { text: string; origin: 'human_authored' | 'ai_assisted'; derivedFromRevision: string; review: ReviewRecord }
export interface ComparisonLink { id: string; bibleRefs: PassageRef[]; quranRefs: PassageRef[]; bibleEvidencePassageIds: string[]; quranEvidencePassageIds: string[]; reviewedSourceHashes: Record<string, string>; relationship: Relationship; sourceLocale: UiLocale; proposition: string; explanationByLocale: Partial<Record<UiLocale, LocalizedExplanation>>; sharedPoints?: string[]; differingPoints?: string[]; interpretationNote?: string; sourceIds: string[]; review: ReviewRecord }
export interface ComparisonCoverage { bibleRef: PassageRef; status: CoverageStatus; approvedLinkIds: string[]; reviewScope?: string; evidenceIds?: string[]; reviewedSourceHashes?: Record<string, string>; review?: ReviewRecord; positions?: { label: string; explanation: string; evidenceIds: string[] }[] }
export interface EditorialContent { id: string; kind: 'paraphrase' | 'mood' | 'caption' | 'context' | 'question_answer'; locale: UiLocale; text: string; origin: 'human_authored' | 'ai_assisted'; basePassageIds: string[]; reviewedSourceHashes: Record<string, string>; sourceIds: string[]; review: ReviewRecord; register?: 'plain' | 'genz' | 'pidgin_study'; interpretiveQualification?: string }
export interface ValidationContext { inventory: EditionInventory[]; reviewers: Reviewer[]; resolveSource: (id: string) => SourcePassage | undefined; now?: Date }
export interface ValidationResult { valid: boolean; errors: string[] }
const corpora: Corpus[] = ['bible', 'quran', 'historical', 'hadith'];
const locales: UiLocale[] = ['en', 'de', 'yo', 'pcm'];
const relationships: Relationship[] = ['shared_claim', 'differing_claim', 'mixed', 'thematic'];
const statuses: CoverageStatus[] = ['unreviewed', 'in_review', 'reviewed_with_links', 'reviewed_no_match', 'disputed'];
const nonempty = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0;
const object = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const strings = (x: unknown): x is string[] => Array.isArray(x) && x.every(nonempty);
const result = (errors: string[]): ValidationResult => ({ valid: errors.length === 0, errors });
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  if (object(value)) return '{' + Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
  return JSON.stringify(value) ?? 'null';
}
export async function hashContent(value: unknown): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(stableStringify(value)));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
/** Exact UTF-8 source text hash; do not normalize or silently rewrite source text. */
export async function hashSourceText(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
export function referenceKey(ref: PassageRef): string { return stableStringify(ref); }
export function validateReference(value: unknown, inventory: EditionInventory[], expected?: Corpus): ValidationResult {
  const errors: string[] = [];
  if (!object(value) || !corpora.includes(value.corpus as Corpus) || !nonempty(value.workId) || !nonempty(value.editionId) || !nonempty(value.referenceSystemId) || !object(value.start)) return result(['Malformed passage reference.']);
  const ref = value as unknown as PassageRef;
  if (expected && ref.corpus !== expected) errors.push(`Expected ${expected} corpus; received ${ref.corpus}.`);
  if (ref.corpus === 'quran' && ref.workId !== 'QUR') errors.push('Quran references require workId QUR; Hadith is a separate corpus.');
  const edition = inventory.find(e => e.id === ref.editionId);
  if (!edition || edition.corpus !== ref.corpus || edition.referenceSystemId !== ref.referenceSystemId) return result([...errors, 'Edition or reference system is unavailable or mismatched.']);
  const work = edition.works.find(w => w.id === ref.workId);
  if (!work) return result([...errors, 'Work is absent from the selected edition.']);
  const units = work.chapters.flatMap(c => c.units.map(unit => ({ chapter: c.chapter, unit })));
  const index = (point: PassageRef['start']) => point && Number.isInteger(point.chapter) && nonempty(point.unit) ? units.findIndex(p => p.chapter === point.chapter && p.unit === point.unit) : -1;
  const start = index(ref.start), end = ref.end ? index(ref.end) : start;
  if (start < 0 || end < 0) errors.push('Reference is outside the actual edition inventory.');
  if (start >= 0 && end >= 0 && end < start) errors.push('Reference range is reversed.');
  return result(errors);
}
export function expandReference(ref: PassageRef, inventory: EditionInventory[]): PassageRef[] {
  const checked = validateReference(ref, inventory);
  if (!checked.valid) throw new Error(checked.errors.join(' '));
  const work = inventory.find(e => e.id === ref.editionId)!.works.find(w => w.id === ref.workId)!;
  const units = work.chapters.flatMap(c => c.units.map(unit => ({ chapter: c.chapter, unit })));
  const start = units.findIndex(p => p.chapter === ref.start.chapter && p.unit === ref.start.unit);
  const end = ref.end ? units.findIndex(p => p.chapter === ref.end!.chapter && p.unit === ref.end!.unit) : start;
  return units.slice(start, end + 1).map(point => ({ corpus: ref.corpus, workId: ref.workId, editionId: ref.editionId, referenceSystemId: ref.referenceSystemId, start: point }));
}
export function getCoverage(records: ComparisonCoverage[], ref: PassageRef): ComparisonCoverage {
  return records.find(r => referenceKey(r.bibleRef) === referenceKey(ref)) ?? { bibleRef: ref, status: 'unreviewed', approvedLinkIds: [] };
}
export function coverageCounts(records: ComparisonCoverage[]): Record<CoverageStatus, number> {
  const counts = Object.fromEntries(statuses.map(s => [s, 0])) as Record<CoverageStatus, number>;
  for (const record of records) counts[record.status]++;
  return counts;
}
function claimPayload(link: ComparisonLink) {
  return { id: link.id, bibleRefs: link.bibleRefs, quranRefs: link.quranRefs, bibleEvidencePassageIds: link.bibleEvidencePassageIds, quranEvidencePassageIds: link.quranEvidencePassageIds, reviewedSourceHashes: link.reviewedSourceHashes, relationship: link.relationship, sourceLocale: link.sourceLocale, proposition: link.proposition, sourceExplanation: link.explanationByLocale[link.sourceLocale]?.text, sharedPoints: link.sharedPoints, differingPoints: link.differingPoints, interpretationNote: link.interpretationNote, sourceIds: link.sourceIds };
}
export async function sourceRevision(link: ComparisonLink): Promise<string> { return hashContent(claimPayload(link)); }
export async function comparisonContentHash(link: ComparisonLink): Promise<string> {
  const explanations = Object.fromEntries(Object.entries(link.explanationByLocale).map(([locale, e]) => [locale, { text: e?.text, origin: e?.origin, derivedFromRevision: e?.derivedFromRevision }]));
  return hashContent({ ...claimPayload(link), explanations });
}
export async function explanationContentHash(locale: UiLocale, explanation: LocalizedExplanation, revision: string): Promise<string> {
  return hashContent({ locale, text: explanation.text, origin: explanation.origin, derivedFromRevision: explanation.derivedFromRevision, sourceRevision: revision });
}
export async function editorialContentHash(content: EditorialContent): Promise<string> { return hashContent(Object.fromEntries(Object.entries(content).filter(([key]) => key !== 'review'))); }
export async function coverageContentHash(coverage: ComparisonCoverage): Promise<string> { return hashContent(Object.fromEntries(Object.entries(coverage).filter(([key]) => key !== 'review'))); }
function validateReview(review: ReviewRecord | undefined, hash: string, evidence: string[], ctx: ValidationContext): string[] {
  if (!review || review.status !== 'approved') return ['Human approval is pending.'];
  const errors: string[] = [];
  const reviewer = ctx.reviewers.find(r => r.id === review.reviewerId && r.kind === 'human' && r.active && nonempty(r.displayName));
  if (!reviewer) errors.push('Approval requires an active registered human reviewer.');
  const date = typeof review.reviewedAt === 'string' ? Date.parse(review.reviewedAt) : NaN;
  if (!Number.isFinite(date) || !/^\d{4}-\d{2}-\d{2}(T.*Z)?$/.test(review.reviewedAt ?? '') || (Number.isFinite(date) && new Date(date).toISOString().slice(0, 10) !== review.reviewedAt?.slice(0, 10)) || date > (ctx.now ?? new Date()).getTime()) errors.push('Approval requires a valid nonfuture review date.');
  if (review.reviewedContentHash !== hash) errors.push('Approval hash is stale or missing.');
  if (!strings(review.evidenceIds) || evidence.some(id => !review.evidenceIds.includes(id))) errors.push('Approval evidence does not cover its source dependencies.');
  return errors;
}
async function validateEvidence(ids: string[], hashes: Record<string, string>, ctx: ValidationContext, adapt = false): Promise<string[]> {
  const errors: string[] = [];
  if (!strings(ids) || ids.length === 0 || !object(hashes)) return ['Source evidence and dependency hashes are required.'];
  if (new Set(ids).size !== ids.length) errors.push('Duplicate evidence IDs.');
  for (const id of ids) {
    const source = ctx.resolveSource(id);
    if (!source) { errors.push(`Missing source evidence: ${id}.`); continue; }
    const check = validateReference(source.ref, ctx.inventory);
    errors.push(...check.errors.map(e => `${id}: ${e}`));
    const edition = ctx.inventory.find(e => e.id === source.ref.editionId);
    if (!nonempty(source.text) || source.ref.end) errors.push(`${id}: evidence must resolve to a nonempty atomic source unit.`);
    if (!edition || edition.version !== source.editionVersion) errors.push(`${id}: edition version differs from the reviewed evidence.`);
    if (!edition?.rights.redistribute || !edition.rightsEvidence.length || (adapt && !edition.rights.adapt)) errors.push(`${id}: required rights are unavailable or lack evidence.`);
    if (source.sourceContentHash !== await hashSourceText(source.text) || hashes[id] !== source.sourceContentHash) errors.push(`${id}: source hash changed or does not match exact source text.`);
  }
  return errors;
}
export async function validateComparison(value: unknown, ctx: ValidationContext): Promise<ValidationResult> {
  if (!object(value) || !nonempty(value.id) || !nonempty(value.proposition) || !relationships.includes(value.relationship as Relationship) || !locales.includes(value.sourceLocale as UiLocale) || !Array.isArray(value.bibleRefs) || !value.bibleRefs.length || !Array.isArray(value.quranRefs) || !value.quranRefs.length || !strings(value.bibleEvidencePassageIds) || !strings(value.quranEvidencePassageIds) || !object(value.reviewedSourceHashes) || !object(value.explanationByLocale) || !strings(value.sourceIds) || !value.sourceIds.length) return result(['Malformed comparison record.']);
  const link = value as unknown as ComparisonLink;
  const errors: string[] = [];
  const allIds = [...link.bibleEvidencePassageIds, ...link.quranEvidencePassageIds];
  errors.push(...await validateEvidence(allIds, link.reviewedSourceHashes, ctx));
  for (const [refs, ids, expected] of [[link.bibleRefs, link.bibleEvidencePassageIds, 'bible'], [link.quranRefs, link.quranEvidencePassageIds, 'quran']] as const) {
    const expectedKeys = new Set<string>();
    for (const ref of refs) { const checked = validateReference(ref, ctx.inventory, expected); errors.push(...checked.errors); if (checked.valid) expandReference(ref, ctx.inventory).forEach(r => expectedKeys.add(referenceKey(r))); }
    const evidenceKeys = new Set<string>();
    for (const id of ids) { const source = ctx.resolveSource(id); if (source) { if (source.ref.corpus !== expected) errors.push(`Evidence ${id} is not ${expected}.`); evidenceKeys.add(referenceKey(source.ref)); } }
    if (expectedKeys.size !== evidenceKeys.size || [...expectedKeys].some(k => !evidenceKeys.has(k))) errors.push(`${expected}: evidence does not exactly cover the cited reference ranges.`);
  }
  if (link.relationship === 'mixed' && (!link.sharedPoints?.length || !link.differingPoints?.length)) errors.push('Mixed claims require separate shared and differing points.');
  if (!link.explanationByLocale[link.sourceLocale]) errors.push('Source explanation is missing.');
  const revision = await sourceRevision(link);
  for (const [locale, explanation] of Object.entries(link.explanationByLocale)) {
    if (!locales.includes(locale as UiLocale) || !object(explanation) || !nonempty(explanation.text) || !['human_authored', 'ai_assisted'].includes(explanation.origin)) { errors.push(`Malformed explanation: ${locale}.`); continue; }
    if (explanation.derivedFromRevision !== revision) errors.push(`${locale}: explanation or translation is stale.`);
    errors.push(...validateReview(explanation.review, await explanationContentHash(locale as UiLocale, explanation, revision), allIds, ctx).map(e => `${locale}: ${e}`));
  }
  errors.push(...validateReview(link.review, await comparisonContentHash(link), allIds, ctx));
  return result(errors);
}
export async function validateEditorialContent(value: unknown, ctx: ValidationContext): Promise<ValidationResult> {
  if (!object(value) || !nonempty(value.id) || !['paraphrase', 'mood', 'caption', 'context', 'question_answer'].includes(value.kind as string) || !locales.includes(value.locale as UiLocale) || !nonempty(value.text) || !['human_authored', 'ai_assisted'].includes(value.origin as string) || !strings(value.basePassageIds) || !strings(value.sourceIds) || !value.sourceIds.length || !object(value.reviewedSourceHashes)) return result(['Malformed editorial content.']);
  const content = value as unknown as EditorialContent;
  return result([...await validateEvidence(content.basePassageIds, content.reviewedSourceHashes, ctx, content.kind === 'paraphrase'), ...validateReview(content.review, await editorialContentHash(content), content.basePassageIds, ctx)]);
}
export async function validateCoverage(value: unknown, links: ComparisonLink[], ctx: ValidationContext): Promise<ValidationResult> {
  if (!object(value) || !statuses.includes(value.status as CoverageStatus) || !strings(value.approvedLinkIds)) return result(['Malformed coverage record.']);
  const row = value as unknown as ComparisonCoverage;
  const errors = validateReference(row.bibleRef, ctx.inventory, 'bible').errors;
  if (row.status === 'reviewed_with_links') {
    if (!row.approvedLinkIds.length) errors.push('Reviewed-with-links requires approved links.');
    for (const id of row.approvedLinkIds) {
      const link = links.find(l => l.id === id);
      if (!link) { errors.push(`Missing approved link: ${id}.`); continue; }
      errors.push(...(await validateComparison(link, ctx)).errors);
      const wanted = referenceKey(row.bibleRef);
      if (!link.bibleRefs.some(ref => validateReference(ref, ctx.inventory).valid && expandReference(ref, ctx.inventory).some(r => referenceKey(r) === wanted))) errors.push(`Link ${id} does not cover this passage.`);
    }
  } else if (row.approvedLinkIds.length) errors.push('Only reviewed-with-links may list approved links.');
  if (row.status === 'reviewed_no_match' || row.status === 'disputed') {
    if (!nonempty(row.reviewScope)) errors.push('Review scope is required; absence of links is not evidence of no match.');
    errors.push(...await validateEvidence(row.evidenceIds ?? [], row.reviewedSourceHashes ?? {}, ctx));
    errors.push(...validateReview(row.review, await coverageContentHash(row), row.evidenceIds ?? [], ctx));
    const evidence = (row.evidenceIds ?? []).map(id => ctx.resolveSource(id)).filter((s): s is SourcePassage => !!s);
    if (!evidence.some(s => referenceKey(s.ref) === referenceKey(row.bibleRef))) errors.push('Coverage evidence must include the Bible passage being reviewed.');
    if (!evidence.some(s => s.ref.corpus === 'quran')) errors.push('Comparison review scope requires actual Quran source evidence.');
    if (row.status === 'disputed' && (!row.positions || row.positions.length < 2 || row.positions.some(p => !nonempty(p.label) || !nonempty(p.explanation) || !strings(p.evidenceIds) || !p.evidenceIds.length || p.evidenceIds.some(id => !row.evidenceIds?.includes(id))))) errors.push('Disputed coverage requires at least two sourced positions.');
  }
  return result(errors);
}
/** Call after edits. Approval never carries across changed claims, source hashes or translations. */
export async function invalidateComparison(previous: ComparisonLink, next: ComparisonLink): Promise<ComparisonLink> {
  if (await comparisonContentHash(previous) === await comparisonContentHash(next)) return next;
  const changedSource = await sourceRevision(previous) !== await sourceRevision(next);
  const copy = structuredClone(next);
  copy.review = { status: 'in_review', evidenceIds: [...next.review.evidenceIds], notes: 'Content changed; human re-review required.' };
  for (const locale of locales) {
    const explanation = copy.explanationByLocale[locale];
    if (explanation && (changedSource || stableStringify(previous.explanationByLocale[locale]) !== stableStringify(next.explanationByLocale[locale]))) explanation.review = { status: 'in_review', evidenceIds: [...explanation.review.evidenceIds], notes: 'Source revision or translation changed; human re-review required.' };
  }
  return copy;
}

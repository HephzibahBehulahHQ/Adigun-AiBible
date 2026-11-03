import { DEFAULT_EDITION_ID, isReference } from './domain.ts';
import { comparisonContentHash, coverageContentHash, editorialContentHash, explanationContentHash, hashSourceText, sourceRevision } from './editorial.ts';
import type { ComparisonCoverage, ComparisonLink, CoverageStatus, EditorialContent, LocalizedExplanation, PassageRef, ReviewRecord, UiLocale } from './editorial';
import type { Edition, Reference } from './types';

export interface PublishedEditorial {
  schemaVersion: 1;
  editionId: string;
  referenceSystemId?: string;
  approvedComparisons: ComparisonLink[];
  approvedParaphrases: EditorialContent[];
  approvedContent: EditorialContent[];
  coverage: ComparisonCoverage[];
  coverageCounts: Record<CoverageStatus, number>;
  backlog: { totalSourceUnits: number; remainingSourceUnits: number; candidateCount: number };
}
export interface QuranCorpus {
  schemaVersion: number;
  edition: Edition;
  surahs: { number: number; name?: string; verses: { number: number; text: string }[] }[];
}
export interface QuranExcerpt {
  edition: Edition;
  verses: { chapter: number; number: number; text: string }[];
  before: { chapter: number; number: number; text: string }[];
  after: { chapter: number; number: number; text: string }[];
}
export interface PassageCoverage {
  status: CoverageStatus | 'partial';
  totalUnits: number;
  reviewedUnits: number;
  rows: ComparisonCoverage[];
}

const statuses: CoverageStatus[] = ['unreviewed', 'in_review', 'reviewed_with_links', 'reviewed_no_match', 'disputed'];
const locales: UiLocale[] = ['en', 'de', 'yo', 'pcm'];
const trusted = new WeakSet<PublishedEditorial>();
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(text);
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(value);
const sha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const numericUnit = (unit: string) => /^[1-9]\d*$/.test(unit) && Number.isSafeInteger(Number(unit)) ? Number(unit) : null;
const pointOrder = (a: { chapter: number; unit: string }, b: { chapter: number; unit: string }) => a.chapter - b.chapter || Number(a.unit) - Number(b.unit);

function passage(value: unknown, corpus: 'bible' | 'quran'): value is PassageRef {
  if (!object(value) || value.corpus !== corpus || !identifier(value.editionId) || !text(value.referenceSystemId) || !object(value.start)) return false;
  if (corpus === 'quran' ? value.workId !== 'QUR' : typeof value.workId !== 'string' || !/^[1-3]?[A-Z]{2,3}$/.test(value.workId)) return false;
  const point = (p: unknown) => object(p) && Number.isSafeInteger(p.chapter) && Number(p.chapter) > 0 && text(p.unit) && p.unit.length < 40;
  if (!point(value.start) || (value.end !== undefined && !point(value.end))) return false;
  const ref = value as unknown as PassageRef;
  if (ref.end && (ref.end.chapter < ref.start.chapter || (ref.end.chapter === ref.start.chapter && numericUnit(ref.start.unit) !== null && numericUnit(ref.end.unit) !== null && pointOrder(ref.end, ref.start) < 0))) return false;
  return true;
}
function dependencies(ids: unknown, hashes: unknown): ids is string[] {
  return strings(ids) && ids.length > 0 && new Set(ids).size === ids.length && object(hashes) && Object.values(hashes).every(sha) && ids.every(id => sha(hashes[id]));
}
function approvedReview(value: unknown, hash: string, evidence: string[], now: Date): value is ReviewRecord {
  if (!object(value) || value.status !== 'approved' || !text(value.reviewerId) || !text(value.reviewedAt) || !strings(value.evidenceIds) || value.reviewedContentHash !== hash) return false;
  const date = Date.parse(value.reviewedAt);
  const evidenceIds = value.evidenceIds;
  return /^\d{4}-\d{2}-\d{2}(T.*Z)?$/.test(value.reviewedAt) && Number.isFinite(date) && date <= now.getTime() && new Date(date).toISOString().slice(0, 10) === value.reviewedAt.slice(0, 10) && evidence.every(id => evidenceIds.includes(id));
}
async function approvedComparison(value: unknown, now: Date): Promise<boolean> {
  if (!object(value) || !text(value.id) || !text(value.proposition) || !['shared_claim', 'differing_claim', 'mixed', 'thematic'].includes(String(value.relationship)) || !locales.includes(value.sourceLocale as UiLocale) || !Array.isArray(value.bibleRefs) || !value.bibleRefs.length || !value.bibleRefs.every(r => passage(r, 'bible')) || !Array.isArray(value.quranRefs) || !value.quranRefs.length || !value.quranRefs.every(r => passage(r, 'quran')) || !dependencies(value.bibleEvidencePassageIds, value.reviewedSourceHashes) || !dependencies(value.quranEvidencePassageIds, value.reviewedSourceHashes) || !strings(value.sourceIds) || !value.sourceIds.length || !object(value.explanationByLocale)) return false;
  const link = value as unknown as ComparisonLink;
  for (const points of [link.sharedPoints, link.differingPoints]) if (points !== undefined && !strings(points)) return false;
  if (link.interpretationNote !== undefined && !text(link.interpretationNote)) return false;
  if (link.relationship === 'mixed' && (!link.sharedPoints?.length || !link.differingPoints?.length)) return false;
  if (!link.explanationByLocale[link.sourceLocale]) return false;
  const evidence = [...link.bibleEvidencePassageIds, ...link.quranEvidencePassageIds];
  if (new Set(evidence).size !== evidence.length) return false;
  const revision = await sourceRevision(link);
  for (const [locale, explanation] of Object.entries(link.explanationByLocale)) {
    if (!locales.includes(locale as UiLocale) || !object(explanation) || !text(explanation.text) || !['human_authored', 'ai_assisted'].includes(String(explanation.origin)) || explanation.derivedFromRevision !== revision) return false;
    if (!approvedReview(explanation.review, await explanationContentHash(locale as UiLocale, explanation as unknown as LocalizedExplanation, revision), evidence, now)) return false;
  }
  return approvedReview(link.review, await comparisonContentHash(link), evidence, now);
}
async function approvedContent(value: unknown, paraphrase: boolean, now: Date): Promise<boolean> {
  if (!object(value) || !text(value.id) || !text(value.text) || !locales.includes(value.locale as UiLocale) || !['human_authored', 'ai_assisted'].includes(String(value.origin)) || !dependencies(value.basePassageIds, value.reviewedSourceHashes) || !strings(value.sourceIds) || !value.sourceIds.length) return false;
  if (paraphrase ? value.kind !== 'paraphrase' : !['mood', 'caption', 'context', 'question_answer'].includes(String(value.kind))) return false;
  if (value.register !== undefined && !['plain', 'genz', 'pidgin_study'].includes(String(value.register))) return false;
  if (value.interpretiveQualification !== undefined && !text(value.interpretiveQualification)) return false;
  return approvedReview(value.review, await editorialContentHash(value as unknown as EditorialContent), value.basePassageIds, now);
}
const address = (ref: PassageRef) => `${ref.editionId}:${ref.workId}:${ref.start.chapter}:${ref.start.unit}`;

/** Exact edition and book are mandatory; numeric reader selections may overlap an approved range. */
export function matchesReference(cited: PassageRef, selected: Reference): boolean {
  if (!passage(cited, 'bible') || !isReference(selected) || cited.editionId !== (selected.editionId || DEFAULT_EDITION_ID) || cited.workId !== selected.bookId) return false;
  const end = cited.end ?? cited.start;
  if (numericUnit(cited.start.unit) === null || numericUnit(end.unit) === null) return false;
  const startSelection = { chapter: selected.chapter, unit: String(selected.verse) };
  const endSelection = { chapter: selected.chapter, unit: String(selected.endVerse ?? selected.verse) };
  return pointOrder(cited.start, endSelection) <= 0 && pointOrder(end, startSelection) >= 0;
}

async function validCoverage(value: unknown, links: ComparisonLink[], editionId: string, now: Date): Promise<boolean> {
  if (!object(value) || !passage(value.bibleRef, 'bible') || value.bibleRef.editionId !== editionId || value.bibleRef.end || !statuses.includes(value.status as CoverageStatus) || !strings(value.approvedLinkIds)) return false;
  const row = value as unknown as ComparisonCoverage;
  const unit = numericUnit(row.bibleRef.start.unit);
  if (unit === null) return false;
  const selected: Reference = { editionId, bookId: row.bibleRef.workId, chapter: row.bibleRef.start.chapter, verse: unit };
  if (row.status === 'reviewed_with_links') return row.approvedLinkIds.length > 0 && row.approvedLinkIds.every(id => links.some(link => link.id === id && link.bibleRefs.some(ref => matchesReference(ref, selected))));
  if (row.approvedLinkIds.length) return false;
  if (row.status === 'reviewed_no_match' || row.status === 'disputed') {
    if (!text(row.reviewScope) || !dependencies(row.evidenceIds, row.reviewedSourceHashes) || !approvedReview(row.review, await coverageContentHash(row), row.evidenceIds, now)) return false;
    if (links.some(link => link.bibleRefs.some(ref => matchesReference(ref, selected)))) return false;
    if (row.status === 'disputed' && (!Array.isArray(row.positions) || row.positions.length < 2 || row.positions.some(p => !object(p) || !text(p.label) || !text(p.explanation) || !strings(p.evidenceIds) || !p.evidenceIds.length || p.evidenceIds.some(id => !row.evidenceIds?.includes(id))))) return false;
  }
  return true;
}
function freeze(value: unknown): void {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
  for (const child of Object.values(value)) freeze(child);
  Object.freeze(value);
}

/** Rechecks publication integrity. The release publisher owns human identity, rights and source-inventory gates. */
export async function validatePublication(value: unknown, now = new Date()): Promise<PublishedEditorial | null> {
  try {
    if (!object(value) || value.schemaVersion !== 1 || !identifier(value.editionId) || !['approvedComparisons', 'approvedParaphrases', 'approvedContent', 'coverage'].every(key => Array.isArray(value[key])) || !object(value.coverageCounts) || !object(value.backlog)) return null;
    const counts = value.coverageCounts, backlog = value.backlog;
    if (!statuses.every(status => count(counts[status])) || !['totalSourceUnits', 'remainingSourceUnits', 'candidateCount'].every(key => count(backlog[key]))) return null;
    const p = structuredClone(value) as unknown as PublishedEditorial;
    if (p.referenceSystemId !== undefined && !text(p.referenceSystemId)) return null;
    const all = [...p.approvedComparisons, ...p.approvedParaphrases, ...p.approvedContent];
    if (all.some(item => !object(item) || !text(item.id)) || new Set(all.map(item => item.id)).size !== all.length) return null;
    for (const link of p.approvedComparisons) if (!await approvedComparison(link, now)) return null;
    for (const entry of p.approvedParaphrases) if (!await approvedContent(entry, true, now)) return null;
    for (const entry of p.approvedContent) if (!await approvedContent(entry, false, now)) return null;
    const seen = new Set<string>();
    const derived = Object.fromEntries(statuses.map(s => [s, s === 'unreviewed' ? p.backlog.totalSourceUnits : 0])) as Record<CoverageStatus, number>;
    for (const row of p.coverage) {
      if (!await validCoverage(row, p.approvedComparisons, p.editionId, now) || seen.has(address(row.bibleRef))) return null;
      seen.add(address(row.bibleRef));
      derived.unreviewed--;
      derived[row.status]++;
    }
    if (derived.unreviewed < 0 || !statuses.every(s => derived[s] === p.coverageCounts[s])) return null;
    if (p.backlog.remainingSourceUnits !== derived.unreviewed + derived.in_review + derived.disputed) return null;
    // Do not expose seed queues, blocked drafts, private registry data, or unknown top-level fields.
    const publication: PublishedEditorial = { schemaVersion: 1, editionId: p.editionId, ...(p.referenceSystemId ? { referenceSystemId: p.referenceSystemId } : {}), approvedComparisons: p.approvedComparisons, approvedParaphrases: p.approvedParaphrases, approvedContent: p.approvedContent, coverage: p.coverage, coverageCounts: derived, backlog: { totalSourceUnits: p.backlog.totalSourceUnits, remainingSourceUnits: p.backlog.remainingSourceUnits, candidateCount: p.backlog.candidateCount } };
    freeze(publication);
    trusted.add(publication);
    return publication;
  } catch { return null; }
}

export function createPublicationLoader(load: () => Promise<unknown>) {
  let cached: Promise<PublishedEditorial | null> | undefined;
  return async (): Promise<PublishedEditorial | null> => {
    if (!cached) cached = Promise.resolve().then(load).then(value => validatePublication(value)).catch(() => null);
    const current = cached;
    const result = await current;
    if (!result && cached === current) cached = undefined;
    return result;
  };
}
export const getPublication = createPublicationLoader(async () => {
  const { assetUrl } = await import('./data.ts');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(assetUrl('data/editorial.json'), { signal: controller.signal });
    if (!response.ok) throw new Error('Editorial publication is unavailable.');
    const body = await response.text();
    if (body.length > 20 * 1024 * 1024) throw new Error('Editorial publication exceeds the supported download size.');
    return JSON.parse(body) as unknown;
  } finally { clearTimeout(timer); }
});

export function isValidatedPublication(publication: PublishedEditorial | null): publication is PublishedEditorial {
  return !!publication && trusted.has(publication);
}

export function selectComparisons(publication: PublishedEditorial | null, reference: Reference): ComparisonLink[] {
  if (!publication || !trusted.has(publication) || !isReference(reference)) return [];
  return publication.approvedComparisons.filter(link => link.bibleRefs.some(ref => matchesReference(ref, reference)));
}
export function selectPassageCoverage(publication: PublishedEditorial | null, reference: Reference): PassageCoverage {
  if (!isReference(reference)) return { status: 'unreviewed', totalUnits: 0, reviewedUnits: 0, rows: [] };
  const valid = publication && trusted.has(publication) ? publication : null;
  const editionId = reference.editionId || DEFAULT_EDITION_ID;
  const rows: ComparisonCoverage[] = [];
  for (let verse = reference.verse; verse <= (reference.endVerse ?? reference.verse); verse++) {
    const single: Reference = { ...reference, verse, endVerse: undefined };
    const explicit = valid?.coverage.find(row => matchesReference(row.bibleRef, single));
    if (explicit) { rows.push(explicit); continue; }
    const links = selectComparisons(valid, single);
    rows.push({ bibleRef: { corpus: 'bible', workId: reference.bookId, editionId, referenceSystemId: valid?.editionId === editionId && valid.referenceSystemId ? valid.referenceSystemId : `${editionId}:publisher-numbering`, start: { chapter: reference.chapter, unit: String(verse) } }, status: links.length ? 'reviewed_with_links' : 'unreviewed', approvedLinkIds: links.map(link => link.id) });
  }
  const distinct = new Set(rows.map(row => row.status));
  return { status: distinct.size === 1 ? rows[0].status : 'partial', totalUnits: rows.length, reviewedUnits: rows.filter(row => row.status === 'reviewed_with_links' || row.status === 'reviewed_no_match').length, rows };
}
export function selectExplanation(publication: PublishedEditorial | null, link: ComparisonLink, locale: UiLocale): { locale: UiLocale; explanation: LocalizedExplanation; isFallback: boolean } | null {
  if (!publication || !trusted.has(publication) || !publication.approvedComparisons.includes(link)) return null;
  const language = link.explanationByLocale[locale] ? locale : link.sourceLocale;
  const explanation = link.explanationByLocale[language];
  return explanation ? { locale: language, explanation, isFallback: language !== locale } : null;
}
export function selectApprovedParaphrase(publication: PublishedEditorial | null, reference: Reference, locale: UiLocale, register: NonNullable<EditorialContent['register']> = 'genz'): EditorialContent | null {
  if (!publication || !trusted.has(publication) || !isReference(reference)) return null;
  const edition = reference.editionId || DEFAULT_EDITION_ID;
  const required = new Set<string>();
  for (let verse = reference.verse; verse <= (reference.endVerse ?? reference.verse); verse++) required.add(`${edition}:${reference.bookId}:${reference.chapter}:${verse}`);
  return publication.approvedParaphrases.find(entry => entry.locale === locale && entry.register === register && entry.basePassageIds.length === required.size && entry.basePassageIds.every(id => required.has(id))) ?? null;
}

/** Resolves only the requested Quran edition and its actual numbered units; never substitutes editions. */
export function readQuranPassage(corpus: QuranCorpus | null, ref: PassageRef): QuranExcerpt | null {
  if (!corpus || corpus.schemaVersion !== 1 || !passage(ref, 'quran') || !object(corpus.edition) || corpus.edition.id !== ref.editionId || !Array.isArray(corpus.surahs)) return null;
  const start = numericUnit(ref.start.unit), endPoint = ref.end ?? ref.start, end = numericUnit(endPoint.unit);
  if (start === null || end === null || ref.start.chapter > 114 || endPoint.chapter > 114) return null;
  const verses: QuranExcerpt['verses'] = [];
  for (let chapter = ref.start.chapter; chapter <= endPoint.chapter; chapter++) {
    const surah = corpus.surahs.find(s => s && s.number === chapter);
    if (!surah || !Array.isArray(surah.verses) || !surah.verses.length || !surah.verses.every(v => v && Number.isSafeInteger(v.number) && v.number > 0 && typeof v.text === 'string')) return null;
    const last = Math.max(...surah.verses.map(v => v.number));
    const firstUnit = chapter === ref.start.chapter ? start : 1, lastUnit = chapter === endPoint.chapter ? end : last;
    if (!Number.isSafeInteger(last) || last > 286 || firstUnit > lastUnit || lastUnit > last) return null;
    for (let unit = firstUnit; unit <= lastUnit; unit++) {
      const matches = surah.verses.filter(v => v.number === unit);
      if (matches.length !== 1 || !text(matches[0].text)) return null;
      verses.push({ chapter, number: unit, text: matches[0].text });
    }
  }
  const around = (chapter: number, low: number, high: number) => corpus.surahs.find(s => s.number === chapter)?.verses.filter(v => v.number >= low && v.number <= high && text(v.text)).map(v => ({ chapter, number: v.number, text: v.text })) ?? [];
  return { edition: corpus.edition, verses, before: around(ref.start.chapter, Math.max(1, start - 2), start - 1), after: around(endPoint.chapter, end + 1, end + 2) };
}
export async function quranEvidenceMatches(excerpt: QuranExcerpt, link: ComparisonLink): Promise<boolean> {
  const hashes = await Promise.all(excerpt.verses.map(verse => hashSourceText(verse.text)));
  return excerpt.verses.every((verse, index) => {
    // Bind wording to its exact address: a hash from another cited verse cannot approve a swap.
    // Arbitrary evidence IDs need a published address mapping before runtime quotation is possible.
    const id = `${excerpt.edition.id}:QUR:${verse.chapter}:${verse.number}`;
    return link.quranEvidencePassageIds.includes(id) && link.reviewedSourceHashes[id] === hashes[index];
  });
}

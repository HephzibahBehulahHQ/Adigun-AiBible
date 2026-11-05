import TrustBadge from './TrustBadge';
import { useEffect, useMemo, useState } from 'react';
import { getQuran } from './data';
import { coverageLabel } from './domain';
import { isValidatedPublication, quranEvidenceMatches, readQuranPassage, selectComparisons, selectExplanation, selectPassageCoverage } from './publication';
import type { PublishedEditorial, QuranCorpus, QuranExcerpt } from './publication';
import type { ComparisonLink, PassageRef, ReviewRecord, UiLocale } from './editorial';
import type { Locale, Reference } from './types';

const languages: Record<UiLocale, string> = { en: 'English', de: 'German', yo: 'Yoruba', pcm: 'Nigerian Pidgin' };
const relationships = { shared_claim: 'Shared claim', differing_claim: 'Differing claim', mixed: 'Shared and differing findings', thematic: 'Thematic connection' };
function citation(ref: PassageRef) {
  const start = `${ref.start.chapter}:${ref.start.unit}`;
  const end = ref.end ? `–${ref.end.chapter === ref.start.chapter ? ref.end.unit : `${ref.end.chapter}:${ref.end.unit}`}` : '';
  return `${ref.corpus === 'quran' ? 'Quran' : ref.workId} ${start}${end}`;
}
function safeSource(value: string): string | null {
  try { const url = new URL(value); return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null; } catch { return null; }
}
function ReviewDetails({ review, label = 'Review' }: { review?: ReviewRecord; label?: string }) {
  if (!review || review.status !== 'approved') return null;
  return <p className="muted small">{label} · Reviewer record: {review.reviewerId?.includes('@') ? 'Registered reviewer' : review.reviewerId} · <time dateTime={review.reviewedAt}>{review.reviewedAt?.slice(0, 10)}</time></p>;
}
function Sources({ ids }: { ids: string[] }) {
  return <details className="comparison-source"><summary>Sources and evidence</summary><ul>{ids.map(id => { const url = safeSource(id); return <li key={id}>{url ? <a href={url} target="_blank" rel="noreferrer">{id}</a> : id}</li>; })}</ul></details>;
}
function BibleReferences({ refs }: { refs: PassageRef[] }) {
  return <div className="comparison-links" aria-label="Reviewed Bible references">{refs.map((ref, index) => {
    const query = new URLSearchParams({ verse: ref.start.unit, edition: ref.editionId });
    if (ref.end?.chapter === ref.start.chapter) query.set('end', ref.end.unit);
    return <a key={`${citation(ref)}-${index}`} href={`#/read/${encodeURIComponent(ref.workId)}/${ref.start.chapter}?${query}`}><strong>{citation(ref)}</strong> <small>({ref.editionId})</small></a>;
  })}</div>;
}
function QuranQuote({ refToRead, link, corpus, loading, error, onOpen }: { refToRead: PassageRef; link: ComparisonLink; corpus: QuranCorpus | null; loading: boolean; error: string; onOpen?: (ref: PassageRef) => void }) {
  const excerpt = useMemo(() => readQuranPassage(corpus, refToRead), [corpus, refToRead]);
  const [checked, setChecked] = useState<{ excerpt: QuranExcerpt; valid: boolean } | null>(null);
  useEffect(() => {
    if (!excerpt) return;
    let active = true;
    quranEvidenceMatches(excerpt, link).then(valid => { if (active) setChecked({ excerpt, valid }); }).catch(() => { if (active) setChecked({ excerpt, valid: false }); });
    return () => { active = false; };
  }, [excerpt, link]);
  const verified = excerpt && checked?.excerpt === excerpt ? checked.valid : null;
  let unavailable = '';
  if (corpus && corpus.edition.id !== refToRead.editionId) unavailable = `This comparison cites ${refToRead.editionId}. That edition is not installed here; another translation has not been substituted.`;
  else if (corpus && !excerpt) unavailable = 'The cited range is unavailable in the installed edition. No replacement text is shown.';
  else if (verified === false) unavailable = 'The installed wording could not be verified against the reviewed reference and source evidence. This quotation is unavailable until its evidence is revalidated.';
  else if (error) unavailable = error;
  const source = excerpt && safeSource(excerpt.edition.sourceUrl);
  return <article className="comparison-source"><h4>{citation(refToRead)}</h4>{unavailable ? <p className="availability-note">{unavailable}</p> : loading || !excerpt || verified === null ? <p className="muted small" role="status">Opening the cited source and checking its reviewed wording…</p> : <>
    <p className="source-label">{excerpt.edition.name} · {languages[excerpt.edition.language as UiLocale] || excerpt.edition.language}</p>
    <div lang={excerpt.edition.language}>{excerpt.verses.map(verse => <p key={`${verse.chapter}:${verse.number}`}><sup>{verse.chapter}:{verse.number}</sup> {verse.text}</p>)}</div>
    <details><summary>Surrounding source context</summary><div lang={excerpt.edition.language}>{[...excerpt.before, ...excerpt.verses, ...excerpt.after].map(verse => <p key={`${verse.chapter}:${verse.number}`}><sup>{verse.chapter}:{verse.number}</sup> {verse.text}</p>)}</div></details>
    <div className="comparison-links">{onOpen && <button className="text-button" onClick={() => onOpen(refToRead)}>Open Quran context</button>}{source && <a href={source} target="_blank" rel="noreferrer">Edition source</a>}</div>
  </>}</article>;
}
function ComparisonRecord({ link, publication, locale, corpus, loading, error, onOpenQuran }: { link: ComparisonLink; publication: PublishedEditorial; locale: Locale; corpus: QuranCorpus | null; loading: boolean; error: string; onOpenQuran?: (ref: PassageRef) => void }) {
  const explanation = selectExplanation(publication, link, locale);
  if (!explanation) return null;
  return <article className="panel comparison-record">
    <TrustBadge status={link.review.status} origin={explanation.explanation.origin}/>
    <span className="review-state">{relationships[link.relationship]}</span><h3 lang={link.sourceLocale}>{link.proposition}</h3>
    {link.relationship === 'thematic' && <p className="muted small">A thematic connection does not establish agreement on a specific claim.</p>}
    <BibleReferences refs={link.bibleRefs}/>
    <div className="comparison-quran-passages">{link.quranRefs.map((ref, index) => <QuranQuote key={`${ref.editionId}:${citation(ref)}:${index}`} refToRead={ref} link={link} corpus={corpus} loading={loading} error={error} onOpen={onOpenQuran}/>)}</div>
    {explanation.isFallback && <p className="availability-note">A reviewed {languages[locale]} explanation is unavailable. Showing the reviewed {languages[explanation.locale]} source explanation.</p>}
    <div lang={explanation.locale}><h4>Reviewed explanation</h4><p>{explanation.explanation.text}</p></div>
    {locale !== link.sourceLocale && <p className="muted small">Claim wording and interpretive qualifications remain in {languages[link.sourceLocale]}.</p>}
    {link.interpretationNote && <p className="muted" lang={link.sourceLocale}>{link.interpretationNote}</p>}
    {link.relationship === 'mixed' && <div className="two-columns" lang={link.sourceLocale}><div><h4>Shared points</h4><ul>{link.sharedPoints?.map((point, index) => <li key={index}>{point}</li>)}</ul></div><div><h4>Differing points</h4><ul>{link.differingPoints?.map((point, index) => <li key={index}>{point}</li>)}</ul></div></div>}
    <p className="muted small">Editorial interpretation · {explanation.explanation.origin === 'ai_assisted' ? 'AI-assisted draft with recorded review' : 'Human-authored explanation with recorded review'}</p>
    <ReviewDetails label="Explanation review" review={explanation.explanation.review}/><ReviewDetails label="Comparison review" review={link.review}/><Sources ids={link.sourceIds}/>
  </article>;
}

export function VerseComparison({ reference, locale, publication, onOpenQuran }: { reference: Reference; locale: Locale; publication: PublishedEditorial | null; onOpenQuran?: (ref: PassageRef) => void }) {
  const links = useMemo(() => selectComparisons(publication, reference), [publication, reference]);
  const coverage = useMemo(() => selectPassageCoverage(publication, reference), [publication, reference]);
  const [corpus, setCorpus] = useState<QuranCorpus | null>(null), [error, setError] = useState('');
  const needsQuran = links.length > 0;
  useEffect(() => {
    if (!needsQuran) return;
    let active = true;
    getQuran().then(data => { if (active) setCorpus(data); }).catch(() => { if (active) setError('The cited Quran source could not be loaded. Reconnect or download that edition; no quotation has been invented.'); });
    return () => { active = false; };
  }, [needsQuran]);
  const reviewedRows = coverage.rows.filter(row => row.status === 'reviewed_no_match' || row.status === 'disputed');
  return <section className="comparison-panel" aria-label={`Comparison review for ${reference.bookId} ${reference.chapter}:${reference.verse}`}>
    {!links.length&&<TrustBadge status={isValidatedPublication(publication) ? coverage.status.replaceAll('_', ' ') : 'unconfirmed'}/>}
    <span className="review-state">{coverage.status === 'partial' ? 'Partly reviewed selection' : coverage.status.replaceAll('_', ' ')}</span>
    <p>{coverage.status === 'partial' ? 'Review status differs within this selection. Read the scope attached to each published finding.' : coverageLabel(coverage.status)}</p>
    {coverage.totalUnits > 1 && <p className="muted small">{coverage.reviewedUnits} of {coverage.totalUnits} selected verses have completed comparison reviews. Remaining verses are not recorded as having no parallel.</p>}
    {!isValidatedPublication(publication) && <p className="muted small">Editorial publication data is unavailable. This view cannot confirm its review counts.</p>}
    {coverage.status === 'unreviewed' && <p className="muted small">Missing links do not establish that no parallel exists.</p>}
    {reviewedRows.map((row, index) => <article className="comparison-source" key={`${citation(row.bibleRef)}-${index}`}><h4>{citation(row.bibleRef)}</h4><p>{row.reviewScope}</p><ReviewDetails review={row.review}/>{row.status === 'disputed' && row.positions?.map((position, i) => <div key={i}><h5>{position.label}</h5><p>{position.explanation}</p><Sources ids={position.evidenceIds}/></div>)}</article>)}
    {isValidatedPublication(publication) && links.map(link => <ComparisonRecord key={link.id} link={link} publication={publication} locale={locale} corpus={corpus} loading={needsQuran && !corpus && !error} error={error} onOpenQuran={onOpenQuran}/>)}
  </section>;
}

export function PublicationOverview({ publication }: { publication: PublishedEditorial | null }) {
  if (!isValidatedPublication(publication)) return <section className="panel"><h2>Editorial coverage</h2><p>Publication metadata is unavailable. Review counts cannot be confirmed; source reading remains available.</p></section>;
  const counts = publication.coverageCounts;
  return <section className="panel"><h2>Editorial coverage</h2><p className="muted">Published review data for {publication.editionId}. Source-text availability and editorial approval are separate.</p>
    <div className="inventory-stats"><div><strong>{publication.approvedComparisons.length}</strong><span>Approved comparisons</span></div><div><strong>{publication.approvedParaphrases.length}</strong><span>Approved paraphrases</span></div><div><strong>{publication.approvedContent.length}</strong><span>Other approved editorial records</span></div><div><strong>{publication.backlog.remainingSourceUnits.toLocaleString()}</strong><span>Source units awaiting completed review</span></div></div>
    <dl className="metadata"><dt>Baseline source units</dt><dd>{publication.backlog.totalSourceUnits.toLocaleString()}</dd><dt>Unreviewed</dt><dd>{counts.unreviewed.toLocaleString()}</dd><dt>In review</dt><dd>{counts.in_review.toLocaleString()}</dd><dt>Reviewed with links</dt><dd>{counts.reviewed_with_links.toLocaleString()}</dd><dt>Reviewed with no direct match in the recorded scope</dt><dd>{counts.reviewed_no_match.toLocaleString()}</dd><dt>Disputed</dt><dd>{counts.disputed.toLocaleString()}</dd><dt>Research candidates, not approvals</dt><dd>{publication.backlog.candidateCount.toLocaleString()}</dd></dl>
    <p className="muted small">An unreviewed unit is never counted as evidence of no parallel. Counts describe this published dataset.</p>
  </section>;
}

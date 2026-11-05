import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Coins, Globe2, Hourglass, MessageSquareText, Scale, Users } from 'lucide-react';
import { getBook, getManifest, getQuran, sourceCredit } from '../data';
import type { Locale, Reference } from '../types';
import { islamicSourceGuides, lawEntries } from './entries';
import { bibleReference, lawCategories, lawSectionHash, lawSections, readLawSection, searchLawEntries, sourceLabel } from './model';
import type { BibleCitation, LawEntry, LawSection, LawSource, QuranCitation } from './model';
import { bibleExcerpt, quranExcerpt } from './source';
import type { LawExcerpt } from './source';
import './law-diary.css';

const sectionIcons = { timeline: Hourglass, social: Scale, money: Coins, sermons: MessageSquareText, evangelism: Globe2, apostles: Users, 'second-coming': BookOpen };
const sourceTypes = { bible: 'Biblical text', quran: 'Quran text', church_tradition: 'Later church tradition · not recorded in the Bible', rabbinic: 'Rabbinic source · distinct from biblical text', hadith: 'Hadith tradition · not Quranic text', scholarship: 'Named scholarly source', fiqh: 'Fiqh · human juristic interpretation' };

function TrustBadge() {
  return <p className="ld-trust">AI-assisted, human review status: pending · Comparison relationships are editor-assigned · This app does not proselytize or call for conversion.</p>;
}

function Quotation({ citation, editionId, onOpenReference }: { citation: BibleCitation | QuranCitation; editionId: string; onOpenReference: (ref: Reference) => void }) {
  const key = `${citation.type}:${sourceLabel(citation)}:${citation.type === 'bible' ? editionId : 'eng-clearquran'}`;
  const [state, setState] = useState<{ key: string; excerpt?: LawExcerpt; error?: string }>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const read = citation.type === 'bible'
      ? Promise.all([getBook(citation.bookId, editionId), getManifest(editionId)]).then(([book, manifest]) => bibleExcerpt(book, manifest, citation))
      : getQuran().then(source => quranExcerpt(source, citation));
    read.then(excerpt => { if (active) setState({ key, excerpt }); }).catch(error => { if (active) setState({ key, error: error instanceof Error ? error.message : 'This source could not be opened.' }); });
    return () => { active = false; };
  }, [citation, editionId, key, attempt]);
  if (state?.key !== key) return <p role="status">Opening the exact source passage…</p>;
  if (state.error || !state.excerpt) return <div className="ld-load-error"><p role="alert">{state.error || 'This source could not be opened.'} No alternative edition has been substituted.</p><button className="secondary" onClick={() => { setState(undefined); setAttempt(value => value + 1); }}>Retry source</button></div>;
  const { excerpt } = state;
  const chapter = citation.type === 'bible' ? citation.chapter : citation.surah;
  return <div className="ld-quotation">
    <p className="source-label">{excerpt.edition.name} · {excerpt.edition.language} · exact source wording</p>
    {excerpt.missing.length > 0 && <p className="availability-note" role="status">Verse numbers absent from this edition: {excerpt.missing.join(', ')}. No wording from another edition fills these gaps.</p>}
    <div className="ld-source-text" lang={excerpt.edition.language}>{excerpt.verses.map(verse => <p key={verse.number}><sup>{chapter}:{verse.number}</sup> {verse.text}</p>)}</div>
    <details className="ld-context"><summary>Surrounding source context</summary><p className="muted small">The selected passage with up to two available verses before and after it.</p><div lang={excerpt.edition.language}>{excerpt.context.map(verse => <p key={verse.number}><sup>{chapter}:{verse.number}</sup> {verse.text}</p>)}</div></details>
    {citation.type === 'bible' && <button className="secondary" onClick={() => onOpenReference(bibleReference(citation, editionId))}>Open {sourceLabel(citation)} in reader</button>}
    <details className="ld-source-credit"><summary>Edition, revision and attribution</summary><p className="ld-credit-text">{sourceCredit(excerpt.edition)}</p><p className="ld-hash">Source SHA-256: {excerpt.edition.sha256 || 'Not supplied'}</p><a href={excerpt.edition.sourceUrl} target="_blank" rel="noreferrer">Publisher source</a></details>
  </div>;
}

function Source({ source, editionId, onOpenReference }: { source: LawSource; editionId: string; onOpenReference: (ref: Reference) => void }) {
  const [open, setOpen] = useState(false);
  if (source.type !== 'bible' && source.type !== 'quran') return <div className="ld-external-source"><span className="ld-source-kind">{sourceTypes[source.type]}</span><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a><p>{source.note}</p></div>;
  return <details className="ld-source" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary><span>{sourceLabel(source)}</span><small>{source.type === 'bible' ? editionId : 'eng-clearquran'} · open source</small></summary>
    {open && <Quotation citation={source} editionId={editionId} onOpenReference={onOpenReference}/>}
  </details>;
}

function TorahCategories({ entry, editionId, onOpenReference }: { entry: LawEntry; editionId: string; onOpenReference: (ref: Reference) => void }) {
  const [category, setCategory] = useState<string>('all');
  if (!entry.categorySamples) return null;
  const groups = entry.categorySamples.filter(group => category === 'all' || group.category === category);
  return <section className="ld-torah" aria-label="Torah category samples"><h4>Torah category samples</h4><label className="ld-filter">Category<select value={category} onChange={event => setCategory(event.target.value)}><option value="all">All six categories</option>{lawCategories.map(value => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></label>
    {groups.map(group => <details key={group.category} className="ld-category"><summary>{group.category[0].toUpperCase() + group.category.slice(1)} · view all {group.sources.length} indexed samples</summary><p className="muted small">Representative passages only; not every commandment in this category.</p>{group.sources.map(source => <Source key={sourceLabel(source)} source={source} editionId={editionId} onOpenReference={onOpenReference}/>)}</details>)}
  </section>;
}

function EntryCard({ entry, editionId, locale, onOpenReference }: { entry: LawEntry; editionId: string; locale: Locale; onOpenReference: (ref: Reference) => void }) {
  const bible = entry.sources.filter(source => source.type === 'bible');
  const quran = entry.sources.filter(source => source.type === 'quran');
  const other = entry.sources.filter(source => source.type !== 'bible' && source.type !== 'quran');
  return <article className="ld-entry" aria-labelledby={`ld-${entry.id}`}>
    <header><span className="eyebrow">AI-assisted research note · human review pending</span><h3 id={`ld-${entry.id}`}>{entry.title}</h3>{locale !== 'en' && <p className="ld-fallback">(EN fallback) · Reviewed {locale === 'de' ? 'German' : locale === 'yo' ? 'Yorùbá' : 'Nigerian Pidgin'} research wording is unavailable · community_pending.</p>}<p>{entry.summary}</p></header>
    <div className={`ld-evidence-grid ${bible.length && quran.length ? 'ld-has-comparison' : ''}`}>
      {bible.length > 0 && <section className="ld-corpus" aria-label={`Bible sources for ${entry.title}`}><h4>Bible sources</h4>{bible.map(source => <Source key={sourceLabel(source)} source={source} editionId={editionId} onOpenReference={onOpenReference}/>)}</section>}
      {quran.length > 0 && <section className="ld-corpus" aria-label={`Quran sources for ${entry.title}`}><h4>Quran sources</h4><p className="muted small">ClearQuran · English translation, separate from the selected Bible edition.</p>{quran.map(source => <Source key={sourceLabel(source)} source={source} editionId={editionId} onOpenReference={onOpenReference}/>)}</section>}
      <section className="ld-context-note"><h4>{quran.length && bible.length ? 'Context and relationship review' : 'Text and context'}</h4><p>{entry.contextNote}</p>{quran.length > 0 && <p className="ld-review-status"><strong>Relationship: unreviewed.</strong> These are research selections. No agreement, opposition, mixed finding or reviewed no-match has been assigned.</p>}
        {entry.debate && <details className="ld-debate"><summary>This is debated</summary><h5>{entry.debate.question}</h5><p>{entry.debate.note}</p><p className="muted small">A reviewed set of representative positions is not yet published for this entry.</p></details>}
        {entry.prosperityGospelRisk === 'flagged' && <p className="ld-prosperity">This passage is sometimes read as a promise of health or wealth. The app does not endorse that reading. Read the source context above.</p>}
      </section>
    </div>
    <TorahCategories entry={entry} editionId={editionId} onOpenReference={onOpenReference}/>
    {other.length > 0 && <section className="ld-later-sources" aria-label={`Separate source traditions for ${entry.title}`}><h4>{other.every(source => source.type === 'hadith') ? 'Hadith tradition (not Quranic text)' : 'Separately identified sources'}</h4>{other.map(source => <Source key={sourceLabel(source)} source={source} editionId={editionId} onOpenReference={onOpenReference}/>)}</section>}
    {entry.researchGap && <p className="ld-gap"><strong>Research still needed:</strong> {entry.researchGap}</p>}
    <TrustBadge/>
  </article>;
}

export default function LawDiary({ editionId = 'eng-web', locale = 'en', reference, onOpenReference }: { editionId?: string; locale?: Locale; reference?: Reference; onOpenReference?: (ref: Reference) => void }) {
  const [active, setActive] = useState<LawSection>(() => readLawSection(window.location.hash));
  const [query, setQuery] = useState('');
  useEffect(() => {
    const update = () => { setActive(readLawSection(window.location.hash)); setQuery(''); };
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  const openReference = (ref: Reference) => {
    if (onOpenReference) { onOpenReference(ref); return; }
    const params = new URLSearchParams({ verse: String(ref.verse), edition: ref.editionId || editionId });
    if (ref.endVerse) params.set('end', String(ref.endVerse));
    window.location.hash = `#/read/${ref.bookId}/${ref.chapter}?${params}`;
  };
  const section = lawSections.find(item => item.id === active)!;
  const entries = useMemo(() => searchLawEntries(lawEntries, active, query), [active, query]);
  function sectionHref(id: LawSection) {
    const current = lawSectionHash(id, window.location.hash);
    const [path, search] = current.split('?');
    const params = new URLSearchParams(search);
    if (reference) {
      if (!params.has('book')) params.set('book', reference.bookId);
      if (!params.has('chapter')) params.set('chapter', String(reference.chapter));
      if (!params.has('verse')) params.set('verse', String(reference.verse));
      if (reference.endVerse && !params.has('end')) params.set('end', String(reference.endVerse));
    }
    params.set('edition', editionId);
    return `${path}?${params}`;
  }
  return <div className="page law-diary-page ld-page" lang="en">
    <div className="page-heading"><span className="eyebrow">SCRIPTURE OBSERVATORY · SOURCE RESEARCH</span><h1>Law Diary</h1><p>Open the actual passages, keep each source in view, and distinguish textual evidence from later interpretation.</p><p className="muted small">{lawEntries.length} research entries · {lawEntries.filter(entry => entry.section === 'timeline').length} timeline layers · 0 human-approved relationship findings. English research text; Scripture keeps its selected edition and language.</p></div>
    <nav className="ld-nav" aria-label="Law Diary sections">{lawSections.map(item => { const Icon = sectionIcons[item.id]; return <a key={item.id} href={sectionHref(item.id)} aria-current={active === item.id ? 'page' : undefined}><Icon size={18} aria-hidden="true"/>{item.title}</a>; })}</nav>
    <section aria-labelledby="law-diary-section-title"><div className="ld-section-heading"><div><h2 id="law-diary-section-title">{section.title === 'Timeline' ? 'Textual timeline' : section.title}</h2><p>{section.summary}</p></div><label className="ld-search">Search this section<input type="search" value={query} onChange={event => setQuery(event.target.value)} maxLength={200} placeholder="Topic, book or source reference"/></label></div>
      {active === 'timeline' && <p className="ld-method">These layers are a study arrangement, not a dated historical sequence. Rabbinic reception and the comparative “karma” label are explicitly separate from biblical law.</p>}
      {active === 'money' && <p className="ld-method">Distinguish attachment to wealth from the fact of having resources. Read each passage’s own claim and context; this collection promises neither prosperity nor hardship as a measure of faith.</p>}
      {active === 'evangelism' && <p className="ld-method">This module describes the Bible’s teaching on evangelism and its historical practice. It is not an invitation for the reader to convert. The app’s comparison policy rejects coercion and religious rankings.</p>}
      {active === 'apostles' && <p className="ld-method">Acts 12 explicitly narrates James son of Zebedee’s killing. Judas has separate death accounts. Other death traditions require their own witnesses; later tradition is never presented as a biblical execution report.</p>}
      {active === 'second-coming' && <p className="ld-method">Bible, Quran and Hadith remain distinct. An English Quran translation is not an approval of one interpretation; no human-reviewed cross-religion relationship is currently published.</p>}
      <p className="muted small" role="status">{entries.length} {entries.length === 1 ? 'entry' : 'entries'} shown{query.trim() ? ` for “${query.trim()}”` : ''}.</p>
      {entries.length ? <div className="ld-entries">{entries.map(entry => <EntryCard key={entry.id} entry={entry} editionId={editionId} locale={locale} onOpenReference={openReference}/>)}</div> : <div className="panel"><p>No entries in this section match your search.</p><button className="secondary" onClick={() => setQuery('')}>Clear search</button></div>}
      {active === 'timeline' && !query.trim() && <section className="ld-source-guides" aria-labelledby="ld-islamic-sources"><h2 id="ld-islamic-sources">Islamic source categories</h2><p>These sources are indexed separately. They are not automatically mapped to the eleven biblical and historical study layers.</p><div className="ld-entries">{islamicSourceGuides.map(entry => <EntryCard key={entry.id} entry={entry} editionId={editionId} locale={locale} onOpenReference={openReference}/>)}</div></section>}
    </section>
  </div>;
}

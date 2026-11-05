import { useEffect, useId, useState } from 'react';
import { getBook, getManifest, sourceCredit } from '../data';
import type { Locale, Reference } from '../types';
import { contextKey, loadContextSource, safeSourceUrl } from './model';
import type { ContextCitation, ContextSource } from './model';
import { contextDebates, contextFor, contextRecords } from './records';
import ThisIsDebated from './ThisIsDebated';
import './context.css';

interface Props { reference: Reference; locale: Locale; editionId?: string; onOpenReference: (reference: Reference) => void }
type State = { key: string; source?: ContextSource; error?: string };

export default function ContextCard({ reference, locale, editionId, onOpenReference }: Props) {
  const chosen = { ...reference, editionId: editionId || reference.editionId || 'eng-web' };
  const key = contextKey(chosen), titleId = useId();
  const [state, setState] = useState<State>({ key: '' }), [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    void loadContextSource(chosen, { getBook, getManifest }).then(source => { if (active) setState({ key, source }); }).catch(error => { if (active) setState({ key, error: error instanceof Error ? error.message : 'Source context could not be loaded.' }); });
    return () => { active = false; };
  // Every part of the selected source reference is represented by key.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, retry]);
  const source = state.key === key ? state.source : undefined, error = state.key === key ? state.error : undefined;
  const records = contextFor(chosen);
  function citations(values: ContextCitation[]) {
    return <ul className="context-citations">{values.map((citation, index) => <li key={`${citation.label}:${index}`}>{citation.reference ? <button type="button" className="text-button" onClick={() => onOpenReference({ ...citation.reference!, editionId: citation.reference!.editionId || chosen.editionId })}>{citation.label}</button> : citation.url && safeSourceUrl(citation.url) ? <a href={citation.url} target="_blank" rel="noreferrer">{citation.label}</a> : citation.label}</li>)}</ul>;
  }
  return <section className="context-card" aria-labelledby={titleId} lang="en">
    <h3 id={titleId}>Passage context</h3>
    {locale !== 'en' && <p className="context-fallback">(EN fallback) · Context explanations await reviewed translation. Scripture retains its selected edition and language.</p>}
    {!source && !error && <p role="status">Opening the surrounding source passage…</p>}
    {error && <><p role="alert">{error} Reconnect if the source has not been downloaded.</p><button type="button" className="secondary" onClick={() => { setState({ key: '' }); setRetry(value => value + 1); }}>Retry context</button></>}
    {source && <>
      <p><strong>{source.windowLabel}</strong><br/><span className="context-review">{source.edition.name} · Selected: {source.label}</span></p>
      {source.missing.length > 0 && <p className="context-gap">This edition has no main-text wording at the selected numbered {source.missing.length === 1 ? 'position' : 'positions'}: {source.missing.join(', ')}. The surrounding source is retained; no other edition has been substituted.</p>}
      <div className="context-source-window" aria-label="Surrounding source passage">{source.verses.map(verse => <p className={`context-verse${verse.number >= chosen.verse && verse.number <= (chosen.endVerse ?? chosen.verse) ? ' context-selected' : ''}`} key={verse.number} lang={source.edition.language}><sup>{verse.number}</sup>{verse.text || <span>No main-text wording at this number.</span>}</p>)}</div>
      <div className="context-actions"><button type="button" className="secondary" onClick={() => onOpenReference({ ...source.reference, verse: 1, endVerse: undefined })}>Open full chapter</button><button type="button" className="text-button" onClick={() => onOpenReference({ bookId: chosen.bookId, chapter: 1, verse: 1, editionId: chosen.editionId })}>Read from the book’s opening</button></div>
      {source.verses.some(verse => verse.notes?.length) && <details><summary>Publisher notes in this context</summary><ul className="context-notes">{source.verses.flatMap(verse => (verse.notes || []).map((note, index) => <li key={`${verse.number}:${index}`}><strong>{source.bookName} {chosen.chapter}:{verse.number}</strong><p lang={source.edition.language}>{note.text}</p></li>))}</ul><p className="context-review">Publisher annotations are separate from the verse wording and from Adigun’s draft context notes.</p></details>}
      <details><summary>Source identity and permissions</summary><p className="context-source-credit">{sourceCredit(source.edition)}</p><p className="context-revision">Revision checksum: {source.edition.sha256 || 'Not supplied'}</p></details>
      {records.length > 0 ? records.map(record => <article key={record.id}>
        <h3>{record.title}</h3><p className="context-review">{record.aiReviewStatus}. These notes distinguish the text’s own setting from historical interpretation. Bible references in the notes name their source edition.</p>
        <div className="context-fields">{record.fields.map(field => <section key={field.label}><h4>{field.label}</h4><p>{field.text}</p>{citations(field.sources)}</section>)}</div>
        {record.prosperityGospelRisk === 'flagged' && <p className="context-prosperity">This passage is sometimes read as a promise of health or wealth. The app does not endorse that reading. Read the context and its source wording together.</p>}
        {record.debateId && contextDebates[record.debateId] && <ThisIsDebated debate={contextDebates[record.debateId]}/>}
      </article>) : <p className="context-gap">Book-specific authorship, date, audience and political-background notes have not yet been prepared and independently reviewed for this passage. The surrounding text and publisher notes above remain available.</p>}
      <p className="context-review">Context coverage: {contextRecords.length} draft passage-setting records across {new Set(contextRecords.map(record => record.bookId)).size} books; 0 human-approved records. Source context works throughout the installed editions.</p>
    </>}
  </section>;
}

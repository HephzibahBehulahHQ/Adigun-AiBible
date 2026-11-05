import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { getBook, getEditionCatalog, getManifest } from '../data';
import { requirePermission } from '../permissions';
import { sourceDirection, sourceFont } from '../source-typography';
import type { Edition, Locale, Reference } from '../types';
import { defaultGospelSelection, gospelBooks, gospelNames, gospelReferenceKey, readGospelSelection, resolvePaneReference, setPaneLinked, validateGospelSelection, withGospelSelection } from './model';
import type { GospelBookId, GospelPane, GospelSelection } from './model';
import { loadGospelExcerpt } from './source';
import type { GospelExcerpt } from './source';
import GospelDownloads from './GospelDownloads';
import './gospels.css';

const sources = { getBook, getManifest, requirePermission };
const referenceLabel = (ref: Reference) => `${gospelNames[ref.bookId as GospelBookId] || ref.bookId} ${ref.chapter}:${ref.verse}${ref.endVerse && ref.endVerse !== ref.verse ? `–${ref.endVerse}` : ''}`;
type SelectionState = { selection: GospelSelection; error?: never } | { selection?: never; error: string };

function readSelection(editionId: string): SelectionState {
  try { return { selection: readGospelSelection(location.hash, editionId) }; }
  catch (reason) { return { error: reason instanceof Error ? reason.message : 'This Gospel comparison link is invalid.' }; }
}

function EditionOptions({ editions, selected }: { editions: Edition[]; selected: string }) {
  return <>{!editions.some(edition => edition.id === selected) && <option value={selected}>{selected} · source availability being checked</option>}{editions.map(edition => <option key={edition.id} value={edition.id}>{edition.name} · {edition.language}</option>)}</>;
}

function GospelPaneCard({ selection, pane, editions, onChange, onLinked, onRemove, onOpenReference }: {
  selection: GospelSelection; pane: GospelPane; editions: Edition[];
  onChange: (pane: GospelPane) => void; onLinked: (linked: boolean) => void;
  onRemove: () => void; onOpenReference: (reference: Reference) => void;
}) {
  const reference = resolvePaneReference(selection, pane), key = gospelReferenceKey(reference);
  const [result, setResult] = useState<{ key: string; excerpt?: GospelExcerpt; error?: string }>();
  const [attempt, setAttempt] = useState(0), [formError, setFormError] = useState('');
  const [draft, setDraft] = useState({ editionId: reference.editionId, chapter: String(reference.chapter), verse: String(reference.verse), endVerse: String(reference.endVerse) });
  useEffect(() => {
    let active = true;
    loadGospelExcerpt(reference, sources).then(excerpt => { if (active) setResult({ key, excerpt }); })
      .catch(reason => { if (active) setResult({ key, error: reason instanceof Error ? reason.message : 'This Gospel passage could not be opened.' }); });
    return () => { active = false; };
  }, [key, attempt]);
  useEffect(() => {
    setDraft({ editionId: reference.editionId, chapter: String(reference.chapter), verse: String(reference.verse), endVerse: String(reference.endVerse) });
    setFormError('');
  }, [key]);
  const excerpt = result?.key === key ? result.excerpt : undefined;
  const error = result?.key === key ? result.error : undefined;
  function apply(event: FormEvent) {
    event.preventDefault(); setFormError('');
    try {
      if (![draft.chapter, draft.verse, draft.endVerse].every(value => /^[1-9][0-9]*$/.test(value))) throw new Error('Enter whole positive chapter and verse numbers.');
      const next: GospelPane = { ...pane, linked: false, independent: { editionId: draft.editionId, chapter: Number(draft.chapter), verse: Number(draft.verse), endVerse: Number(draft.endVerse) } };
      validateGospelSelection({ ...selection, panes: selection.panes.map(value => value.bookId === pane.bookId ? next : value) });
      onChange(next);
    } catch (reason) { setFormError(reason instanceof Error ? reason.message : 'Choose a valid Gospel passage.'); }
  }
  return <article className="panel gospel-pane" aria-label={`${gospelNames[pane.bookId]} comparison pane`}>
    <header className="gospel-pane-heading"><div><span className="eyebrow">{pane.linked ? 'LINKED SOWER PASSAGE' : 'YOUR INDEPENDENT SELECTION'}</span><h2>{gospelNames[pane.bookId]}</h2></div><button className="text-button" disabled={selection.panes.length <= 2} onClick={onRemove} aria-label={`Remove ${gospelNames[pane.bookId]} pane`}>Remove</button></header>
    {pane.bookId !== 'JHN' ? <label className="gospel-link"><input type="checkbox" checked={pane.linked} onChange={event => onLinked(event.target.checked)}/>Follow the Sower selection</label> : <p className="muted small">John is an independent reading. No John counterpart is assigned to this selection.</p>}
    {!pane.linked && <form className="gospel-passage-form" onSubmit={apply}>
      <label>Independent edition<select value={draft.editionId} onChange={event => setDraft(value => ({ ...value, editionId: event.target.value }))}><EditionOptions editions={editions} selected={draft.editionId}/></select></label>
      <div className="gospel-range-inputs"><label>Chapter<input type="number" min="1" max="28" required value={draft.chapter} onChange={event => setDraft(value => ({ ...value, chapter: event.target.value }))}/></label><label>From verse<input type="number" min="1" max="200" required value={draft.verse} onChange={event => setDraft(value => ({ ...value, verse: event.target.value }))}/></label><label>Through verse<input type="number" min="1" max="200" required value={draft.endVerse} onChange={event => setDraft(value => ({ ...value, endVerse: event.target.value }))}/></label></div>
      <button className="secondary" type="submit">Apply independent passage</button>{formError && <p role="alert">{formError}</p>}
    </form>}
    <p className="gospel-reference">{referenceLabel(reference)} · {reference.editionId}</p>
    {error ? <div className="gospel-error"><p role="alert">{error} No other edition or range has been substituted.</p><button className="secondary" onClick={() => { setResult(undefined); setAttempt(value => value + 1); }}>Retry Gospel passage</button></div> : !excerpt ? <p role="status">Opening this exact Gospel passage…</p> : <>
      <p className="source-label gospel-edition">{excerpt.edition.name} · {excerpt.edition.language} · exact source wording</p>
      {excerpt.gaps.length > 0 && <div className="availability-note" role="status"><p>Source numbering and gaps are preserved.</p><ul>{excerpt.gaps.map(gap => <li key={gap.number}>{reference.chapter}:{gap.number} — {gap.reason === 'absent' ? 'No verse record in this edition.' : 'The numbered source record has no wording.'}</li>)}</ul></div>}
      <div className="gospel-source" lang={excerpt.edition.language} dir={sourceDirection(excerpt.edition.language)} style={{ fontFamily: sourceFont(excerpt.edition.language) }}>
        {excerpt.verses.map(verse => <p key={verse.number} data-verse={verse.number}><sup>{reference.chapter}:{verse.number}</sup> <span>{verse.text}</span></p>)}
      </div>
      <button className="secondary" onClick={() => onOpenReference(reference)}>Open {referenceLabel(reference)} in reader</button>
      <details className="gospel-context"><summary>Surrounding source context</summary><p className="muted small">The complete source chapter, preserving its own numbering.</p><div className="gospel-source" lang={excerpt.edition.language} dir={sourceDirection(excerpt.edition.language)} style={{ fontFamily: sourceFont(excerpt.edition.language) }}>{excerpt.context.map(verse => <p key={verse.number}><sup>{reference.chapter}:{verse.number}</sup> <span>{verse.text}</span></p>)}</div></details>
      <details className="gospel-attribution"><summary>Edition, revision and attribution</summary><p>{excerpt.attribution}</p><p>Source SHA-256: <span>{excerpt.sourceSha256}</span></p><a href={excerpt.edition.sourceUrl} target="_blank" rel="noreferrer">Publisher source</a>{excerpt.edition.noticePath && <a href={`${import.meta.env.BASE_URL}data/editions/${excerpt.edition.noticePath}`} target="_blank" rel="noreferrer">Complete source notice</a>}</details>
    </>}
  </article>;
}

export default function GospelWorkspace({ reference, editionId, locale, onOpenReference }: { reference: Reference; editionId: string; locale: Locale; onOpenReference: (reference: Reference) => void }) {
  const [state, setState] = useState<SelectionState>(() => readSelection(editionId));
  const [editions, setEditions] = useState<Edition[]>([]), [catalogError, setCatalogError] = useState(''), [catalogAttempt, setCatalogAttempt] = useState(0);
  const [addBook, setAddBook] = useState<GospelBookId>('JHN'), [message, setMessage] = useState('');
  const selectionHeading = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    const update = () => { setState(readSelection(editionId)); setMessage(''); };
    window.addEventListener('hashchange', update); window.addEventListener('popstate', update);
    return () => { window.removeEventListener('hashchange', update); window.removeEventListener('popstate', update); };
  }, [editionId]);
  useEffect(() => {
    let active = true; setCatalogError('');
    getEditionCatalog().then(catalog => { if (active) setEditions(catalog.editions.filter(edition => edition.corpus === 'bible')); })
      .catch(reason => { if (active) setCatalogError(reason instanceof Error ? reason.message : 'The edition catalog is unavailable.'); });
    return () => { active = false; };
  }, [catalogAttempt]);
  function change(next: GospelSelection, notice = '') {
    try {
      const valid = validateGospelSelection(next), hash = withGospelSelection(location.hash, valid);
      if (hash !== location.hash) history.pushState(history.state, '', hash);
      setState({ selection: valid }); setMessage(notice);
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'This selection could not be retained.'); }
  }
  const selection = state.selection, available = gospelBooks.filter(bookId => !selection?.panes.some(pane => pane.bookId === bookId));
  const chosen = available.includes(addBook) ? addBook : available[0];
  function remove(bookId: GospelBookId) {
    if (!selection || selection.panes.length <= 2) return;
    change({ ...selection, panes: selection.panes.filter(pane => pane.bookId !== bookId) }, `${gospelNames[bookId]} pane removed. The other selections are retained.`);
    requestAnimationFrame(() => selectionHeading.current?.focus());
  }
  return <div className="page gospel-workspace" lang="en">
    <div className="page-heading"><span className="eyebrow">READ EACH ACCOUNT IN ITS OWN WORDS</span><h1>Gospel comparison</h1><p>Read linked passages together, or choose two to four Gospel passages for your own comparison.</p>{locale !== 'en' && <p className="availability-note">(EN fallback) · These controls await reviewed {locale === 'de' ? 'German' : locale === 'yo' ? 'Yorùbá' : 'Nigerian Pidgin'} wording. Each Scripture pane keeps its actual source language.</p>}</div>
    <div className="gospel-return"><p>Reader passage retained: <strong>{referenceLabel(reference)}</strong> · {editionId}</p><button className="secondary" onClick={() => onOpenReference({ ...reference, editionId })}>Return to reader</button></div>
    {state.error ? <section className="panel"><p role="alert">{state.error} Your reader passage is unchanged.</p><button className="primary" onClick={() => change(defaultGospelSelection(editionId))}>Open the supplied Sower selection</button></section> : selection && <>
      <section className="panel gospel-selection" aria-labelledby="gospel-selection-title"><h2 id="gospel-selection-title" ref={selectionHeading} tabIndex={-1}>Parable of the Sower</h2><p>Matthew 13:1–23 · Mark 4:1–20 · Luke 8:4–15.</p><p className="muted">Study selection · editorial review pending. Each Gospel keeps its own wording and verse numbers. These ranges do not assert verse-by-verse equivalence or a common chronology. Independent panes are your selections, not reviewed parallel assignments.</p>
        <div className="gospel-controls"><label>Edition for linked Gospel panes<select value={selection.editionId} onChange={event => change({ ...selection, editionId: event.target.value }, 'Linked panes now use the selected edition. Independent panes are unchanged.')}><EditionOptions editions={editions} selected={selection.editionId}/></select></label><button className="secondary" onClick={() => change(defaultGospelSelection(selection.editionId), 'The three supplied Sower passages are linked again.')}>Reset to Sower passages</button></div>
        {selection.panes.length < 4 && <div className="gospel-controls"><label>Gospel to add<select value={chosen} onChange={event => setAddBook(event.target.value as GospelBookId)}>{available.map(bookId => <option key={bookId} value={bookId}>{gospelNames[bookId]}</option>)}</select></label><button className="secondary" onClick={() => chosen && change({ ...selection, panes: [...selection.panes, { bookId: chosen, linked: false, independent: { editionId: selection.editionId, chapter: 1, verse: 1, endVerse: 1 } }] }, `${gospelNames[chosen]} added as an independent passage. Choose its range below.`)}>Add independent pane</button></div>}
        {catalogError && <div><p role="alert">{catalogError}</p><button className="secondary" onClick={() => setCatalogAttempt(value => value + 1)}>Retry edition catalog</button></div>}{message && <p role="status">{message}</p>}
      </section>
      <GospelDownloads selection={selection}/>
      <div className="gospel-panes">{selection.panes.map(pane => <GospelPaneCard key={pane.bookId} selection={selection} pane={pane} editions={editions} onOpenReference={onOpenReference} onRemove={() => remove(pane.bookId)} onLinked={linked => change(setPaneLinked(selection, pane.bookId, linked))} onChange={next => change({ ...selection, panes: selection.panes.map(value => value.bookId === pane.bookId ? next : value) }, `${gospelNames[pane.bookId]} now uses your independent passage.`)}/>)}</div>
    </>}
  </div>;
}

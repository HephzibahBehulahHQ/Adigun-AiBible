import { useEffect, useRef, useState } from 'react';
import { assetUrl, getBook, getEditionCatalog, getManifest, sourceCredit } from '../data';
import { requirePermission } from '../permissions';
import { resolveMinistrySource } from '../ministry/source-core';
import type { Edition, Locale, Manifest, Reference } from '../types';
import { highlightParts, MAX_CONCORDANCE_QUERY, validateConcordanceQuery } from './model';
import type { ConcordanceMatch, ConcordanceQuery, ConcordanceResult } from './model';
import type { ConcordanceRequest, ConcordanceResponse } from './engine';
import './concordance.css';

export interface ConcordanceWorkspaceProps {
  reference: Reference;
  locale?: Locale;
  onOpenReference: (reference: Reference) => void;
}
const number = (value: number) => value.toLocaleString('en');
const sourceAccess = { getBook, getManifest, requirePermission };

export default function ConcordanceWorkspace({ reference, locale = 'en', onOpenReference }: ConcordanceWorkspaceProps) {
  const [editions, setEditions] = useState<Edition[]>([]), [catalogError, setCatalogError] = useState('');
  const [editionId, setEditionId] = useState(reference.editionId || 'eng-web');
  const [manifest, setManifest] = useState<Manifest | null>(null), [manifestError, setManifestError] = useState(''), [retry, setRetry] = useState(0);
  const [text, setText] = useState(''), [mode, setMode] = useState<'word' | 'phrase'>('word'), [caseSensitive, setCaseSensitive] = useState(false), [scope, setScope] = useState('all');
  const [result, setResult] = useState<ConcordanceResult | null>(null), [error, setError] = useState(''), [status, setStatus] = useState('Choose a source word or phrase. Counts appear only after complete source verification.');
  const [busy, setBusy] = useState(false), [workerReady, setWorkerReady] = useState(false), [opening, setOpening] = useState(false);
  const worker = useRef<Worker | null>(null), requestId = useRef(0), alive = useRef(true), focusResults = useRef(false), resultsHeading = useRef<HTMLHeadingElement>(null);

  function invalidate(message = 'Search changed. Run the concordance to obtain new verified counts.') {
    requestId.current++; worker.current?.postMessage({ type: 'cancel' } satisfies ConcordanceRequest);
    setBusy(false); setOpening(false); setResult(null); setError(''); setStatus(message); focusResults.current = false;
  }
  useEffect(() => {
    alive.current = true;
    try {
      const instance = new Worker(new URL('./concordance.worker.ts', import.meta.url), { type: 'module' }); worker.current = instance;
      instance.onmessage = ({ data }: MessageEvent<ConcordanceResponse>) => {
        if (!alive.current || data.id !== requestId.current) return;
        if (data.type === 'progress') setStatus(data.message);
        if (data.type === 'error') { setBusy(false); setResult(null); setError(data.error); setStatus('No verified concordance count is available.'); }
        if (data.type === 'result') {
          setBusy(false); setResult(data.result); setError('');
          setStatus(`Complete: ${number(data.result.occurrences)} occurrences in ${number(data.result.matchingVerses)} matching verses.`);
        }
      };
      instance.onerror = () => {
        if (!alive.current) return;
        requestId.current++; instance.terminate(); worker.current = null; setWorkerReady(false); setBusy(false); setResult(null);
        setError('The concordance worker could not run. Reload this page to retry; no partial result has been retained.');
        setStatus('Concordance is unavailable in this browser session.');
      };
      setWorkerReady(true);
    } catch {
      setError('This browser could not start the concordance worker. Use a browser with module worker support.');
    }
    return () => { alive.current = false; requestId.current++; worker.current?.terminate(); worker.current = null; };
  }, []);
  useEffect(() => {
    let active = true; setCatalogError('');
    void getEditionCatalog().then(catalog => { if (active) setEditions(catalog.editions.filter(edition => edition.corpus === 'bible')); }).catch(reason => {
      if (active) setCatalogError(reason instanceof Error ? reason.message : 'The edition catalog is unavailable.');
    });
    return () => { active = false; };
  }, [retry]);
  useEffect(() => {
    let active = true; setManifest(null); setManifestError('');
    void getManifest(editionId).then(value => { if (active) setManifest(value); }).catch(reason => {
      if (active) setManifestError(reason instanceof Error ? reason.message : 'The selected edition inventory is unavailable.');
    });
    return () => { active = false; };
  }, [editionId, retry]);
  useEffect(() => {
    invalidate('Selected reader edition changed. Choose a source word or phrase to count.');
    setEditionId(reference.editionId || 'eng-web'); setScope('all');
  }, [reference.editionId]);
  useEffect(() => {
    if (result && focusResults.current) { resultsHeading.current?.focus(); focusResults.current = false; }
  }, [result]);

  function run(page = 0) {
    if (!worker.current || !manifest || manifest.edition.id !== editionId) return;
    const query: ConcordanceQuery = { text, mode, caseSensitive, bookId: scope.startsWith('book:') ? scope.slice(5) : '', testament: scope === 'old' || scope === 'new' ? scope : '' };
    invalidate();
    try { validateConcordanceQuery(query); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Enter a valid source word or phrase.'); setStatus('The query needs a correction before counting.'); return; }
    focusResults.current = page > 0 || result !== null; setBusy(true); setStatus('Checking source permissions and verified index…');
    worker.current.postMessage({ type: 'search', id: requestId.current, editionId, baseUrl: new URL(assetUrl(''), location.href).href, query, page } satisfies ConcordanceRequest);
  }
  async function openContext(match: ConcordanceMatch) {
    if (!result || opening) return;
    const current = requestId.current, sourceSha256 = result.sourceSha256; setOpening(true); setError('');
    try {
      const source = await resolveMinistrySource(match.reference, sourceAccess, sourceSha256);
      if (source.verses.length !== 1 || source.verses[0].text !== match.text) throw new Error('The reader text differs from this verified index. Update the application before opening this result.');
      if (alive.current && requestId.current === current) onOpenReference(match.reference);
    } catch (reason) {
      if (alive.current && requestId.current === current) setError(reason instanceof Error ? reason.message : 'The exact source context is unavailable.');
    } finally { if (alive.current && requestId.current === current) setOpening(false); }
  }
  const sourceName = manifest?.edition.name || editions.find(edition => edition.id === editionId)?.name || editionId;
  const scopeLabel = scope === 'all' ? 'Whole edition' : scope === 'old' ? 'Old Testament' : scope === 'new' ? 'New Testament' : manifest?.books.find(book => `book:${book.id}` === scope)?.name || 'Selected book';

  return <div className="page tool-page concordance-workspace" lang="en">
    <div className="page-heading"><span className="eyebrow">EXACT SOURCE WORDS · COMPLETE COUNTS</span><h1>Edition concordance</h1><p>Find every occurrence of a source word or consecutive phrase, see its distribution, and open the exact passage in context.</p></div>
    {locale !== 'en' && <p className="availability-note">These controls use English. Scripture retains the selected edition’s original language and spelling.</p>}
    <section className="panel" aria-labelledby="concordance-query-heading">
      <h2 id="concordance-query-heading">Choose words and source</h2>
      {(catalogError || manifestError) && <div role="alert"><p>{catalogError || manifestError} Counts are unavailable.</p><button className="secondary" onClick={() => { invalidate(); setRetry(value => value + 1); }}>Retry source metadata</button></div>}
      <form onSubmit={event => { event.preventDefault(); run(); }}>
        <div className="concordance-controls">
          <label>Concordance edition<select aria-label="Concordance edition" value={editionId} disabled={!editions.length} onChange={event => { invalidate(); setManifest(null); setEditionId(event.target.value); setScope('all'); }}>{editions.map(edition => <option key={edition.id} value={edition.id}>{edition.name} · {edition.language}</option>)}</select></label>
          <label>Source word or phrase<input aria-label="Source word or phrase" required maxLength={MAX_CONCORDANCE_QUERY} autoComplete="off" value={text} onChange={event => { invalidate(); setText(event.target.value); }} placeholder="Enter wording from this edition"/></label>
          <label>Match mode<select aria-label="Match mode" value={mode} onChange={event => { invalidate(); setMode(event.target.value as 'word' | 'phrase'); }}><option value="word">Exact word</option><option value="phrase">Consecutive words (1–8)</option></select></label>
          <label>Concordance scope<select aria-label="Concordance scope" value={scope} disabled={!manifest} onChange={event => { invalidate(); setScope(event.target.value); }}><option value="all">Whole edition</option>{manifest?.books.some(book => book.id === 'MAT') && <><option value="old">Old Testament</option><option value="new">New Testament</option></>}{manifest?.books.map(book => <option key={book.id} value={`book:${book.id}`}>{book.name}</option>)}</select></label>
        </div>
        <label className="concordance-check"><input type="checkbox" checked={caseSensitive} onChange={event => { invalidate(); setCaseSensitive(event.target.checked); }}/><span>Match letter case</span></label>
        <p className="muted">Accents matter. Phrases match consecutive words within one verse; punctuation and spacing between words may differ. Overlapping occurrences are counted.</p>
        <div className="button-row"><button type="submit" className="primary" disabled={!manifest || !workerReady || busy || !text.trim()}>Find occurrences</button>{busy && <button type="button" className="secondary" onClick={() => invalidate('Concordance cancelled. No partial total was published.')}>Cancel concordance</button>}</div>
      </form>
      {!manifest && !manifestError && <p role="status">Loading the selected edition inventory…</p>}
      <p className="concordance-status" role="status" aria-label="Concordance status" aria-live="polite">{status}</p>
      {error && <p role="alert">{error}</p>}
      <details><summary>How words, phrases and counts work</summary><p>Words are Unicode letter and number runs, including attached accent marks. Internal straight and curly apostrophes remain part of the word and are distinct. Hyphens and other punctuation separate words. Canonically equivalent Unicode spelling is matched using NFC normalization; case is ignored unless you select “Match letter case.” Accents are never removed.</p><p>One verse can contain several occurrences. Overlapping phrase starts count separately, while the visual highlight joins overlapping spans. Phrases never cross a verse boundary. Blank source records contribute to coverage but contain no words.</p><p>This is analysis of the displayed edition’s wording. It does not identify Hebrew or Greek lemmas, morphology, Strong’s numbers, synonyms, themes or translation equivalents. No Scripture wording is changed.</p></details>
      <p className="muted">Searches run in this browser. This tool saves no query history, private records or telemetry. To use an edition offline, select it in the reader, open Settings and choose “Download complete Bible.” Viewing some chapters alone does not install its search index.</p>
    </section>
    {result && <section className="panel" aria-labelledby="concordance-results-heading" aria-busy={opening}>
      <h2 id="concordance-results-heading" ref={resultsHeading} tabIndex={-1}>Concordance results</h2>
      <p><strong>{result.edition.name}</strong> · {scopeLabel} · “{result.query.text}” · {result.query.caseSensitive ? 'case-sensitive' : 'case-insensitive'}, accents preserved</p>
      <dl className="concordance-totals"><div><dt>Word or phrase occurrences</dt><dd data-testid="concordance-occurrences">{number(result.occurrences)}</dd></div><div><dt>Matching verses</dt><dd data-testid="concordance-matching-verses">{number(result.matchingVerses)}</dd></div><div><dt>Source records searched</dt><dd data-testid="concordance-searched-records">{number(result.searchedRecords)}</dd></div></dl>
      <p className="muted">The complete {number(result.totalSourceRecords)}-record edition index passed byte checks and chapter coverage validation. Counts above cover {scopeLabel.toLowerCase()}.</p>
      {!result.matchingVerses && <p className="availability-note">Verified zero: this source scope has no occurrence under the selected matching rules. Different spellings and accents are not automatically substituted.</p>}
      <details className="concordance-distribution"><summary>Occurrences by book ({result.distribution.length})</summary><table><caption>Counts within the selected scope</caption><thead><tr><th scope="col">Source book</th><th scope="col">Occurrences</th><th scope="col">Verses</th></tr></thead><tbody>{result.distribution.map(book => <tr key={book.bookId}><th scope="row">{book.name}</th><td>{number(book.occurrences)}</td><td>{number(book.verses)}</td></tr>)}</tbody></table></details>
      {result.matchingVerses > 0 && <><div className="concordance-pagination" aria-label="Concordance result pages"><button className="secondary" disabled={result.page === 0 || opening} onClick={() => run(result.page - 1)}>Previous result page</button><p>Page {result.page + 1} of {Math.ceil(result.matchingVerses / result.pageSize)} · verses {number(result.page * result.pageSize + 1)}–{number(Math.min((result.page + 1) * result.pageSize, result.matchingVerses))} of {number(result.matchingVerses)}</p><button className="secondary" disabled={(result.page + 1) * result.pageSize >= result.matchingVerses || opening} onClick={() => run(result.page + 1)}>Next result page</button></div>
        <ol className="concordance-matches" start={result.page * result.pageSize + 1}>{result.matches.map(match => {
          const bookName = result.distribution.find(book => book.bookId === match.reference.bookId)?.name || match.reference.bookId;
          const label = `${bookName} ${match.reference.chapter}:${match.reference.verse}`;
          return <li key={`${match.reference.bookId}:${match.reference.chapter}:${match.reference.verse}`}><article><h3>{label}</h3><p className="muted">{match.spans.length} {match.spans.length === 1 ? 'occurrence' : 'occurrences'} in this source verse</p><p className="concordance-source-text" lang={result.edition.language}>{highlightParts(match.text, match.spans).map((part, index) => part.match ? <mark key={index}>{part.text}</mark> : <span key={index}>{part.text}</span>)}</p><button className="secondary" disabled={opening} aria-label={`Read ${label} in ${result.edition.name}`} onClick={() => void openContext(match)}>Read full chapter context</button></article></li>;
        })}</ol></>}
      <details><summary>Source identity, revision and permissions</summary><p className="source-credit">{sourceCredit(result.edition)}</p><p>Edition ID: <code>{result.edition.id}</code>. Display and search-index permissions were checked for this exact source revision.</p><p className="concordance-hash">Source SHA-256: {result.sourceSha256}</p><p className="concordance-hash">Search-index SHA-256: {result.indexSha256}</p><p className="concordance-hash">Content inventory: {result.contentVersion}</p></details>
    </section>}
    {!result && !busy && !error && <p className="muted">Selected source: {sourceName}. No count has been inferred from missing content.</p>}
  </div>;
}

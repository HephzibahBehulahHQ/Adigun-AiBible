import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { Locale } from '../types';
import { assetUrl } from '../data';
import { GreekSourceLoader, SOURCE_PREFIX } from './source';
import { ANNOTATION_ATTRIBUTION, describeToken, lemmaPage, NOTICE_PATHS, SOURCE_REVISION, TEXT_ATTRIBUTION } from './model';
import type { Morphology, SourceBook, SourceManifest, SourceToken, TokenLocation } from './model';
import { sourceSelectionFromHash, withSourceSelection } from './selection';
import type { SourceSelection } from './selection';
import SourceDownloads from './SourceDownloads';
import './greek-study.css';

const message = (reason: unknown) => reason instanceof Error ? reason.message : 'The Greek source could not be opened.';
const fields = [
  ['text','Exact text, including punctuation'], ['word','Supplied word field'], ['normalized','Upstream normalized field'],
  ['lemma','Exact supplied lemma field'], ['partOfSpeech','Raw part-of-speech code'], ['parsing','Raw parsing code'],
] as const;

/** Independent source coordinates; no Bible context or automatic alignment props. */
export default function GreekStudyWorkspace({ locale = 'en' }: { locale?: Locale }) {
  const baseUrl = useMemo(() => new URL(assetUrl(''), location.href).href, []);
  const loader = useMemo(() => new GreekSourceLoader(baseUrl), [baseUrl]);
  const [manifest, setManifest] = useState<SourceManifest | null>(null), [morphology, setMorphology] = useState<Morphology | null>(null);
  const [bookId, setBookId] = useState('Mt'), [chapterNumber, setChapterNumber] = useState('1'), [verseNumber, setVerseNumber] = useState('1');
  const [book, setBook] = useState<SourceBook | null>(null), [selectedLine, setSelectedLine] = useState(0);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [retry, setRetry] = useState(0), [selectionReady, setSelectionReady] = useState(false);
  const [lemmaInput, setLemmaInput] = useState(''), [lemma, setLemma] = useState(''), [page, setPage] = useState(0);
  const metadataAbort = useRef<AbortController | null>(null), loadAbort = useRef<AbortController | null>(null), sequence = useRef(0);
  const resultTitle = useRef<HTMLHeadingElement>(null), inspector = useRef<HTMLHeadingElement>(null), pendingFocus = useRef<number | null>(null);
  const selectionRef = useRef<SourceSelection | null>(null);
  const applySelection = useCallback((next: SourceSelection, persist: boolean) => {
    const previous = selectionRef.current;
    if (!previous || previous.book !== next.book) {
      loadAbort.current?.abort(); sequence.current++; setBook(null); setLoading(true); setLemma(''); setLemmaInput(''); setPage(0);
    }
    if (!previous || previous.book !== next.book || previous.chapter !== next.chapter || previous.verse !== next.verse) { setSelectedLine(0); pendingFocus.current = null; }
    selectionRef.current = next; setBookId(next.book); setChapterNumber(next.chapter); setVerseNumber(next.verse); setSelectionReady(true); setError('');
    if (persist) history.replaceState(history.state, '', withSourceSelection(location.hash, next));
  }, []);

  useEffect(() => {
    const controller = new AbortController(); let active = true; metadataAbort.current = controller;
    setManifest(null); setMorphology(null); setBook(null); setError(''); setLoading(true); setSelectionReady(false); selectionRef.current = null;
    void Promise.all([loader.loadManifest(controller.signal), loader.loadMorphology(controller.signal)]).then(([source, key]) => {
      if (!active || controller.signal.aborted) return; setManifest(source); setMorphology(key);
    }).catch(reason => { if (active && !controller.signal.aborted) { setError(message(reason)); setLoading(false); } });
    return () => { active = false; controller.abort(); };
  }, [loader, retry]);
  useEffect(() => {
    if (!manifest || !morphology) return;
    const restore = () => {
      if (!/^#\/greek-study(?:\/|\?|$)/.test(location.hash)) return;
      try { applySelection(sourceSelectionFromHash(location.hash, manifest), false); }
      catch (reason) { loadAbort.current?.abort(); sequence.current++; selectionRef.current = null; setSelectionReady(false); setBook(null); setSelectedLine(0); setLoading(false); setError(message(reason)); }
    };
    restore(); window.addEventListener('hashchange', restore); window.addEventListener('popstate', restore);
    return () => { window.removeEventListener('hashchange', restore); window.removeEventListener('popstate', restore); };
  }, [manifest, morphology, applySelection]);
  useEffect(() => {
    if (!manifest || !morphology || !selectionReady) return;
    const generation = ++sequence.current, controller = new AbortController(); loadAbort.current = controller;
    setBook(null); setSelectedLine(0); setLemma(''); setLemmaInput(''); setPage(0); setError(''); setLoading(true);
    void loader.loadBook(bookId, controller.signal).then(source => {
      if (generation !== sequence.current || controller.signal.aborted) return; setBook(source); setLoading(false);
    }).catch(reason => { if (generation === sequence.current && !controller.signal.aborted) { setBook(null); setError(message(reason)); setLoading(false); } });
    return () => { sequence.current++; controller.abort(); };
  }, [loader, manifest, morphology, bookId, selectionReady]);
  useEffect(() => () => loader.clear(), [loader]);

  const descriptor = manifest?.books.find(row => row.id === bookId), chapterDescriptor = descriptor?.chapters.find(row => row.number === chapterNumber);
  const currentBook = selectionReady && book?.book === bookId ? book : null;
  const chapter = currentBook?.chapters.find(row => row.number === chapterNumber), verse = chapter?.verses.find(row => row.number === verseNumber);
  const selected = verse?.tokens.find(token => token.sourceLine === selectedLine), description = selected && morphology ? describeToken(selected, morphology) : null;
  const matches = useMemo(() => currentBook && lemma ? lemmaPage(currentBook, lemma, page) : null, [currentBook, lemma, page]);
  const verseIndex = chapterDescriptor?.verseNumbers.indexOf(verseNumber) ?? -1;
  useEffect(() => { if (selected && pendingFocus.current === selected.sourceLine) { inspector.current?.focus(); pendingFocus.current = null; } }, [selected]);

  function chooseBook(id: string) { const next = manifest?.books.find(row => row.id === id); if (next) applySelection({ book: id, chapter: next.chapters[0].number, verse: next.chapters[0].verseNumbers[0] }, true); }
  function chooseChapter(number: string) { const next = descriptor?.chapters.find(row => row.number === number); if (next) applySelection({ book: bookId, chapter: number, verse: next.verseNumbers[0] }, true); }
  function chooseVerse(number: string) { if (chapterDescriptor?.verseNumbers.includes(number)) applySelection({ book: bookId, chapter: chapterNumber, verse: number }, true); }
  function inspectToken(token: SourceToken, focus = false) { pendingFocus.current = focus ? token.sourceLine : null; setSelectedLine(token.sourceLine); if (focus && selectedLine === token.sourceLine) inspector.current?.focus(); }
  function tokenKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!verse || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault(); const target = event.key === 'Home' ? 0 : event.key === 'End' ? verse.tokens.length - 1 : Math.max(0, Math.min(verse.tokens.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)));
    inspectToken(verse.tokens[target]); document.getElementById(`greek-token-${verse.tokens[target].sourceLine}`)?.focus();
  }
  function navigateResult(result: TokenLocation) { applySelection({ book: bookId, chapter: result.chapter, verse: result.verse }, true); pendingFocus.current = result.token.sourceLine; setSelectedLine(result.token.sourceLine); }
  function searchLemma(value = lemmaInput) { setLemmaInput(value); setLemma(value); setPage(0); requestAnimationFrame(() => resultTitle.current?.focus()); }
  function changePage(next: number) { setPage(next); requestAnimationFrame(() => resultTitle.current?.focus()); }
  function retrySource() { metadataAbort.current?.abort(); loadAbort.current?.abort(); sequence.current++; loader.clear(); setBook(null); setSelectedLine(0); setRetry(value => value + 1); }
  function cancelLoad() { metadataAbort.current?.abort(); loadAbort.current?.abort(); sequence.current++; setBook(null); setLoading(false); setError('Source loading cancelled. Retry to open the selected Greek source book.'); }
  const title = locale === 'de' ? 'Griechische Quellentexte' : locale === 'yo' ? 'Ìkẹ́kọ̀ọ́ orísun Gíríìkì' : 'Greek source study';

  return <div className="page tool-page greek-workspace" lang="en">
    <header className="panel"><p className="eyebrow">MorphGNT · SBL Greek New Testament</p><h1 lang={locale === 'pcm' ? 'en' : locale}>{title}</h1>
      <p>Read the exact supplied Greek tokens, punctuation, lemma fields and parsing annotations in 27 source books.</p>
      <p className="muted">This workspace has its own source selection. Your Bible path, edition and full selected range stay separate. No source token is automatically aligned with a translated word. Source descriptions and technical controls currently remain in English.</p>
    </header>
    {manifest && <section className="panel" aria-labelledby="greek-selection-title"><h2 id="greek-selection-title">Choose Greek source passage</h2>
      <div className="greek-selectors">
        <label htmlFor="greek-book">Source book</label><select id="greek-book" value={bookId} onChange={event => chooseBook(event.target.value)}>{manifest.books.map(row => <option key={row.id} value={row.id}>{row.name} ({row.id})</option>)}</select>
        <label htmlFor="greek-chapter">Source chapter</label><select id="greek-chapter" value={chapterNumber} onChange={event => chooseChapter(event.target.value)}>{descriptor?.chapters.map(row => <option key={row.number} value={row.number}>{row.number}</option>)}</select>
        <label htmlFor="greek-verse">Source verse</label><select id="greek-verse" value={verseNumber} onChange={event => chooseVerse(event.target.value)}>{chapterDescriptor?.verseNumbers.map(number => <option key={number} value={number}>{number}</option>)}</select>
      </div><p className="small">Selectors list only represented source verses. John 7:53 and 8:1–11 are absent from this pinned MorphGNT snapshot. No missing passage is manufactured or borrowed from a newer text.</p>
    </section>}
    {loading && <section className="panel"><p role="status">Verifying the Greek source and its supplied annotations…</p><button className="secondary" onClick={cancelLoad}>Cancel source loading</button></section>}
    {error && <section className="panel"><p role="alert">{error}</p><div className="button-row"><button className="secondary" onClick={retrySource}>Retry Greek source</button>{manifest && <button className="secondary" onClick={() => chooseBook(manifest.books[0].id)}>Open first Greek source passage</button>}</div></section>}
    {currentBook && verse && morphology && <>
      <section className="panel" aria-labelledby="greek-verse-title"><h2 id="greek-verse-title">{currentBook.name} {chapterNumber}:{verseNumber}</h2>
        <p className="muted small" data-testid="greek-source-reference">MorphGNT source reference {verse.reference} · {currentBook.sourceFile}</p>
        <p className="greek-main-text" lang="grc" dir="ltr" data-testid="greek-main-text">{verse.tokens.map((token, index) => <Fragment key={token.sourceLine}>{index > 0 ? ' ' : null}<button type="button" id={`greek-token-${token.sourceLine}`} className="greek-token" data-source-line={token.sourceLine} data-source-text="" aria-pressed={token.sourceLine === selectedLine} aria-label={`Inspect source token ${token.ordinal}: ${token.text}`} onClick={() => inspectToken(token)} onKeyDown={event => tokenKey(event, index)}>{token.text}</button></Fragment>)}</p>
        <p className="small">Each button preserves its exact source text, including punctuation and apparatus signs. Spaces separate supplied tokens for reading. Tab and Enter inspect a token; arrow keys, Home and End move within this verse.</p>
        <div className="button-row"><button className="secondary" disabled={verseIndex <= 0} onClick={() => chooseVerse(chapterDescriptor!.verseNumbers[verseIndex - 1])}>Previous source verse</button><button className="secondary" disabled={!chapterDescriptor || verseIndex >= chapterDescriptor.verseNumbers.length - 1} onClick={() => chooseVerse(chapterDescriptor!.verseNumbers[verseIndex + 1])}>Next source verse</button></div>
        <details><summary>Accessible source token list ({verse.tokens.length})</summary><ol className="greek-token-list">{verse.tokens.map(token => <li key={token.sourceLine}><button className="text-button" onClick={() => inspectToken(token, true)}>Inspect row {token.sourceLine}, token {token.ordinal}</button>{' '}<bdi lang="grc">{token.text}</bdi><span> — lemma <bdi lang="grc">{token.lemma}</bdi>; parsing <code>{token.parsing}</code></span></li>)}</ol></details>
      </section>
      <section className="panel" aria-labelledby="greek-inspector-title"><h2 id="greek-inspector-title" ref={inspector} tabIndex={-1}>Source token details</h2>
        {selected && description ? <>
          <p className="greek-selected-text" lang="grc" data-testid="greek-selected-text">{selected.text}</p>
          <dl className="greek-details"><dt>Source row locator</dt><dd><code>{currentBook.sourceFile}:{selected.sourceLine}</code></dd><dt>Source line</dt><dd data-testid="greek-source-line">{selected.sourceLine}</dd><dt>Token ordinal within this verse</dt><dd>{selected.ordinal}</dd>{fields.map(([field, label]) => <Fragment key={field}><dt>{label}</dt><dd data-source-field={field}><code lang={['text','word','normalized','lemma'].includes(field) ? 'grc' : undefined}>{selected[field]}</code></dd></Fragment>)}</dl>
          <p className="small">The file and line form a derived row locator; the source supplies no original word ID. The upstream normalized field is shown separately and never replaces the displayed text.</p>
          <h3>Supplied parsing key</h3><p>Part of speech: <code>{selected.partOfSpeech}</code> — {description.partOfSpeech ?? 'Unknown in supplied key'}</p>
          <div className="greek-table-wrap"><table><caption>Descriptions from the pinned MorphGNT README only</caption><thead><tr><th scope="col">Position</th><th scope="col">Raw</th><th scope="col">Supplied description</th></tr></thead><tbody>{description.positions.map(position => <tr key={position.name} data-parsing-position={position.name}><th scope="row">{position.name}</th><td><code>{position.raw}</code></td><td>{position.description ?? (position.raw === '-' ? 'Unexpanded placeholder' : 'Unknown in supplied key')}</td></tr>)}</tbody></table></div>
          <p className="small">A dash remains unexpanded. The source key does not define case <code>V</code>, observed in 668 tokens; no outside grammar supplies a replacement description here.</p>
          <button className="secondary" onClick={() => searchLemma(selected.lemma)}>Find this exact lemma field in {currentBook.name}</button>
        </> : <p>Select a source token, or use the accessible list, to inspect its original fields and supplied parsing descriptions.</p>}
      </section>
      <section className="panel"><h2>Source signs and limits</h2><p>Punctuation, brackets and apparatus signs remain exactly where this source puts them. These seven-column rows do not supply complete alternative-reading records. This viewer does not balance signs, reconstruct variants or supply Strong’s numbers, glosses, pronunciation or translated-word alignment.</p></section>
      <section className="panel" aria-labelledby="greek-lemma-title"><h2 id="greek-lemma-title">Exact lemma field in {currentBook.name}</h2>
        <p>Match the full literal upstream lemma field within this loaded source book. Accents, capitalization and every code point remain significant. Counts describe source-token occurrences and represented verses, not distinct meanings or translation equivalents.</p>
        <form onSubmit={event => { event.preventDefault(); searchLemma(); }}><label htmlFor="greek-lemma">Exact supplied lemma field</label><input id="greek-lemma" lang="grc" maxLength={256} autoComplete="off" spellCheck={false} value={lemmaInput} onChange={event => { setLemmaInput(event.target.value); setLemma(''); setPage(0); }} /><button type="submit" className="secondary" disabled={!lemmaInput}>Find exact lemma occurrences</button></form>
        <h3 tabIndex={-1} ref={resultTitle}>Source lemma results</h3>
        {matches ? <><p><strong data-testid="greek-lemma-occurrences">{matches.occurrences}</strong> occurrences in <strong data-testid="greek-lemma-verses">{matches.distinctVerses}</strong> represented source verses for <bdi lang="grc">{lemma}</bdi>.</p>
          {matches.results.length ? <><p>Page {matches.page + 1} of {matches.pages}. Up to 25 source tokens per page.</p><ol className="greek-lemma-results" start={matches.page * 25 + 1}>{matches.results.map(result => <li key={result.token.sourceLine}><button className="text-button" onClick={() => navigateResult(result)}>Open {currentBook.name} {result.chapter}:{result.verse}, token {result.token.ordinal}</button>{' '}<bdi lang="grc">{result.token.text}</bdi><span> · source row {result.token.sourceLine}</span></li>)}</ol><div className="button-row"><button className="secondary" disabled={matches.page === 0} onClick={() => changePage(matches.page - 1)}>Previous lemma result page</button><button className="secondary" disabled={matches.page + 1 >= matches.pages} onClick={() => changePage(matches.page + 1)}>Next lemma result page</button></div></> : <p>No token in this verified source book has that exact supplied lemma field.</p>}
        </> : <p>Select a token’s lemma field or enter an exact field to find its occurrences.</p>}
      </section>
    </>}
    {descriptor && <SourceDownloads key={bookId} baseUrl={baseUrl} bookId={bookId} bookName={descriptor.name} onRemoved={() => loader.clear()} />}
    <section className="panel" aria-labelledby="greek-provenance-title"><h2 id="greek-provenance-title">Source provenance and separate license layers</h2>
      <h3>Greek text · CC BY 4.0</h3><p>{TEXT_ATTRIBUTION}</p><p><a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">Creative Commons Attribution 4.0 International</a></p>
      <h3>Parsing and lemmatization · CC BY-SA 3.0</h3><p>{ANNOTATION_ATTRIBUTION}</p><p><a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noreferrer">Creative Commons Attribution-ShareAlike 3.0</a>. The source annotations and their lossless JSON reformatting retain these terms. The viewer presents the supplied rows interactively; no source wording or grammatical expansion is corrected.</p>
      <p className="small">Pinned MorphGNT revision: <code>{SOURCE_REVISION}</code>. The original 2017 citation is retained. This snapshot is separate from the newer Faithlife Greek text. It is not a human editorial or linguistic approval, an endorsement or a translated Bible edition.</p>
      <ul>{NOTICE_PATHS.map(path => <li key={path}><a href={assetUrl(SOURCE_PREFIX + path)}>{path.split('/').at(-1)} · complete original notice</a></li>)}<li><a href={assetUrl(SOURCE_PREFIX + 'source.json')}>Exact source and license provenance</a></li><li><a href={assetUrl(SOURCE_PREFIX + 'integrity.json')}>Pinned file integrity ledger</a></li><li><a href={assetUrl(SOURCE_PREFIX + 'morphology.json')}>Supplied grammar key</a></li></ul>
    </section>
  </div>;
}

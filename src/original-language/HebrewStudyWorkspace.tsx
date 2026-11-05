import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { Locale } from '../types';
import { assetUrl } from '../data';
import { HebrewSourceLoader, SOURCE_PREFIX } from './source';
import { findWord, lemmaPage, mainContent, OSHB_ATTRIBUTION, OSHB_REVISION, sourceText, verseNotes } from './model';
import type { Morphology, SourceBook, SourceContent, SourceManifest, SourceNode, WordLocation } from './model';
import SourceDownloads from './SourceDownloads';
import './hebrew-study.css';

type RenderProps = { content: SourceContent[]; selectedId: string; onWord: (id: string) => void };
function SourceNodes({ content, selectedId, onWord }: RenderProps) {
  return <>{content.map((node, index) => {
    if (typeof node === 'string') return <Fragment key={index}>{node}</Fragment>;
    if (node.tag === 'w') return <button key={index} type="button" className="hebrew-word" data-word-id={node.attributes.id} data-source-type={node.attributes.type}
      lang={node.attributes.morph.startsWith('A') ? 'arc' : 'he'} dir="rtl" aria-pressed={node.attributes.id === selectedId}
      aria-label={`Inspect source word ${node.attributes.id}: ${sourceText(node)}`} onClick={() => onWord(node.attributes.id)}>
      <SourceNodes content={node.content} selectedId={selectedId} onWord={onWord} />
    </button>;
    if (node.tag === 'seg') return <span key={index} className={`hebrew-segment ${node.attributes.type}`} data-source-type={node.attributes.type} data-source-subtype={node.attributes.subType}><SourceNodes content={node.content} selectedId={selectedId} onWord={onWord} /></span>;
    if (node.tag === 'catchWord') return <span className="hebrew-catchword" key={index} dir="rtl" lang="he"><SourceNodes content={node.content} selectedId={selectedId} onWord={onWord} /></span>;
    if (node.tag === 'rdg') return <div className="hebrew-reading" key={index} data-reading-type={node.attributes.type ?? 'unspecified'}>
      <p className="small">{node.attributes.type === 'x-qere' ? 'Qere — source reading alternative' : node.attributes.type === 'x-accent' ? 'Accent alternative supplied by the source' : 'Source reading (type unspecified)'}</p>
      {node.attributes.type === 'x-qere' && node.content.length === 0 ? <p>The source supplies an empty qere reading.</p> : <div className="hebrew-alternative-text" dir="rtl"><SourceNodes content={node.content} selectedId={selectedId} onWord={onWord} /></div>}
    </div>;
    return <div key={index}><SourceNodes content={node.content} selectedId={selectedId} onWord={onWord} /></div>;
  })}</>;
}
function Note({ node, index, selectedId, onWord }: { node: SourceNode; index: number; selectedId: string; onWord: (id: string) => void }) {
  return <li className="hebrew-note">
    <h4>Source note {index + 1}{node.attributes.type ? ` — ${node.attributes.type}` : ''}{node.attributes.n ? ` (n=${node.attributes.n})` : ''}</h4>
    <SourceNodes content={node.content} selectedId={selectedId} onWord={onWord} />
  </li>;
}
const errorMessage = (reason: unknown) => reason instanceof Error ? reason.message : 'The Hebrew source could not be opened.';

/** Independent OSHB selection. No Bible route/context props or automatic verse alignment. */
export default function HebrewStudyWorkspace({ locale = 'en' }: { locale?: Locale }) {
  const baseUrl = useMemo(() => new URL(assetUrl(''), location.href).href, []);
  const loader = useMemo(() => new HebrewSourceLoader(baseUrl), [baseUrl]);
  const [manifest, setManifest] = useState<SourceManifest | null>(null), [morphology, setMorphology] = useState<Morphology | null>(null);
  const [bookId, setBookId] = useState('Gen'), [chapterNumber, setChapterNumber] = useState('1'), [verseNumber, setVerseNumber] = useState('1');
  const [book, setBook] = useState<SourceBook | null>(null), [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const [lemmaInput, setLemmaInput] = useState(''), [lemma, setLemma] = useState(''), [page, setPage] = useState(0);
  const loadAbort = useRef<AbortController | null>(null), sequence = useRef(0), resultTitle = useRef<HTMLHeadingElement>(null), inspector = useRef<HTMLHeadingElement>(null);
  const pendingFocus = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController(); let current = true;
    setManifest(null); setMorphology(null); setBook(null); setError(''); setLoading(true);
    void Promise.all([loader.loadManifest(controller.signal), loader.loadMorphology(controller.signal)]).then(([source, key]) => {
      if (!current || controller.signal.aborted) return; setManifest(source); setMorphology(key);
    }).catch(reason => { if (current && !controller.signal.aborted) { setError(errorMessage(reason)); setLoading(false); } });
    return () => { current = false; controller.abort(); };
  }, [loader, retry]);
  useEffect(() => {
    if (!manifest || !morphology) return;
    const generation = ++sequence.current, controller = new AbortController(); loadAbort.current = controller;
    setBook(null); setSelectedId(''); setLemma(''); setLemmaInput(''); setPage(0); setError(''); setLoading(true);
    void loader.loadBook(bookId, controller.signal).then(source => {
      if (generation !== sequence.current || controller.signal.aborted) return;
      setBook(source); setLoading(false);
    }).catch(reason => { if (generation === sequence.current && !controller.signal.aborted) { setBook(null); setError(errorMessage(reason)); setLoading(false); } });
    return () => { sequence.current++; controller.abort(); };
  }, [loader, manifest, morphology, bookId]);
  useEffect(() => () => loader.clear(), [loader]);

  const descriptor = manifest?.books.find(row => row.id === bookId);
  const chapterDescriptor = descriptor?.chapters.find(row => row.number === chapterNumber);
  const currentBook = book?.book === bookId ? book : null;
  const chapter = currentBook?.chapters.find(row => row.number === chapterNumber), verse = chapter?.verses.find(row => row.number === verseNumber);
  const selected = useMemo(() => currentBook && selectedId ? findWord(currentBook, selectedId) : undefined, [currentBook, selectedId]);
  const matches = useMemo(() => currentBook && lemma ? lemmaPage(currentBook, lemma, page) : null, [currentBook, lemma, page]);
  const displayedSelection = selected?.osisId === verse?.osisId ? selected : undefined;
  useEffect(() => {
    if (pendingFocus.current && pendingFocus.current === selectedId && verse?.osisId === selected?.osisId) { inspector.current?.focus(); pendingFocus.current = null; }
  }, [selectedId, selected, verse]);

  function chooseBook(id: string) {
    const next = manifest?.books.find(row => row.id === id); if (!next) return;
    loadAbort.current?.abort(); sequence.current++; setBook(null); setSelectedId(''); setLemma(''); setError(''); setLoading(true);
    setBookId(id); setChapterNumber(next.chapters[0].number); setVerseNumber(next.chapters[0].verseNumbers[0]);
  }
  function chooseChapter(number: string) {
    const next = descriptor?.chapters.find(row => row.number === number); if (!next) return;
    setChapterNumber(number); setVerseNumber(next.verseNumbers[0]); setSelectedId('');
  }
  function chooseVerse(number: string) { if (chapterDescriptor?.verseNumbers.includes(number)) { setVerseNumber(number); setSelectedId(''); } }
  function inspectWord(id: string) { setSelectedId(id); }
  function navigateResult(result: WordLocation) {
    pendingFocus.current = result.word.attributes.id; setChapterNumber(result.chapter); setVerseNumber(result.verse); setSelectedId(result.word.attributes.id);
  }
  function searchLemma(value = lemmaInput) { setLemmaInput(value); setLemma(value); setPage(0); requestAnimationFrame(() => resultTitle.current?.focus()); }
  function changePage(next: number) { setPage(next); requestAnimationFrame(() => resultTitle.current?.focus()); }
  function retrySource() { loadAbort.current?.abort(); sequence.current++; loader.clear(); setBook(null); setSelectedId(''); setRetry(value => value + 1); }
  function cancelLoad() { loadAbort.current?.abort(); sequence.current++; setBook(null); setLoading(false); setError('Source loading cancelled. Retry to open the selected source book.'); }
  const title = locale === 'yo' ? 'Ìkẹ́kọ̀ọ́ orísun Hébérù àti Árámáíkì' : locale === 'de' ? 'Hebräische und aramäische Quellentexte' : 'Hebrew and Aramaic source study';
  const verseIndex = chapterDescriptor?.verseNumbers.indexOf(verseNumber) ?? -1;
  return <div className="hebrew-workspace">
    <header className="panel"><p className="eyebrow">Open Scriptures Hebrew Bible</p><h1>{title}</h1>
      <p>Explore the supplied Hebrew and Aramaic words, exact lemma fields, morphology annotations and reading alternatives in 39 source books.</p>
      <p className="muted">This workspace uses its own source numbering and selection. Your Bible reading context stays separate; a source verse is not automatically aligned with a translated verse. Source descriptions and technical controls are currently in English.</p>
    </header>
    {manifest && <section className="panel" aria-labelledby="hebrew-selection-title"><h2 id="hebrew-selection-title">Choose source passage</h2>
      <div className="hebrew-selectors">
        <label htmlFor="hebrew-book">Source book</label><select id="hebrew-book" value={bookId} onChange={event => chooseBook(event.target.value)}>{manifest.books.map(row => <option key={row.id} value={row.id}>{row.name} ({row.id})</option>)}</select>
        <label htmlFor="hebrew-chapter">Source chapter</label><select id="hebrew-chapter" value={chapterNumber} onChange={event => chooseChapter(event.target.value)}>{descriptor?.chapters.map(row => <option key={row.number} value={row.number}>{row.number}</option>)}</select>
        <label htmlFor="hebrew-verse">Source verse</label><select id="hebrew-verse" value={verseNumber} onChange={event => chooseVerse(event.target.value)}>{chapterDescriptor?.verseNumbers.map(number => <option key={number} value={number}>{number}</option>)}</select>
      </div>
    </section>}
    {loading && <div className="panel"><p role="status">Verifying the selected Hebrew source and its annotations…</p>{manifest && morphology && <button className="secondary" onClick={cancelLoad}>Cancel source loading</button>}</div>}
    {error && <section className="panel"><p role="alert">{error}</p><button className="secondary" onClick={retrySource}>Retry Hebrew source</button></section>}
    {currentBook && verse && morphology && <>
      <section className="panel" aria-labelledby="hebrew-verse-title">
        <h2 id="hebrew-verse-title">{currentBook.name} {chapterNumber}:{verseNumber}</h2><p className="muted small" data-testid="hebrew-source-reference">OSHB {verse.osisId}</p>
        <p className="hebrew-main-text" dir="rtl" data-testid="hebrew-main-text"><SourceNodes content={mainContent(verse)} selectedId={selectedId} onWord={inspectWord} /></p>
        <p className="small">Slashes are the source’s morpheme separators. Pointing, accents and special-letter segments are preserved. Underlined ketiv words remain in the main source text; qere and accent alternatives appear separately below.</p>
        <div className="button-row"><button className="secondary" disabled={verseIndex <= 0} onClick={() => chooseVerse(chapterDescriptor!.verseNumbers[verseIndex - 1])}>Previous source verse</button><button className="secondary" disabled={!chapterDescriptor || verseIndex >= chapterDescriptor.verseNumbers.length - 1} onClick={() => chooseVerse(chapterDescriptor!.verseNumbers[verseIndex + 1])}>Next source verse</button></div>
        <details><summary>Main-text word list ({mainContent(verse).filter(node => typeof node !== 'string' && node.tag === 'w').length})</summary>
          <ol className="hebrew-word-list">{mainContent(verse).filter((node): node is SourceNode => typeof node !== 'string' && node.tag === 'w').map(node => <li key={node.attributes.id}>
            <button className="text-button" onClick={() => { setSelectedId(node.attributes.id); pendingFocus.current = node.attributes.id; }}>Inspect {node.attributes.id}</button>{' '}<bdi dir="rtl" lang={node.attributes.morph.startsWith('A') ? 'arc' : 'he'}>{sourceText(node)}</bdi><span> — lemma <code>{node.attributes.lemma}</code>; morphology <code>{node.attributes.morph}</code>{node.attributes.type ? `; ${node.attributes.type}` : ''}</span>
          </li>)}</ol>
        </details>
      </section>
      <section className="panel" aria-labelledby="hebrew-inspector-title"><h2 id="hebrew-inspector-title" ref={inspector} tabIndex={-1}>Source word details</h2>
        {displayedSelection ? <>
          <p className="hebrew-selected-word" dir="rtl" data-testid="hebrew-selected-word"><SourceNodes content={displayedSelection.word.content} selectedId="" onWord={inspectWord} /></p>
          <p>{displayedSelection.alternative ? 'This word belongs to a source reading alternative, separately from the main text.' : 'This word belongs to the main source text.'}</p>
          <dl className="hebrew-word-details">{(['id','lemma','morph','n','type'] as const).map(field => <Fragment key={field}><dt>{field === 'id' ? 'Original word ID' : field === 'lemma' ? 'Supplied lemma field' : field === 'morph' ? 'Raw morphology code' : `Source attribute ${field}`}</dt><dd><code>{displayedSelection.word.attributes[field] ?? 'Not supplied'}</code></dd></Fragment>)}</dl>
          <h3>Supplied morphology description</h3>
          {Object.hasOwn(morphology.codes, displayedSelection.word.attributes.morph) ? <p className="hebrew-morphology" data-testid="hebrew-morphology-description">{morphology.codes[displayedSelection.word.attributes.morph]}</p> : <p role="status">Unknown in the supplied morphology key. The exact raw code is retained; no expansion has been inferred.</p>}
          <button className="secondary" onClick={() => searchLemma(displayedSelection.word.attributes.lemma)}>Find this exact lemma field in {currentBook.name}</button>
          <p className="muted small">Lemma identifiers are source annotations, not inferred English meanings. No gloss, transliteration, pronunciation or translation alignment is supplied by this viewer.</p>
        </> : <p>Select a source word, or use the accessible word list, to inspect its original ID, lemma field and morphology.</p>}
      </section>
      <section className="panel" aria-labelledby="hebrew-notes-title"><h2 id="hebrew-notes-title">Source notes and reading alternatives</h2>
        {verseNotes(verse).length ? <ol className="hebrew-notes">{verseNotes(verse).map((node, index) => <Note key={index} node={node} index={index} selectedId={selectedId} onWord={inspectWord} />)}</ol> : <p>No source notes or reading alternatives are supplied for this verse.</p>}
      </section>
      <section className="panel" aria-labelledby="hebrew-lemma-title"><h2 id="hebrew-lemma-title">Exact lemma field in {currentBook.name}</h2>
        <p>Match the complete supplied lemma field, including prefixes, slashes, spaces and qualifiers, within this source book’s main text. Reading alternatives are excluded from these counts. Different fields are not treated as equivalent words or meanings.</p>
        <form onSubmit={event => { event.preventDefault(); searchLemma(); }}><label htmlFor="hebrew-lemma">Exact supplied lemma field</label><input id="hebrew-lemma" maxLength={256} autoComplete="off" spellCheck={false} value={lemmaInput} onChange={event => { setLemmaInput(event.target.value); setLemma(''); setPage(0); }} /><button type="submit" className="secondary" disabled={!lemmaInput}>Find exact lemma occurrences</button></form>
        <h3 tabIndex={-1} ref={resultTitle}>Source lemma results</h3>
        {matches ? <><p><strong data-testid="hebrew-lemma-occurrences">{matches.occurrences}</strong> occurrences in <strong data-testid="hebrew-lemma-verses">{matches.distinctVerses}</strong> distinct source verses for <code>{lemma}</code>.</p>
          {matches.results.length ? <><p>Page {matches.page + 1} of {matches.pages}. Up to 25 source words per page.</p><ol className="hebrew-lemma-results" start={matches.page * 25 + 1}>{matches.results.map(result => <li key={result.word.attributes.id}><button className="text-button" onClick={() => navigateResult(result)}>Open {result.osisId}, word {result.word.attributes.id}</button>{' '}<bdi dir="rtl" lang={result.word.attributes.morph.startsWith('A') ? 'arc' : 'he'}>{sourceText(result.word)}</bdi></li>)}</ol>
            <div className="button-row"><button className="secondary" disabled={matches.page === 0} onClick={() => changePage(matches.page - 1)}>Previous lemma result page</button><button className="secondary" disabled={matches.page + 1 >= matches.pages} onClick={() => changePage(matches.page + 1)}>Next lemma result page</button></div></> : <p>No main-text word in this verified source book has that exact supplied lemma field.</p>}
        </> : <p>Select a word’s supplied field or enter an exact field to find its source occurrences.</p>}
      </section>
    </>}
    {descriptor && <SourceDownloads key={bookId} baseUrl={baseUrl} bookId={bookId} bookName={descriptor.name} onRemoved={() => loader.clear()} />}
    <section className="panel"><h2>Source provenance and permissions</h2><p>{OSHB_ATTRIBUTION}</p>
      <p>The upstream Hebrew text is declared public domain. Morphology and lemma annotations are licensed under <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>. This viewer preserves supplied text and annotations; source markup is presented as interactive words and separate notes.</p>
      <p className="muted small">Pinned revision: <code>{OSHB_REVISION}</code>. This is an attributed source-study resource, not a human editorial approval or a new translated Bible edition.</p>
      <ul><li><a href={assetUrl(`${SOURCE_PREFIX}notices/LICENSE.md`)}>Complete upstream license notice</a></li><li><a href={assetUrl(`${SOURCE_PREFIX}notices/README.md`)}>Upstream source README</a></li><li><a href={assetUrl(`${SOURCE_PREFIX}source.json`)}>Exact source provenance and revision</a></li><li><a href={assetUrl(`${SOURCE_PREFIX}notices/parsing-README.md`)}>Morphology source README</a></li></ul>
    </section>
  </div>;
}

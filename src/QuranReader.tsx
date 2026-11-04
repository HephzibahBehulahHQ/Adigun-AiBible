import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { assetUrl, getQuran, sourceCredit } from './data';
import type { PassageRef } from './editorial';
import { downloadOfflineFiles } from './offline';
import { readQuranPassage } from './publication';
import { searchQuran } from './quran-search';
import type { QuranSearchMode } from './quran-search';
import { loadSavedQuranSearches, persistSavedQuranSearches, removeQuranSearch, saveQuranSearch } from './quran-saved-search';
import type { SavedQuranSearch } from './quran-saved-search';
import type { QuranSource } from './types';

interface QuranReaderProps { initialRef?: PassageRef | null }
const editionId = 'eng-clearquran';
const referenceSystemId = `${editionId}:publisher-numbering`;
const offlinePaths = [
  'data/manifest.json',
  'data/editions/catalog.json',
  'data/editions/eng-clearquran/quran.json',
  'data/editions/eng-clearquran/manifest.json',
  'data/editions/eng-clearquran/NOTICE.txt',
];
const passage = (surah: number, verse: number): PassageRef => ({
  corpus: 'quran', workId: 'QUR', editionId, referenceSystemId,
  start: { chapter: surah, unit: String(verse) },
});
const passageLabel = (ref: PassageRef) => `Quran ${ref.start.chapter}:${ref.start.unit}${ref.end ? `–${ref.end.chapter}:${ref.end.unit}` : ''}`;
const supportedReference = (ref: PassageRef) => ref.corpus === 'quran' && ref.workId === 'QUR' &&
  ref.editionId === editionId && ref.referenceSystemId === referenceSystemId;
const message = (error: unknown) => error instanceof Error ? error.message : 'The source could not be loaded.';

export default function QuranReader({ initialRef = null }: QuranReaderProps) {
  const [opened, setOpened] = useState(Boolean(initialRef));
  const [source, setSource] = useState<QuranSource | null>(null);
  const [selected, setSelected] = useState<PassageRef | null>(initialRef);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState<QuranSearchMode>('phrase');
  const [searchSurah, setSearchSurah] = useState<number | ''>('');
  const [searchExclude, setSearchExclude] = useState('');
  const [searchError, setSearchError] = useState('');
  const [results, setResults] = useState<{ chapter: number; number: number; text: string }[] | null>(null);
  const [resultCount, setResultCount] = useState(0);
  const [savedSearches, setSavedSearches] = useState<SavedQuranSearch[]>([]);
  const [saveSearchName, setSaveSearchName] = useState('');
  const [savedSearchError, setSavedSearchError] = useState('');
  const [savedSearchStatus, setSavedSearchStatus] = useState('');
  const [savedSearchLoading, setSavedSearchLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [copyText, setCopyText] = useState('');
  const [downloading, setDownloading] = useState(false);
  const download = useRef<AbortController | null>(null);

  useEffect(() => {
    if (initialRef) { setSelected(initialRef); setOpened(true); }
  }, [initialRef]);
  useEffect(() => {
    if (!opened) return;
    let active = true;
    setError('');
    getQuran().then(data => {
      if (!active) return;
      setSource(data);
      setSelected(current => current ?? passage(data.surahs[0].number, data.surahs[0].verses[0].number));
    }).catch(reason => { if (active) setError(message(reason)); });
    return () => { active = false; };
  }, [opened, retry]);
  useEffect(() => {
    if (!opened) return;
    let active = true;
    setSavedSearchLoading(true);
    loadSavedQuranSearches().then(items => { if (active) setSavedSearches(items); })
      .catch(reason => { if (active) setSavedSearchError(message(reason)); })
      .finally(() => { if (active) setSavedSearchLoading(false); });
    return () => { active = false; };
  }, [opened]);
  useEffect(() => () => download.current?.abort(), []);

  if (!opened) return <section className="panel quran-reader" aria-labelledby="quran-reader-title">
    <h2 id="quran-reader-title">English Quran reader</h2>
    <p>Read and search the installed ClearQuran translation with its source attribution.</p>
    <button onClick={() => setOpened(true)}>Open English Quran reader</button>
  </section>;

  const excerpt = selected && supportedReference(selected) ? readQuranPassage(source, selected) : null;
  const surah = source?.surahs.find(item => item.number === selected?.start.chapter);
  const allVerses = source?.surahs.flatMap(item => item.verses.map(verse => ({ chapter: item.number, ...verse }))) ?? [];
  const selectedIndex = selected ? allVerses.findIndex(verse => verse.chapter === selected.start.chapter && String(verse.number) === selected.start.unit) : -1;
  const choose = (chapter: number, verse: number) => { setSelected(passage(chapter, verse)); setCopyText(''); setStatus(''); };
  const move = (delta: number) => { const verse = allVerses[selectedIndex + delta]; if (verse) choose(verse.chapter, verse.number); };

  const copy = async () => {
    if (!source || !selected || !excerpt) return;
    const text = `${passageLabel(selected)}\n${excerpt.verses.map(verse => `${verse.chapter}:${verse.number} ${verse.text}`).join('\n')}\n\n${sourceCredit(source.edition)}`;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      setCopyText(''); setStatus('Passage copied with source attribution.');
    } catch {
      setCopyText(text); setStatus('Clipboard access is unavailable. Select and copy the text below.');
    }
  };
  const runSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!source) return;
    try {
      const found = searchQuran(source, query, { mode: searchMode, surah: searchSurah, exclude: searchExclude });
      setResultCount(found.total); setResults(found.results); setSearchError('');
    } catch (reason) {
      setResults(null); setResultCount(0); setSearchError(message(reason));
    }
  };
  const saveCurrentSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!query.trim() || !saveSearchName.trim()) return;
    const now = new Date().toISOString();
    const candidate: SavedQuranSearch = {
      id: crypto.randomUUID(), name: saveSearchName.trim(), query: query.trim(), editionId,
      options: { mode: searchMode, surah: searchSurah, exclude: searchExclude },
      createdAt: now, updatedAt: now,
    };
    try {
      const next = saveQuranSearch(savedSearches, candidate);
      await persistSavedQuranSearches(next);
      setSavedSearches(next); setSaveSearchName(''); setSavedSearchError('');
      setSavedSearchStatus('Search saved privately on this device.');
    } catch (reason) { setSavedSearchError(message(reason)); }
  };
  const loadSavedSearch = (item: SavedQuranSearch) => {
    setQuery(item.query); setSearchMode(item.options.mode); setSearchSurah(item.options.surah); setSearchExclude(item.options.exclude);
    setResults(null); setSearchError('');
    setSavedSearchStatus(`Loaded “${item.name}”. Run the search to view its results.`);
  };
  const deleteSavedSearch = async (id: string) => {
    try {
      const next = removeQuranSearch(savedSearches, id);
      await persistSavedQuranSearches(next);
      setSavedSearches(next); setSavedSearchError('');
      setSavedSearchStatus('Saved Quran search removed from this device.');
    } catch (reason) { setSavedSearchError(message(reason)); }
  };
  const saveOffline = async () => {
    if (downloading || source?.edition.rights?.offline !== true) return;
    const controller = new AbortController();
    download.current = controller;
    setDownloading(true); setStatus('Verifying Quran source files for offline reading…');
    try {
      await downloadOfflineFiles(assetUrl(''), offlinePaths, {
        packId: editionId, signal: controller.signal,
        onProgress: (completed, total) => setStatus(`Verifying offline files: ${completed} of ${total}.`),
      });
      setStatus('English Quran source and attribution files are verified and saved for offline reading.');
    } catch (reason) {
      setStatus(controller.signal.aborted ? 'Offline download cancelled.' : `Offline download failed: ${message(reason)}`);
    } finally { download.current = null; setDownloading(false); }
  };

  return <section className="panel quran-reader" aria-labelledby="quran-reader-title">
    <h2 id="quran-reader-title">English Quran reader</h2>
    <p className="muted">Standalone source reading. Comparison review status is shown in the Bible study panel.</p>
    {error && <div role="alert"><p>{error}</p><button onClick={() => setRetry(value => value + 1)}>Retry Quran source</button></div>}
    {!source && !error && <p role="status">Loading English Quran source…</p>}
    {source && <>
      <p className="metadata">{source.edition.name} · {source.edition.language} · {source.surahs.length} surahs</p>
      {!excerpt && <div role="alert">
        <p>{selected && selected.editionId !== editionId
          ? `The requested edition (${selected.editionId}) is not available in this reader.`
          : 'The requested Quran passage is unavailable in the installed edition.'}</p>
        <button onClick={() => choose(source.surahs[0].number, source.surahs[0].verses[0].number)}>Open installed English Quran instead</button>
      </div>}
      {excerpt && selected && surah && <>
        <div className="quran-controls">
          <label>Quran surah<select aria-label="Quran surah" value={surah.number} onChange={event => {
            const next = source.surahs.find(item => item.number === Number(event.target.value));
            if (next) choose(next.number, next.verses[0].number);
          }}>{source.surahs.map(item => <option key={item.number} value={item.number}>{item.number}{item.name ? ` — ${item.name}` : ''}</option>)}</select></label>
          <label>Quran verse<select aria-label="Quran verse" value={selected.start.unit} onChange={event => choose(surah.number, Number(event.target.value))}>
            {surah.verses.map(verse => <option key={verse.number} value={verse.number}>{verse.number}</option>)}
          </select></label>
        </div>
        <div className="button-row">
          <button disabled={selectedIndex <= 0} onClick={() => move(-1)}>Previous Quran verse</button>
          <button disabled={selectedIndex < 0 || selectedIndex >= allVerses.length - 1} onClick={() => move(1)}>Next Quran verse</button>
          <button onClick={() => void copy()}>Copy Quran passage with attribution</button>
        </div>
        <h3>{passageLabel(selected)}</h3>
        <div className="quran-verses" aria-label="Quran passage with surrounding context">
          {excerpt.before.map(verse => <p className="muted" key={`before-${verse.chapter}-${verse.number}`}><sup>{verse.chapter}:{verse.number}</sup>{verse.text}</p>)}
          {excerpt.verses.map(verse => <p className="selected" key={`${verse.chapter}-${verse.number}`}><sup>{verse.chapter}:{verse.number}</sup>{verse.text}</p>)}
          {excerpt.after.map(verse => <p className="muted" key={`after-${verse.chapter}-${verse.number}`}><sup>{verse.chapter}:{verse.number}</sup>{verse.text}</p>)}
        </div>
        <details><summary>Read full surah {surah.number}{surah.name ? ` — ${surah.name}` : ''}</summary>
          <div className="quran-verses">{surah.verses.map(verse => <p key={verse.number}><sup>{surah.number}:{verse.number}</sup>{verse.text}</p>)}</div>
        </details>
      </>}
      <form onSubmit={runSearch}>
        <div className="quran-controls">
          <label>Search English Quran source<input aria-label="Search English Quran source" type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
          <label>Match<select aria-label="Quran search match" value={searchMode} onChange={event => setSearchMode(event.target.value as QuranSearchMode)}>
            <option value="phrase">Exact phrase</option><option value="all">All words</option><option value="any">Any word</option><option value="boolean">Boolean (AND / OR / NOT)</option>
          </select></label>
          <label>Surah<select aria-label="Search Quran surah" value={searchSurah} onChange={event => setSearchSurah(event.target.value ? Number(event.target.value) : '')}>
            <option value="">All surahs</option>{source.surahs.map(item => <option key={item.number} value={item.number}>{item.number}{item.name ? ` — ${item.name}` : ''}</option>)}
          </select></label>
          <label>Exclude words<input aria-label="Exclude Quran words" value={searchExclude} onChange={event => setSearchExclude(event.target.value)} /></label>
        </div>
        <button type="submit">Search Quran source</button>
      </form>
      <section className="quran-saved-searches" aria-label="Private saved Quran searches">
        <h3>Saved Quran searches</h3>
        <p className="muted">Save this query and its match mode, surah scope and exclusions privately on this device. Saved searches remain separate from Bible search.</p>
        <form onSubmit={saveCurrentSearch}>
          <label>Name this Quran search<input aria-label="Name this saved Quran search" value={saveSearchName} maxLength={80} onChange={event => setSaveSearchName(event.target.value)} /></label>
          <button type="submit" disabled={!query.trim() || !saveSearchName.trim()}>Save search privately</button>
        </form>
        {savedSearchLoading && <p role="status">Loading private Quran searches…</p>}
        {savedSearchError && <p className="error-message" role="alert">{savedSearchError}</p>}
        {savedSearchStatus && <p role="status">{savedSearchStatus}</p>}
        {savedSearches.length > 0 ? <ul>{savedSearches.map(item => <li key={item.id}>
          <strong>{item.name}</strong><span>{item.query} · {item.options.mode} · {item.options.surah === '' ? 'All surahs' : `Surah ${item.options.surah}`}</span>
          <div className="button-row">
            <button type="button" onClick={() => loadSavedSearch(item)}>Load saved search {item.name}</button>
            <button type="button" onClick={() => void deleteSavedSearch(item.id)}>Delete saved search {item.name}</button>
          </div>
        </li>)}</ul> : !savedSearchLoading && <p>No saved Quran searches yet.</p>}
      </section>
      {searchError && <p className="error-message" role="alert">{searchError}</p>}
      {results && <div aria-label="Quran source search results">
        <p role="status">{resultCount} source verses found.{resultCount > 100 ? ' Showing the first 100; refine your search to narrow results.' : ''}</p>
        {results.map(verse => <div key={`${verse.chapter}-${verse.number}`}><button onClick={() => choose(verse.chapter, verse.number)}>Open Quran {verse.chapter}:{verse.number}</button><p>{verse.text}</p></div>)}
      </div>}
      <h3>Source and permissions</h3>
      <p>{source.edition.attribution || source.edition.name}</p>
      <p className="metadata">{source.edition.license}</p>
      <div className="button-row">
        <a href={source.edition.sourceUrl} target="_blank" rel="noreferrer">Quran publisher</a>
        <a href={source.edition.licenseUrl} target="_blank" rel="noreferrer">Quran license and permissions</a>
        {source.edition.licenseDeedUrl && <a href={source.edition.licenseDeedUrl} target="_blank" rel="noreferrer">Quran license deed</a>}
        <a href={assetUrl('data/editions/eng-clearquran/NOTICE.txt')} download>Download full Quran source notice</a>
      </div>
      <div className="button-row">
        <button disabled={downloading || source.edition.rights?.offline !== true} onClick={() => void saveOffline()}>Download English Quran for offline reading</button>
        {downloading && <button onClick={() => download.current?.abort()}>Cancel Quran download</button>}
      </div>
      {status && <p role="status">{status}</p>}
      {copyText && <label>Quran text with attribution<textarea readOnly value={copyText} onFocus={event => event.target.select()} rows={8} /></label>}
    </>}
  </section>;
}

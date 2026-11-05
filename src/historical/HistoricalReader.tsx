import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { downloadPrivateFile } from '../workspace/shared';
import { downloadOfflineFiles, inspectOfflineDownloads, removeOfflineDownloads } from '../offline';
import { historicalDownloadPaths, historicalManifest, loadHistoricalWork } from './source';
import { historicalPlainText, locatorKey, searchHistorical, validateHistoricalStudy } from './model';
import type { HistoricalLocator, HistoricalStudy, HistoricalWork } from './model';
import { useHistoricalGuard, useHistoricalStudy } from './useHistoricalStudy';
import './historical.css';

const base = import.meta.env.BASE_URL;
function readSelection() {
  const query = new URLSearchParams(location.hash.split('?')[1]);
  return { editionId: query.get('historical') || historicalManifest.editions[0]?.id || '', chapter: Math.max(1, Number(query.get('hchapter')) || 1), unit: Math.max(1, Number(query.get('hunit')) || 1) };
}
export default function HistoricalReader() {
  const [selection, setSelection] = useState(readSelection);
  const [work, setWork] = useState<HistoricalWork | null>(null), [loadError, setLoadError] = useState(''), [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState(''), [message, setMessage] = useState(''), [error, setError] = useState('');
  const [draft, setDraft] = useState(''), [baseline, setBaseline] = useState(''), [noteId, setNoteId] = useState<string | null>(null), [draftLocator, setDraftLocator] = useState<HistoricalLocator | null>(null);
  const [incoming, setIncoming] = useState<HistoricalStudy | null>(null), [downloaded, setDownloaded] = useState(false), [downloading, setDownloading] = useState(false), [progress, setProgress] = useState('');
  const abort = useRef<AbortController | null>(null);
  const notebook = useHistoricalStudy();
  const busy = notebook.busy || downloading;
  const dirty = draft !== baseline;
  useHistoricalGuard(dirty, busy);
  const edition = historicalManifest.editions.find(item => item.id === selection.editionId);
  const currentWork = work?.editionId === selection.editionId ? work : null;
  const chapter = currentWork?.chapters.find(item => item.number === selection.chapter);
  useEffect(() => {
    const update = () => setSelection(readSelection());
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  useEffect(() => {
    let active = true; setLoadError('');
    loadHistoricalWork(selection.editionId).then(value => { if (active) setWork(value); }).catch(reason => { if (active) { setWork(null); setLoadError(reason instanceof Error ? reason.message : 'The historical text could not be loaded.'); } });
    return () => { active = false; };
  }, [selection.editionId, attempt]);
  useEffect(() => {
    let active = true;
    inspectOfflineDownloads(base).then(paths => { if (active) setDownloaded(!!edition && paths.includes(edition.path) && paths.includes(edition.noticePath)); }).catch(() => { if (active) setDownloaded(false); });
    return () => { active = false; };
  }, [edition]);
  useEffect(() => () => abort.current?.abort(), []);
  function open(chapterNumber: number, unit = 1, editionId = selection.editionId) {
    const url = location.hash.split('?')[0] || '#/library';
    const params = new URLSearchParams(location.hash.split('?')[1]);
    params.set('historical', editionId); params.set('hchapter', String(chapterNumber)); params.set('hunit', String(unit));
    location.hash = `${url}?${params}`;
    setSelection({ editionId, chapter: chapterNumber, unit });
    setMessage('');
  }
  function beginNote(locator: HistoricalLocator, id?: string) {
    if (busy || (dirty && !confirm('Discard the unsaved historical note before opening another?'))) return;
    const note = id ? notebook.state?.notes.find(item => item.id === id) : undefined;
    setDraftLocator(locator); setNoteId(note?.id || null); setDraft(note?.text || ''); setBaseline(note?.text || ''); setError('');
  }
  async function saveNote() {
    if (!draftLocator || !draft.trim() || busy) return;
    const note = { id: noteId || crypto.randomUUID(), locator: draftLocator, text: draft.trim(), updatedAt: new Date().toISOString() };
    if (await notebook.commit(state => {
      const existing = noteId ? state.notes.find(item => item.id === noteId) : undefined;
      if (noteId && (!existing || existing.text !== baseline)) throw new Error('The note changed since you opened it. Reload saved records; your draft is retained.');
      return { ...state, notes: existing ? state.notes.map(item => item.id === note.id ? note : item) : [note, ...state.notes] };
    })) { setNoteId(note.id); setDraft(note.text); setBaseline(note.text); setMessage('Historical note saved on this device.'); }
  }
  async function bookmark(locator: HistoricalLocator) {
    if (busy) return;
    if (await notebook.commit(state => ({ ...state, bookmarks: state.bookmarks.some(item => locatorKey(item) === locatorKey(locator)) ? state.bookmarks.filter(item => locatorKey(item) !== locatorKey(locator)) : [...state.bookmarks, locator] }))) setMessage('Historical bookmark updated on this device.');
  }
  async function removeNote(id: string) {
    if (busy || !confirm('Delete this saved historical note?')) return;
    if (await notebook.commit(state => ({ ...state, notes: state.notes.filter(note => note.id !== id) }))) {
      if (noteId === id) { setNoteId(null); setDraft(''); setBaseline(''); setDraftLocator(null); }
      setMessage('Historical note deleted.');
    }
  }
  async function readBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ''; setIncoming(null); setError('');
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('Historical notebook backups must be under 2 MB.');
      setIncoming(validateHistoricalStudy(JSON.parse(await file.text())));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The backup could not be read. Existing records are unchanged.'); }
  }
  async function restore() {
    if (!incoming || dirty || busy || !confirm('Replace this device’s historical notes and bookmarks with this validated backup? Other study tools are unaffected.')) return;
    if (await notebook.commit(state => ({ ...incoming, revision: state.revision }))) { setIncoming(null); setDraftLocator(null); setNoteId(null); setDraft(''); setBaseline(''); setMessage('Historical notebook restored.'); }
  }
  async function download() {
    if (!edition || busy) return; setError(''); setDownloading(true);
    const controller = new AbortController(); abort.current = controller;
    try {
      await downloadOfflineFiles(base, historicalDownloadPaths(edition.id), { packId: `historical-${edition.id}`, signal: controller.signal, onProgress: (done, total) => setProgress(`${done} of ${total} historical files verified`) });
      setDownloaded(true); setMessage('Historical text and source notice downloaded for offline reading.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Historical download failed. Existing downloads remain available.'); }
    finally { setDownloading(false); setProgress(''); abort.current = null; }
  }
  async function removeDownload() {
    if (!edition || busy) return; setError(''); setDownloading(true);
    try { await removeOfflineDownloads(base, { prefix: `data/historical/${edition.id}` }); setDownloaded(false); setMessage('Historical text download removed. Your notes and bookmarks are retained.'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Download removal failed.'); }
    finally { setDownloading(false); }
  }
  const results = currentWork && edition?.rights.search ? searchHistorical(currentWork, query) : [];
  const notes = notebook.state?.notes.filter(note => note.locator.editionId === selection.editionId) || [];
  const bookmarks = notebook.state?.bookmarks.filter(item => item.editionId === selection.editionId) || [];
  return <section className="historical-reader" aria-labelledby="historical-reader-title" lang="en">
    <div className="history-reader-heading"><span className="eyebrow">READABLE HISTORICAL EDITION</span><h3 id="historical-reader-title">Read the Didache</h3><p>All 16 chapters of the pinned Lightfoot transcription. This historical work stays separate from the Bible reader.</p></div>
    <div className="history-controls"><label>Historical edition<select value={selection.editionId} onChange={event => open(1, 1, event.target.value)}>{!edition && <option value={selection.editionId}>Unavailable edition</option>}{historicalManifest.editions.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>{edition && <label>Historical chapter<select value={selection.chapter} onChange={event => open(Number(event.target.value))}>{Array.from({ length: edition.chapters }, (_, index) => <option key={index + 1} value={index + 1}>Chapter {index + 1}</option>)}</select></label>}</div>
    {!edition ? <p role="alert">This historical edition is not installed. Choose an available edition.</p> : <>
      <p className="history-identity">{edition.translator} · {edition.sourceRevision} · {edition.chapters} chapters / {edition.units} source units</p>
      <p className="availability-note">{edition.canonScope}</p>
      <details className="history-provenance"><summary>Historical identity, rights and source evidence</summary><dl className="metadata"><dt>Classification</dt><dd>{edition.classification}</dd><dt>Authorship</dt><dd>{edition.authorship}</dd><dt>Dating</dt><dd>{edition.dating}</dd><dt>Survival</dt><dd>{edition.survival}</dd><dt>License</dt><dd>{edition.license}</dd><dt>Transcription status</dt><dd>{edition.transcriptionStatus}</dd><dt>SHA-256</dt><dd className="history-hash">{edition.sha256}</dd></dl><p>{edition.attribution}</p><a href={edition.sourceUrl} target="_blank" rel="noreferrer">Open pinned source transcription</a><ul>{edition.rightsEvidence.map(item => <li key={item.url}><a href={item.url} target="_blank" rel="noreferrer">{item.label}</a> — {item.note}</li>)}</ul><a href={`${base}${edition.noticePath}`} target="_blank" rel="noreferrer">Full source and license notice</a></details>
      <div className="history-actions"><button className="secondary" disabled={busy || !edition.rights.offline} onClick={() => void download()}>{downloaded ? 'Verify historical download' : `Download historical text (${Math.ceil(edition.bytes / 1024)} KB + notice)`}</button>{downloading && abort.current && <button className="secondary" onClick={() => abort.current?.abort()}>Cancel download</button>}{downloaded && <button className="text-button" disabled={busy} onClick={() => void removeDownload()}>Remove historical download</button>}{currentWork && edition.rights.export && <button className="secondary" onClick={() => downloadPrivateFile(`${edition.id}.txt`, historicalPlainText(currentWork, edition), 'text/plain;charset=utf-8')}>Export historical text</button>}</div>
      <p className="muted small">{downloaded ? 'Historical text and source notice are downloaded on this device.' : 'Offline availability is confirmed only after downloading.'} {progress}</p>
      {loadError ? <div><p role="alert">{loadError}</p><button className="secondary" onClick={() => setAttempt(value => value + 1)}>Retry historical text</button></div> : !currentWork ? <p role="status">Verifying the historical source text…</p> : !chapter ? <p role="alert">This historical chapter is absent. Choose a chapter from the available inventory.</p> : <>
        <label className="history-search">Search this historical edition<input type="search" maxLength={200} value={query} onChange={event => setQuery(event.target.value)}/></label>
        {query.trim() && <section aria-label="Historical search results"><p role="status">{results.length} matching source units. Matching ignores accents; displayed wording stays unchanged.</p><ul className="history-results">{results.slice(0, 100).map(result => <li key={`${result.chapter}:${result.unit}`}><button className="text-button" onClick={() => { open(result.chapter, result.unit); setQuery(''); }}>Didache {result.chapter}:{result.unit}</button><p>{result.text}</p></li>)}</ul>{results.length > 100 && <p>First 100 matches shown. Narrow the search to inspect the remainder.</p>}</section>}
        <nav className="history-actions" aria-label="Historical chapter navigation"><button className="secondary" disabled={selection.chapter <= 1} onClick={() => open(selection.chapter - 1)}>Previous historical chapter</button><button className="secondary" disabled={selection.chapter >= edition.chapters} onClick={() => open(selection.chapter + 1)}>Next historical chapter</button></nav>
        <h4>Didache · Chapter {chapter.number}</h4><p className="muted small">Numbers follow this transcription, not a shared versification with the Bible or every Didache edition.</p>
        <div className="history-text" lang={edition.language}>{chapter.units.map(unit => { const locator = { workId: currentWork.id, editionId: currentWork.editionId, sourceRevision: currentWork.sourceRevision, chapter: chapter.number, unit: unit.number }; const saved = bookmarks.some(item => locatorKey(item) === locatorKey(locator)); return <article key={unit.number} id={`historical-${chapter.number}-${unit.number}`} className={selection.unit === unit.number ? 'history-unit selected' : 'history-unit'} aria-label={`Didache ${chapter.number}:${unit.number}`}><p><sup>{chapter.number}:{unit.number}</sup> {unit.text}</p><div className="history-unit-actions"><button className="text-button" disabled={!notebook.state || busy} aria-pressed={saved} onClick={() => void bookmark(locator)}>{saved ? 'Remove historical bookmark' : 'Bookmark historical unit'}</button><button className="text-button" disabled={!notebook.state || busy} onClick={() => beginNote(locator)}>Write historical note</button></div></article>; })}</div>
        <p className="history-attribution">{edition.attribution} <a href={edition.licenseUrl} target="_blank" rel="noreferrer">CC BY-SA 4.0 notice</a></p>
      </>}
    </>}
    <section className="history-notebook" aria-labelledby="historical-notebook-title"><h4 id="historical-notebook-title">Private historical notebook</h4><p>Notes and bookmarks stay on this device, tied to the original work, edition and source revision. They are separate from Bible notes and are included in the backup below.</p><p role="status">{notebook.status}</p>{notebook.error && <p role="alert">{notebook.error}</p>}<button className="text-button" disabled={busy} onClick={() => void notebook.reload()}>Reload saved historical records</button>
      {draftLocator && <div className="history-note-editor"><h5>Note for {draftLocator.workId} {draftLocator.chapter}:{draftLocator.unit} · {draftLocator.sourceRevision}</h5><label>Historical note<textarea rows={5} maxLength={10000} value={draft} onChange={event => setDraft(event.target.value)}/></label><div className="history-actions"><button className="primary" disabled={!draft.trim() || busy || !notebook.state} onClick={() => void saveNote()}>Save historical note</button><button className="secondary" disabled={!draft.trim()} onClick={() => downloadPrivateFile('historical-note-draft.txt', `${draftLocator.workId} ${draftLocator.chapter}:${draftLocator.unit}\n${draftLocator.editionId} / ${draftLocator.sourceRevision}\n\n${draft}`, 'text/plain;charset=utf-8')}>Export unsaved historical note</button><button className="text-button" disabled={busy} onClick={() => { if (!dirty || confirm('Discard this unsaved historical note?')) { setDraftLocator(null); setNoteId(null); setDraft(''); setBaseline(''); } }}>Close historical note</button></div></div>}
      <div className="history-actions"><button className="secondary" disabled={!notebook.state || busy} onClick={() => notebook.state && downloadPrivateFile('adigun-historical-notebook.json', JSON.stringify(notebook.state, null, 2), 'application/json')}>Export historical notebook</button><label className="history-import">Import historical notebook<input type="file" accept=".json,application/json" disabled={busy} onChange={event => void readBackup(event)}/></label></div>
      {incoming && <div className="panel"><p>Validated backup: {incoming.notes.length} notes and {incoming.bookmarks.length} bookmarks. Replacement affects only this historical notebook; it replaces rather than merges duplicate records.</p><button className="secondary" disabled={busy || dirty || !notebook.state} onClick={() => void restore()}>Replace historical notebook from backup</button><button className="text-button" onClick={() => setIncoming(null)}>Cancel historical import</button></div>}
      {bookmarks.length > 0 && <details><summary>Saved historical bookmarks ({bookmarks.length})</summary><ul>{bookmarks.map(item => <li key={locatorKey(item)}><button className="text-button" onClick={() => open(item.chapter, item.unit, item.editionId)}>{item.workId} {item.chapter}:{item.unit}</button> · {item.sourceRevision}</li>)}</ul></details>}
      <div className="history-notes">{notes.map(note => <article className="panel" key={note.id}><h5>{note.locator.workId} {note.locator.chapter}:{note.locator.unit}</h5><p className="muted small">{note.locator.editionId} · {note.locator.sourceRevision} · {new Date(note.updatedAt).toLocaleString()}</p><p className="history-note-text">{note.text}</p><button className="text-button" disabled={busy} onClick={() => beginNote(note.locator, note.id)}>Edit historical note</button><button className="text-button" disabled={busy} onClick={() => void removeNote(note.id)}>Delete historical note</button></article>)}</div>
    </section>
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
  </section>;
}

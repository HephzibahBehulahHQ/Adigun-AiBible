import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Manifest, Reference } from '../types';
import {
  MAX_BACKUP_BYTES, MAX_TABS, addStudyTab, closeStudyTab, emptyReadingSession,
  parseReadingSessionBackup, passageLabel, readingSessionBackup, recordReadingVisit,
  renameStudyTab, samePassage, selectHistoryVisit, selectStudyTab,
} from './model';
import type { ReadingSessionState, SavedPassage } from './model';
import { prepareReadingPassage, prepareReadingSessionImport } from './source';
import { loadReadingSession, saveReadingSession } from './storage';
import './reading-session.css';

type Props = { reference: Reference; manifest: Manifest; onOpenReference: (reference: Reference) => void };
const id = () => crypto.randomUUID();
const message = (error: unknown) => error instanceof Error ? error.message : 'Reading session action could not be completed.';
const routeKey = (reference: Reference, sha?: string) => `${reference.editionId || 'eng-web'}:${reference.bookId}:${reference.chapter}:${reference.verse}:${reference.endVerse ?? reference.verse}:${sha || ''}`;

export default function ReadingSession({ reference, manifest, onOpenReference }: Props) {
  const [session, setSession] = useState<ReadingSessionState | null>(null);
  const [currentPassage, setCurrentPassage] = useState<SavedPassage | null>(null);
  const [storageError, setStorageError] = useState('');
  const [actionError, setActionError] = useState('');
  const [sourceError, setSourceError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);
  const [reload, setReload] = useState(0);
  const [newName, setNewName] = useState('');
  const stateRef = useRef<ReadingSessionState | null>(null);
  const blocked = useRef(false);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const alive = useRef(false);
  const skipRoute = useRef<string | null>(null);
  const key = routeKey(reference, manifest.edition.sha256);
  const latestKey = useRef(key);
  latestKey.current = key;

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = chain.current.catch(() => undefined).then(work);
    chain.current = result.catch(() => undefined);
    return result;
  }

  async function persist(update: (state: ReadingSessionState) => ReadingSessionState): Promise<ReadingSessionState> {
    const before = stateRef.current;
    if (!before || blocked.current) throw new Error('Reload saved sessions before making changes.');
    const next = update(before);
    try {
      const saved = await saveReadingSession(next, before.revision);
      stateRef.current = saved;
      if (alive.current) setSession(saved);
      return saved;
    } catch (error) {
      blocked.current = true;
      if (alive.current) setStorageError(message(error));
      throw error;
    }
  }

  useEffect(() => {
    let cancelled = false;
    setCurrentPassage(null);
    setSourceError('');
    const actualReference = { ...reference };
    void enqueue(async () => {
      if (cancelled || !alive.current) return;
      if (!stateRef.current) {
        try {
          const saved = await loadReadingSession();
          if (cancelled || !alive.current) return;
          stateRef.current = saved;
          blocked.current = false;
          setSession(saved);
          setStorageError('');
        } catch (error) {
          if (!cancelled && alive.current) { blocked.current = true; setStorageError(message(error)); }
          return;
        }
      }
      if (blocked.current) return;
      let passage: SavedPassage;
      try { passage = await prepareReadingPassage(actualReference, manifest); }
      catch (error) { if (!cancelled && alive.current) setSourceError(message(error)); return; }
      if (cancelled || !alive.current || latestKey.current !== key) return;
      setCurrentPassage(passage);
      if (skipRoute.current === key) { skipRoute.current = null; return; }
      skipRoute.current = null;
      const state = stateRef.current;
      const visit = state?.history[state.historyIndex];
      const active = state?.tabs.find(tab => tab.id === state.activeTabId);
      if (visit && active && samePassage(visit.passage, passage) && samePassage(active.passage, passage)) return;
      try { await persist(state => recordReadingVisit(state, passage, id(), new Date().toISOString(), id())); }
      catch { /* persist exposes the storage failure without replacing the saved session */ }
    });
    return () => { cancelled = true; };
    // The route is intentionally the trigger: changing tabs or importing never records a second visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reload]);

  async function action(work: () => Promise<void>) {
    if (pending) return;
    setPending(true); setActionError(''); setNotice('');
    try { await enqueue(work); }
    catch (error) { if (alive.current) setActionError(message(error)); }
    finally { if (alive.current) setPending(false); }
  }

  function open(passage: SavedPassage) {
    skipRoute.current = routeKey(passage.reference, passage.sourceSha256);
    onOpenReference(passage.reference);
  }

  function visitHistory(visitId: string) {
    const startedAt = latestKey.current;
    void action(async () => {
      const visit = stateRef.current?.history.find(item => item.id === visitId);
      if (!visit) throw new Error('That history entry is no longer saved.');
      const passage = await prepareReadingPassage(visit.passage.reference, undefined, visit.passage.sourceSha256);
      if (latestKey.current !== startedAt) throw new Error('The reader changed. Choose the saved passage again.');
      await persist(state => selectHistoryVisit(state, visitId));
      open(passage);
    });
  }

  function switchTab(tabId: string) {
    const startedAt = latestKey.current;
    void action(async () => {
      const tab = stateRef.current?.tabs.find(item => item.id === tabId);
      if (!tab) throw new Error('That study tab is no longer saved.');
      const passage = await prepareReadingPassage(tab.passage.reference, undefined, tab.passage.sourceSha256);
      if (latestKey.current !== startedAt) throw new Error('The reader changed. Choose the study tab again.');
      await persist(state => recordReadingVisit(selectStudyTab(state, tabId), passage, id(), new Date().toISOString(), id()));
      open(passage);
    });
  }

  function closeTab(tabId: string) {
    const startedAt = latestKey.current;
    void action(async () => {
      const state = stateRef.current;
      if (!state) return;
      const next = closeStudyTab(state, tabId);
      const nextTab = state.activeTabId === tabId ? next.tabs.find(tab => tab.id === next.activeTabId) : undefined;
      const passage = nextTab ? await prepareReadingPassage(nextTab.passage.reference, undefined, nextTab.passage.sourceSha256) : undefined;
      if (latestKey.current !== startedAt) throw new Error('The reader changed. Close the study tab again.');
      await persist(current => {
        const closed = closeStudyTab(current, tabId);
        return passage ? recordReadingVisit(closed, passage, id(), new Date().toISOString(), id()) : closed;
      });
      if (passage) open(passage);
    });
  }

  function addTab() {
    if (!currentPassage) return;
    const passage = currentPassage;
    void action(async () => { await persist(state => addStudyTab(state, passage, id())); setNotice('Study tab added.'); });
  }

  function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const tabId = session?.activeTabId;
    if (!tabId) return;
    void action(async () => { await persist(state => renameStudyTab(state, tabId, newName)); setNewName(''); setNotice('Study tab renamed.'); });
  }

  function exportSession() {
    if (!stateRef.current) return;
    const url = URL.createObjectURL(new Blob([readingSessionBackup(stateRef.current)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'adigun-reading-session.json'; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('Reading session backup downloaded.');
  }

  function importSession(file: File) {
    void action(async () => {
      if (file.size > MAX_BACKUP_BYTES) throw new Error('Reading session backup is too large.');
      const imported = await prepareReadingSessionImport(parseReadingSessionBackup(await file.text()));
      await persist(() => imported);
      setNotice('Reading session imported. Choose a saved tab or passage to open it.');
    });
  }

  function reloadSession() {
    void action(async () => {
      try {
        const saved = await loadReadingSession();
        stateRef.current = saved; blocked.current = false;
        setSession(saved); setStorageError(''); setReload(value => value + 1);
        setNotice('Saved reading sessions reloaded.');
      } catch (error) { blocked.current = true; setStorageError(message(error)); throw error; }
    });
  }

  const disabled = pending || !session || Boolean(storageError);
  const previous = session && session.historyIndex > 0 ? session.history[session.historyIndex - 1] : undefined;
  const next = session ? session.history[session.historyIndex + 1] : undefined;
  const active = session?.tabs.find(tab => tab.id === session.activeTabId);

  return <section className="reading-session" aria-labelledby="reading-session-heading" aria-busy={pending}>
    <div className="reading-session-bar">
      <h2 id="reading-session-heading">Reading session</h2>
      <div className="button-row">
        <button type="button" className="secondary" disabled={disabled || !previous} onClick={() => previous && visitHistory(previous.id)}>Previous passage</button>
        <button type="button" className="secondary" disabled={disabled || !next} onClick={() => next && visitHistory(next.id)}>Next passage</button>
        <button type="button" className="secondary" disabled={disabled || !currentPassage || (session?.tabs.length || 0) >= MAX_TABS} onClick={addTab}>Add study tab</button>
      </div>
    </div>
    {session?.tabs.length ? <ul className="reading-session-tabs" aria-label="Study tabs">{session.tabs.map(tab => <li key={tab.id} className={tab.id === session.activeTabId ? 'is-active' : ''}>
      <button type="button" className="reading-session-tab" aria-label={`Open study tab ${tab.name}`} aria-pressed={tab.id === session.activeTabId} disabled={disabled} onClick={() => switchTab(tab.id)}>
        <strong>{tab.name}</strong><span>{passageLabel(tab.passage)} · {tab.passage.editionName}</span>
        <small title={`Source revision ${tab.passage.sourceSha256}`}>Revision {tab.passage.sourceSha256.slice(0, 8)}</small>
      </button>
      <button type="button" className="text-button" aria-label={`Close study tab ${tab.name}`} disabled={disabled} onClick={() => closeTab(tab.id)}>Close</button>
    </li>)}</ul> : session ? <p className="reading-session-note">No saved study tabs.</p> : !storageError ? <p className="reading-session-note">Loading saved sessions…</p> : null}
    {storageError && <div role="alert"><p>{storageError}</p><button type="button" className="secondary" disabled={pending} onClick={reloadSession}>Reload saved sessions</button></div>}
    {sourceError && <p role="status">This passage was not added to your reading session: {sourceError}</p>}
    {actionError && actionError !== storageError && <p role="alert">{actionError}</p>}
    {notice && <p role="status">{notice}</p>}
    <details className="reading-session-details">
      <summary>History and tab names{session ? ` (${session.history.length} passages)` : ''}</summary>
      <p className="reading-session-note">Saved on this device. Up to 100 passages and 12 study tabs, with each edition and source revision.</p>
      {active && <form className="reading-session-rename" onSubmit={rename}>
        <label>Study tab name<input aria-label="Study tab name" value={newName} placeholder={active.name} maxLength={80} disabled={disabled} onChange={event => setNewName(event.target.value)} /></label>
        <button type="submit" className="secondary" disabled={disabled || !newName.trim()}>Rename study tab</button>
      </form>}
      {session?.history.length ? <ol className="reading-session-history">{[...session.history].reverse().map(visit => <li key={visit.id}>
        <button type="button" className="text-button" disabled={disabled} aria-current={session.history[session.historyIndex]?.id === visit.id ? 'location' : undefined} onClick={() => visitHistory(visit.id)}>{passageLabel(visit.passage)} · {visit.passage.editionName}</button>
        <small title={`Source revision ${visit.passage.sourceSha256}`}>Revision {visit.passage.sourceSha256.slice(0, 8)} · <time dateTime={visit.visitedAt}>{new Date(visit.visitedAt).toLocaleString()}</time></small>
      </li>)}</ol> : <p>No reading history saved.</p>}
    </details>
    <details className="reading-session-details">
      <summary>Reading session backup and clear</summary>
      <p className="reading-session-note">Backups contain passage history and study tabs. Import replaces this reading session after checking every passage and source revision. Study notes and bookmarks are managed separately.</p>
      <div className="button-row">
        <button type="button" className="secondary" disabled={!session || pending} onClick={exportSession}>Export reading session</button>
        <button type="button" className="secondary" disabled={disabled} onClick={() => void action(async () => { await persist(() => emptyReadingSession()); setNotice('Reading history and study tabs cleared on this device.'); })}>Clear reading session</button>
      </div>
      <label className="reading-session-import">Import reading session<input type="file" aria-label="Import reading session" accept="application/json,.json" disabled={disabled} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) importSession(file); }} /></label>
    </details>
  </section>;
}

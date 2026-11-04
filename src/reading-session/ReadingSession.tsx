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
import { DamagedReadingSessionError, ReadingSessionCancelledError, loadReadingSession, resetDamagedReadingSession, saveReadingSession } from './storage';
import type { ReadingSessionGuard } from './storage';
import './reading-session.css';

type Props = { reference: Reference; manifest: Manifest; onOpenReference: (reference: Reference) => void };
const id = () => crypto.randomUUID();
const message = (error: unknown) => error instanceof Error ? error.message : 'Reading session action could not be completed.';
const routeKey = (reference: Reference, sha?: string) => `${reference.editionId || 'eng-web'}:${reference.bookId}:${reference.chapter}:${reference.verse}:${reference.endVerse ?? reference.verse}:${sha || ''}`;
type Operation = { key: string; lifetime: object; controller: AbortController; guard: ReadingSessionGuard };
const isCurrent = (guard: ReadingSessionGuard) => !guard.signal?.aborted && (!guard.isCurrent || guard.isCurrent());
const isCancelled = (error: unknown) => error instanceof ReadingSessionCancelledError || error instanceof DOMException && error.name === 'AbortError';
function assertCurrent(guard: ReadingSessionGuard) {
  if (!isCurrent(guard)) throw new ReadingSessionCancelledError();
}

// Shared source requests may finish for another reader; an abandoned operation must stop waiting.
function waitFor<T>(operation: Operation, work: () => Promise<T>): Promise<T> {
  assertCurrent(operation.guard);
  return new Promise((resolve, reject) => {
    const signal = operation.controller.signal;
    const cleanup = () => signal.removeEventListener('abort', cancel);
    const cancel = () => { cleanup(); reject(new ReadingSessionCancelledError()); };
    signal.addEventListener('abort', cancel, { once: true });
    Promise.resolve().then(() => { assertCurrent(operation.guard); return work(); }).then(value => {
      cleanup();
      try { assertCurrent(operation.guard); resolve(value); } catch (error) { reject(error); }
    }, error => { cleanup(); reject(error); });
  });
}

function downloadJSON(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ReadingSession({ reference, manifest, onOpenReference }: Props) {
  const [session, setSession] = useState<ReadingSessionState | null>(null);
  const [currentPassage, setCurrentPassage] = useState<{ passage: SavedPassage; operation: Operation } | null>(null);
  const [storageError, setStorageError] = useState('');
  const [damaged, setDamaged] = useState<{ backup: string | null } | null>(null);
  const [actionError, setActionError] = useState('');
  const [sourceError, setSourceError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);
  const [reload, setReload] = useState(0);
  const [newName, setNewName] = useState('');
  const stateRef = useRef<ReadingSessionState | null>(null);
  const blocked = useRef(false);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const lifetime = useRef<object | null>(null);
  const currentOperation = useRef<Operation | null>(null);
  const pendingAction = useRef<object | null>(null);
  const skipRoute = useRef<string | null>(null);
  const key = routeKey(reference, manifest.edition.sha256);
  const latestKey = useRef(key);
  latestKey.current = key;

  useEffect(() => {
    const token = {};
    lifetime.current = token;
    return () => {
      if (lifetime.current === token) lifetime.current = null;
      currentOperation.current?.controller.abort();
    };
  }, []);

  function enqueue<T>(operation: Operation, work: () => Promise<T>): Promise<T> {
    const result = chain.current.catch(() => undefined).then(() => { assertCurrent(operation.guard); return work(); });
    chain.current = result.catch(() => undefined);
    return result;
  }

  function storageFailed(error: unknown, operation: Operation) {
    if (isCancelled(error) || !isCurrent(operation.guard)) return;
    blocked.current = true;
    setStorageError(message(error));
    setDamaged(error instanceof DamagedReadingSessionError ? { backup: error.backup } : null);
  }

  async function persist(operation: Operation, update: (state: ReadingSessionState) => ReadingSessionState): Promise<ReadingSessionState> {
    assertCurrent(operation.guard);
    const before = stateRef.current;
    if (!before || blocked.current) throw new Error('Reload saved sessions before making changes.');
    const next = update(before);
    try {
      const saved = await saveReadingSession(next, before.revision, operation.guard);
      // A transaction that already committed remains the baseline for the next queued route.
      if (lifetime.current === operation.lifetime && stateRef.current === before) stateRef.current = saved;
      assertCurrent(operation.guard);
      setSession(saved);
      return saved;
    } catch (error) {
      storageFailed(error, operation);
      throw error;
    }
  }

  useEffect(() => {
    const token = lifetime.current;
    if (!token) return;
    const controller = new AbortController();
    const operation: Operation = {
      key, lifetime: token, controller,
      guard: { signal: controller.signal, isCurrent: () => lifetime.current === token && currentOperation.current === operation && latestKey.current === key },
    };
    currentOperation.current = operation;
    pendingAction.current = null;
    setPending(false);
    setCurrentPassage(null);
    setSourceError('');
    setActionError('');
    const actualReference = { ...reference };
    void enqueue(operation, async () => {
      if (!stateRef.current) {
        try {
          const saved = await waitFor(operation, loadReadingSession);
          assertCurrent(operation.guard);
          stateRef.current = saved;
          blocked.current = false;
          setSession(saved);
          setStorageError('');
          setDamaged(null);
        } catch (error) {
          storageFailed(error, operation);
          return;
        }
      }
      assertCurrent(operation.guard);
      if (blocked.current) return;
      setSession(stateRef.current);
      setStorageError('');
      setDamaged(null);
      let passage: SavedPassage;
      try { passage = await waitFor(operation, () => prepareReadingPassage(actualReference, manifest)); }
      catch (error) { if (!isCancelled(error) && isCurrent(operation.guard)) setSourceError(message(error)); return; }
      assertCurrent(operation.guard);
      const skip = skipRoute.current === key;
      skipRoute.current = null;
      const state = stateRef.current;
      const visit = state?.history[state.historyIndex];
      const active = state?.tabs.find(tab => tab.id === state.activeTabId);
      if (!skip && !(visit && active && samePassage(visit.passage, passage) && samePassage(active.passage, passage))) {
        await persist(operation, state => recordReadingVisit(state, passage, id(), new Date().toISOString(), id()));
      }
      assertCurrent(operation.guard);
      setCurrentPassage({ passage, operation });
    }).catch(error => {
      if (!isCancelled(error) && isCurrent(operation.guard) && !blocked.current) setActionError(message(error));
    });
    return () => {
      controller.abort();
      if (currentOperation.current === operation) currentOperation.current = null;
    };
    // The route is intentionally the trigger: changing tabs or importing never records a second visit.
  }, [key, reload]);

  async function action(work: (operation: Operation) => Promise<void>) {
    // Capture this lifetime and route now, never after waiting for another queued operation.
    const operation = currentOperation.current;
    if (!operation || !isCurrent(operation.guard) || pendingAction.current) return;
    const actionToken = {};
    pendingAction.current = actionToken;
    setPending(true); setActionError(''); setNotice('');
    try { await enqueue(operation, () => work(operation)); }
    catch (error) { if (!isCancelled(error) && isCurrent(operation.guard)) setActionError(message(error)); }
    finally {
      if (pendingAction.current === actionToken) {
        pendingAction.current = null;
        if (isCurrent(operation.guard)) setPending(false);
      }
    }
  }

  function open(passage: SavedPassage, operation: Operation) {
    assertCurrent(operation.guard);
    skipRoute.current = routeKey(passage.reference, passage.sourceSha256);
    onOpenReference(passage.reference);
  }

  function visitHistory(visitId: string) {
    void action(async operation => {
      const visit = stateRef.current?.history.find(item => item.id === visitId);
      if (!visit) throw new Error('That history entry is no longer saved.');
      const passage = await waitFor(operation, () => prepareReadingPassage(visit.passage.reference, undefined, visit.passage.sourceSha256));
      await persist(operation, state => selectHistoryVisit(state, visitId));
      open(passage, operation);
    });
  }

  function switchTab(tabId: string) {
    void action(async operation => {
      const tab = stateRef.current?.tabs.find(item => item.id === tabId);
      if (!tab) throw new Error('That study tab is no longer saved.');
      const passage = await waitFor(operation, () => prepareReadingPassage(tab.passage.reference, undefined, tab.passage.sourceSha256));
      await persist(operation, state => recordReadingVisit(selectStudyTab(state, tabId), passage, id(), new Date().toISOString(), id()));
      open(passage, operation);
    });
  }

  function closeTab(tabId: string) {
    void action(async operation => {
      const state = stateRef.current;
      if (!state) return;
      const next = closeStudyTab(state, tabId);
      const nextTab = state.activeTabId === tabId ? next.tabs.find(tab => tab.id === next.activeTabId) : undefined;
      const passage = nextTab ? await waitFor(operation, () => prepareReadingPassage(nextTab.passage.reference, undefined, nextTab.passage.sourceSha256)) : undefined;
      await persist(operation, current => {
        const closed = closeStudyTab(current, tabId);
        return passage ? recordReadingVisit(closed, passage, id(), new Date().toISOString(), id()) : closed;
      });
      if (passage) open(passage, operation);
    });
  }

  function addTab() {
    const resolved = currentPassage;
    if (!resolved || resolved.operation !== currentOperation.current || !isCurrent(resolved.operation.guard)) return;
    void action(async operation => {
      if (operation !== resolved.operation || routeKey(resolved.passage.reference, resolved.passage.sourceSha256) !== operation.key) throw new ReadingSessionCancelledError();
      await persist(operation, state => addStudyTab(state, resolved.passage, id()));
      assertCurrent(operation.guard);
      setNotice('Study tab added.');
    });
  }

  function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const tabId = session?.activeTabId;
    const name = newName;
    if (!tabId) return;
    void action(async operation => {
      await persist(operation, state => renameStudyTab(state, tabId, name));
      assertCurrent(operation.guard);
      setNewName(''); setNotice('Study tab renamed.');
    });
  }

  function exportSession() {
    if (!stateRef.current) return;
    downloadJSON(readingSessionBackup(stateRef.current), 'adigun-reading-session.json');
    setNotice('Reading session backup downloaded.');
  }

  function importSession(file: File) {
    void action(async operation => {
      if (file.size > MAX_BACKUP_BYTES) throw new Error('Reading session backup is too large.');
      const text = await waitFor(operation, () => file.text());
      const parsed = parseReadingSessionBackup(text);
      const imported = await waitFor(operation, () => prepareReadingSessionImport(parsed));
      await persist(operation, () => imported);
      assertCurrent(operation.guard);
      setNotice('Reading session imported. Choose a saved tab or passage to open it.');
    });
  }

  function reloadSession() {
    void action(async operation => {
      try {
        const saved = await waitFor(operation, loadReadingSession);
        assertCurrent(operation.guard);
        stateRef.current = saved; blocked.current = false;
        setSession(saved); setStorageError(''); setDamaged(null); setReload(value => value + 1);
        setNotice('Saved reading sessions reloaded.');
      } catch (error) { storageFailed(error, operation); throw error; }
    });
  }

  function downloadDamaged() {
    if (damaged?.backup == null) return;
    downloadJSON(damaged.backup, 'adigun-damaged-reading-session.json');
    setNotice('Damaged reading session downloaded.');
  }

  function resetDamaged() {
    const captured = damaged;
    if (!captured) return;
    void action(async operation => {
      try {
        const saved = await resetDamagedReadingSession(captured.backup, operation.guard);
        if (lifetime.current === operation.lifetime) { stateRef.current = saved; blocked.current = false; }
        assertCurrent(operation.guard);
        blocked.current = false;
        setSession(saved); setStorageError(''); setDamaged(null);
        // A deliberate reset stays empty while making the current source usable again.
        skipRoute.current = operation.key;
        setReload(value => value + 1);
        setNotice('Damaged reading session reset on this device. You can import a valid backup.');
      } catch (error) { storageFailed(error, operation); throw error; }
    });
  }

  const routeReady = currentOperation.current && isCurrent(currentOperation.current.guard);
  const passageReady = currentPassage && currentPassage.operation === currentOperation.current && isCurrent(currentPassage.operation.guard);
  const disabled = pending || !session || Boolean(storageError) || !routeReady;
  const previous = session && session.historyIndex > 0 ? session.history[session.historyIndex - 1] : undefined;
  const next = session ? session.history[session.historyIndex + 1] : undefined;
  const active = session?.tabs.find(tab => tab.id === session.activeTabId);

  return <section className="reading-session" aria-labelledby="reading-session-heading" aria-busy={pending}>
    <div className="reading-session-bar">
      <h2 id="reading-session-heading">Reading session</h2>
      <div className="button-row">
        <button type="button" className="secondary" disabled={disabled || !previous} onClick={() => previous && visitHistory(previous.id)}>Previous passage</button>
        <button type="button" className="secondary" disabled={disabled || !next} onClick={() => next && visitHistory(next.id)}>Next passage</button>
        <button type="button" className="secondary" disabled={disabled || !passageReady || (session?.tabs.length || 0) >= MAX_TABS} onClick={addTab}>Add study tab</button>
      </div>
    </div>
    {session?.tabs.length ? <ul className="reading-session-tabs" aria-label="Study tabs">{session.tabs.map(tab => <li key={tab.id} className={tab.id === session.activeTabId ? 'is-active' : ''}>
      <button type="button" className="reading-session-tab" aria-label={`Open study tab ${tab.name}`} aria-pressed={tab.id === session.activeTabId} disabled={disabled} onClick={() => switchTab(tab.id)}>
        <strong>{tab.name}</strong><span>{passageLabel(tab.passage)} · {tab.passage.editionName}</span>
        <small title={`Source revision ${tab.passage.sourceSha256}`}>Revision {tab.passage.sourceSha256.slice(0, 8)}</small>
      </button>
      <button type="button" className="text-button" aria-label={`Close study tab ${tab.name}`} disabled={disabled} onClick={() => closeTab(tab.id)}>Close</button>
    </li>)}</ul> : session ? <p className="reading-session-note">No saved study tabs.</p> : !storageError ? <p className="reading-session-note">Loading saved sessions…</p> : null}
    {storageError && <div role="alert"><p>{storageError}</p><div className="button-row">
      <button type="button" className="secondary" disabled={pending || !routeReady} onClick={reloadSession}>Reload saved sessions</button>
      {damaged && <>
        <button type="button" className="secondary" disabled={pending || damaged.backup === null} onClick={downloadDamaged}>Download damaged session</button>
        <button type="button" className="secondary" disabled={pending || !routeReady} onClick={resetDamaged}>Reset damaged reading session</button>
      </>}
    </div>{damaged?.backup === null && <p>The damaged record could not be converted to a downloadable file. Resetting removes that record.</p>}</div>}
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
        <button type="button" className="secondary" disabled={disabled} onClick={() => void action(async operation => { await persist(operation, () => emptyReadingSession()); assertCurrent(operation.guard); setNotice('Reading history and study tabs cleared on this device.'); })}>Clear reading session</button>
      </div>
      <label className="reading-session-import">Import reading session<input type="file" aria-label="Import reading session" accept="application/json,.json" disabled={disabled} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) importSession(file); }} /></label>
    </details>
  </section>;
}

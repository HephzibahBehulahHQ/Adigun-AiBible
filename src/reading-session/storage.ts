import { emptyReadingSession, validateReadingSession } from './model.ts';
import type { ReadingSessionState } from './model';

export class ReadingSessionCancelledError extends Error {
  constructor() { super('The reader changed before this reading session action completed.'); this.name = 'ReadingSessionCancelledError'; }
}
export class DamagedReadingSessionError extends Error {
  readonly backup: string | null;
  constructor(raw: unknown) {
    super('The saved reading session is damaged. It has not been replaced. Download it before deliberately resetting this session.');
    this.name = 'DamagedReadingSessionError';
    try { this.backup = JSON.stringify({ kind: 'adigun-damaged-reading-session', version: 1, raw }, null, 2); }
    catch { this.backup = null; }
  }
}
export interface ReadingSessionGuard { signal?: AbortSignal; isCurrent?: () => boolean }
function assertCurrent(guard: ReadingSessionGuard) {
  if (guard.signal?.aborted || guard.isCurrent && !guard.isCurrent()) throw new ReadingSessionCancelledError();
}

let opening: Promise<IDBDatabase> | undefined;
function database(): Promise<IDBDatabase> {
  if (!opening) opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('Reading session storage is unavailable in this browser.')); return; }
    const request = indexedDB.open('adigun-aibible-reading-session', 1);
    let failed = false;
    const fail = (message: string) => { failed = true; reject(new Error(message)); };
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('sessions')) request.result.createObjectStore('sessions'); };
    request.onblocked = () => fail('Close other reading session windows and reload saved sessions.');
    request.onerror = () => fail('Reading session storage could not be opened. Existing sessions have not been replaced.');
    request.onsuccess = () => {
      const db = request.result;
      if (failed) { db.close(); return; }
      db.onversionchange = () => { db.close(); opening = undefined; };
      db.onclose = () => { opening = undefined; };
      resolve(db);
    };
  }).catch(error => { opening = undefined; throw error; });
  return opening;
}
export async function loadReadingSession(): Promise<ReadingSessionState> {
  const db = await database();
  return new Promise((resolve, reject) => {
    let result: ReadingSessionState, failure: unknown;
    const tx = db.transaction('sessions', 'readonly'), read = tx.objectStore('sessions').get('private');
    read.onsuccess = () => {
      try { result = read.result === undefined ? emptyReadingSession() : validateReadingSession(read.result); }
      catch { failure = new DamagedReadingSessionError(read.result); tx.abort(); }
    };
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(failure || new Error('Reading sessions could not be read. Existing data has not been replaced.'));
    tx.onerror = () => { failure ||= new Error('Reading session storage could not be read.'); };
  });
}
export async function saveReadingSession(state: ReadingSessionState, expectedRevision: number, guard: ReadingSessionGuard = {}): Promise<ReadingSessionState> {
  assertCurrent(guard);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= Number.MAX_SAFE_INTEGER - 1) throw new Error('Reading session revision is invalid.');
  const next = validateReadingSession({ ...state, revision: expectedRevision + 1 }), db = await database();
  assertCurrent(guard);
  return new Promise((resolve, reject) => {
    let failure: unknown;
    const tx = db.transaction('sessions', 'readwrite'), store = tx.objectStore('sessions'), read = store.get('private');
    const cancel = () => { failure = new ReadingSessionCancelledError(); try { tx.abort(); } catch { /* An already committed transaction cannot be reopened. */ } };
    guard.signal?.addEventListener('abort', cancel, { once: true });
    const cleanup = () => guard.signal?.removeEventListener('abort', cancel);
    read.onsuccess = () => {
      try {
        assertCurrent(guard);
        const current = read.result === undefined ? emptyReadingSession() : validateReadingSession(read.result);
        if (current.revision !== expectedRevision) throw new Error('Another window saved newer reading sessions. Reload saved sessions before making more changes.');
        store.put(next, 'private');
      } catch (error) { failure = error; tx.abort(); }
    };
    tx.oncomplete = () => { cleanup(); resolve(next); };
    tx.onabort = () => { cleanup(); reject(failure || new Error('Reading session changes were not saved. Storage may be full or denied.')); };
    tx.onerror = () => { failure ||= new Error('Reading session changes were not saved.'); };
  });
}

/** Explicit recovery only: never replace a record another window has already repaired. */
export async function resetDamagedReadingSession(expectedBackup: string | null, guard: ReadingSessionGuard = {}): Promise<ReadingSessionState> {
  assertCurrent(guard);
  const db = await database();
  assertCurrent(guard);
  return new Promise((resolve, reject) => {
    let failure: unknown;
    const next = { ...emptyReadingSession(), revision: Date.now() };
    const tx = db.transaction('sessions', 'readwrite'), store = tx.objectStore('sessions'), read = store.get('private');
    const cancel = () => { failure = new ReadingSessionCancelledError(); try { tx.abort(); } catch { /* Transaction already ended. */ } };
    guard.signal?.addEventListener('abort', cancel, { once: true });
    const cleanup = () => guard.signal?.removeEventListener('abort', cancel);
    read.onsuccess = () => {
      try {
        assertCurrent(guard);
        let damaged = false;
        try { validateReadingSession(read.result === undefined ? emptyReadingSession() : read.result); } catch { damaged = true; }
        if (!damaged) throw new Error('Another window repaired this session. Reload saved sessions before making changes.');
        const currentBackup = new DamagedReadingSessionError(read.result).backup;
        if (currentBackup !== expectedBackup) throw new Error('The damaged session changed in another window. Reload it before resetting.');
        store.put(next, 'private');
      } catch (error) { failure = error; tx.abort(); }
    };
    tx.oncomplete = () => { cleanup(); resolve(next); };
    tx.onabort = () => { cleanup(); reject(failure || new Error('The damaged session could not be reset. Existing data has not been replaced.')); };
    tx.onerror = () => { failure ||= new Error('Reading session storage could not be changed.'); };
  });
}

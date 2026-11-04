import { emptyReadingSession, validateReadingSession } from './model.ts';
import type { ReadingSessionState } from './model';

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
      catch (error) { failure = error; tx.abort(); }
    };
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(failure || new Error('Reading sessions could not be read. Existing data has not been replaced.'));
    tx.onerror = () => { failure ||= new Error('Reading session storage could not be read.'); };
  });
}
export async function saveReadingSession(state: ReadingSessionState, expectedRevision: number): Promise<ReadingSessionState> {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= Number.MAX_SAFE_INTEGER - 1) throw new Error('Reading session revision is invalid.');
  const next = validateReadingSession({ ...state, revision: expectedRevision + 1 }), db = await database();
  return new Promise((resolve, reject) => {
    let failure: unknown;
    const tx = db.transaction('sessions', 'readwrite'), store = tx.objectStore('sessions'), read = store.get('private');
    read.onsuccess = () => {
      try {
        const current = read.result === undefined ? emptyReadingSession() : validateReadingSession(read.result);
        if (current.revision !== expectedRevision) throw new Error('Another window saved newer reading sessions. Reload saved sessions before making more changes.');
        store.put(next, 'private');
      } catch (error) { failure = error; tx.abort(); }
    };
    tx.oncomplete = () => resolve(next);
    tx.onabort = () => reject(failure || new Error('Reading session changes were not saved. Storage may be full or denied.'));
    tx.onerror = () => { failure ||= new Error('Reading session changes were not saved.'); };
  });
}

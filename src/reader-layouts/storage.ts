import { emptyReaderLayouts, validateReaderLayouts } from './model.ts';
import type { ReaderLayoutsState } from './model';

export class DamagedReaderLayoutsError extends Error {
  readonly backup: string | null;
  constructor(raw: unknown) {
    super('Saved reader layouts are damaged. They have not been replaced. Download the damaged data before deliberately resetting them.');
    this.name = 'DamagedReaderLayoutsError';
    try { this.backup = JSON.stringify({ kind: 'adigun-damaged-reader-layouts', version: 1, raw }, null, 2); }
    catch { this.backup = null; }
  }
}

let opening: Promise<IDBDatabase> | undefined;
function database(): Promise<IDBDatabase> {
  if (!opening) opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('Reader layout storage is unavailable in this browser.')); return; }
    const request = indexedDB.open('adigun-aibible-reader-layouts', 1);
    let failed = false;
    const fail = (message: string) => { failed = true; reject(new Error(message)); };
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('layouts')) request.result.createObjectStore('layouts');
    };
    request.onblocked = () => fail('Close other reader layout windows and reload saved layouts.');
    request.onerror = () => fail('Reader layout storage could not be opened. Existing layouts have not been replaced.');
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
function storedState(raw: unknown): ReaderLayoutsState {
  if (raw === undefined) return emptyReaderLayouts();
  try { return validateReaderLayouts(raw); }
  catch { throw new DamagedReaderLayoutsError(raw); }
}

export async function loadReaderLayouts(): Promise<ReaderLayoutsState> {
  const db = await database();
  return new Promise((resolve, reject) => {
    let result: ReaderLayoutsState, failure: unknown;
    const tx = db.transaction('layouts', 'readonly'), read = tx.objectStore('layouts').get('private');
    read.onsuccess = () => {
      try { result = storedState(read.result); }
      catch (error) { failure = error; tx.abort(); }
    };
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(failure || new Error('Saved layouts could not be read. Existing layouts have not been replaced.'));
    tx.onerror = () => { failure ||= new Error('Reader layout storage could not be read.'); };
  });
}

/** Compare and write in one IndexedDB transaction so another tab cannot lose newer layouts. */
export async function saveReaderLayouts(state: ReaderLayoutsState, expectedRevision: number): Promise<ReaderLayoutsState> {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= Number.MAX_SAFE_INTEGER - 1) throw new Error('Saved layout revision is invalid.');
  const next = validateReaderLayouts({ ...state, revision: expectedRevision + 1 }), db = await database();
  return new Promise((resolve, reject) => {
    let failure: unknown;
    const tx = db.transaction('layouts', 'readwrite'), store = tx.objectStore('layouts'), read = store.get('private');
    read.onsuccess = () => {
      try {
        const current = storedState(read.result);
        if (current.revision !== expectedRevision) throw new Error('Another window saved newer reader layouts. Reload saved layouts before making more changes.');
        store.put(next, 'private');
      } catch (error) { failure = error; tx.abort(); }
    };
    tx.oncomplete = () => resolve(next);
    tx.onabort = () => reject(failure || new Error('Reader layout changes were not saved. Storage may be full or denied.'));
    tx.onerror = () => { failure ||= new Error('Reader layout changes were not saved.'); };
  });
}

/** Recovery requires the exact damaged record previously offered for download. */
export async function resetDamagedReaderLayouts(expectedBackup: string | null): Promise<ReaderLayoutsState> {
  if (expectedBackup === null) throw new Error('This damaged layout record cannot be compared safely and has not been reset.');
  const db = await database();
  return new Promise((resolve, reject) => {
    let failure: unknown;
    const next: ReaderLayoutsState = { ...emptyReaderLayouts(), revision: Date.now() };
    const tx = db.transaction('layouts', 'readwrite'), store = tx.objectStore('layouts'), read = store.get('private');
    read.onsuccess = () => {
      try {
        let damaged: DamagedReaderLayoutsError | null = null;
        try { storedState(read.result); }
        catch (error) { if (error instanceof DamagedReaderLayoutsError) damaged = error; else throw error; }
        if (!damaged) throw new Error('Another window repaired these layouts. Reload saved layouts before making changes.');
        if (damaged.backup !== expectedBackup) throw new Error('The damaged layouts changed in another window. Reload them before resetting.');
        store.put(next, 'private');
      } catch (error) { failure = error; tx.abort(); }
    };
    tx.oncomplete = () => resolve(next);
    tx.onabort = () => reject(failure || new Error('Damaged reader layouts could not be reset. Existing data has not been replaced.'));
    tx.onerror = () => { failure ||= new Error('Reader layout storage could not be changed.'); };
  });
}

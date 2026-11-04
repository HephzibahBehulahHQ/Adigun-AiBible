import { emptyFamilyArchive, validateFamilyState, verifyFamilyState } from './model.ts';
import type { FamilyState } from './model';

const DATABASE = 'adigun-aibible-family';
let opening: Promise<IDBDatabase> | undefined;

export class FamilyConflictError extends Error {
  constructor() {
    super('Another tab saved a newer family archive. Reload saved items before trying again. Your unsaved form remains here.');
    this.name = 'FamilyConflictError';
  }
}

function openDatabase(): Promise<IDBDatabase> {
  if (!opening) {
    opening = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('Private device storage is unavailable in this browser.')); return; }
      const request = indexedDB.open(DATABASE, 1);
      let rejected = false;
      const fail = (message: string) => { rejected = true; reject(new Error(message)); };
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('archive')) request.result.createObjectStore('archive'); };
      request.onerror = () => fail('Could not open family archive storage. Existing records have not been replaced.');
      request.onblocked = () => fail('Close other family archive tabs, then retry opening storage.');
      request.onsuccess = () => {
        const db = request.result;
        if (rejected) { db.close(); return; }
        db.onversionchange = () => { db.close(); opening = undefined; };
        db.onclose = () => { opening = undefined; };
        resolve(db);
      };
    }).catch(error => { opening = undefined; throw error; });
  }
  return opening;
}

export async function loadFamilyArchive(): Promise<FamilyState> {
  const db = await openDatabase();
  const state = await new Promise<FamilyState>((resolve, reject) => {
    let result: FamilyState;
    let failure: unknown;
    const tx = db.transaction('archive', 'readonly');
    const request = tx.objectStore('archive').get('family');
    request.onsuccess = () => {
      try { result = request.result === undefined ? emptyFamilyArchive() : validateFamilyState(request.result); }
      catch (error) { failure = error; tx.abort(); }
    };
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(failure || new Error('Could not read the family archive. Existing records have not been replaced.'));
    tx.onerror = () => { failure ||= new Error('Could not read the family archive. Existing records have not been replaced.'); };
  });
  return verifyFamilyState(state);
}

/** Validate files before entering a single revision-checked transaction. Resolve only after commit. */
export async function saveFamilyArchive(value: FamilyState, expectedRevision: number): Promise<FamilyState> {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= Number.MAX_SAFE_INTEGER) throw new Error('Invalid family archive revision. Reload saved items before trying again.');
  const next = await verifyFamilyState({ ...value, revision: expectedRevision + 1 });
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    let failure: unknown;
    const tx = db.transaction('archive', 'readwrite');
    const store = tx.objectStore('archive');
    const read = store.get('family');
    read.onsuccess = () => {
      try {
        const previous = read.result === undefined ? emptyFamilyArchive() : validateFamilyState(read.result);
        if (previous.revision !== expectedRevision) throw new FamilyConflictError();
        store.put(next, 'family');
      } catch (error) { failure = error; tx.abort(); }
    };
    tx.oncomplete = () => resolve(next);
    tx.onabort = () => reject(failure || new Error('Family archive was not saved. Storage may be full or denied. Keep this form open and download your original file.'));
    tx.onerror = () => { failure ||= new Error('Family archive was not saved. Storage may be full or denied. Keep this form open and download your original file.'); };
  });
}

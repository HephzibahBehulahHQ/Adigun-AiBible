import { emptyLinguistics, validateLinguistics } from './model.ts';
import type { LinguisticsState } from './model';
let opening: Promise<IDBDatabase> | undefined;
function openDatabase(): Promise<IDBDatabase> {
  if (!opening) opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('Private linguistics storage is unavailable in this browser.')); return; }
    const request = indexedDB.open('adigun-aibible-linguistics', 1); let failed = false;
    const fail = (message: string) => { failed = true; reject(new Error(message)); };
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('workspace')) request.result.createObjectStore('workspace'); };
    request.onerror = () => fail('Could not open linguistics storage. Existing records have not been replaced.');
    request.onblocked = () => fail('Close another linguistics tab, then retry storage.');
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
export async function loadLinguistics(): Promise<LinguisticsState> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    let result: LinguisticsState; let failure: unknown;
    const tx = db.transaction('workspace', 'readonly');
    const request = tx.objectStore('workspace').get('private');
    request.onsuccess = () => { try { result = request.result === undefined ? emptyLinguistics() : validateLinguistics(request.result); } catch (error) { failure = error; tx.abort(); } };
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(failure || new Error('Could not read linguistics storage. Existing records were retained.'));
    tx.onerror = () => { failure ||= new Error('Could not read linguistics storage. Existing records were retained.'); };
  });
}
export async function saveLinguistics(value: LinguisticsState, expectedRevision: number): Promise<LinguisticsState> {
  const next = validateLinguistics({ ...value, revision: expectedRevision + 1 });
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    let failure: unknown;
    const tx = db.transaction('workspace', 'readwrite'), store = tx.objectStore('workspace'), read = store.get('private');
    read.onsuccess = () => { try {
      const previous = read.result === undefined ? emptyLinguistics() : validateLinguistics(read.result);
      if (previous.revision !== expectedRevision) throw new Error('Another tab saved newer linguistics records. Export your draft, then reload before saving again.');
      store.put(next, 'private');
    } catch (error) { failure = error; tx.abort(); } };
    tx.oncomplete = () => resolve(next);
    tx.onabort = () => reject(failure || new Error('Translation experiment changes were not saved. Storage may be full or denied; your draft remains on this screen.'));
    tx.onerror = () => { failure ||= new Error('Translation experiment changes were not saved. Storage may be full or denied; your draft remains on this screen.'); };
  });
}

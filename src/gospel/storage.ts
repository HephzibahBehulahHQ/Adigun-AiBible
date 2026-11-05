import { emptyGospel, validateGospel } from './model.ts';
import type { GospelState } from './model';

let opening: Promise<IDBDatabase> | undefined;
function openDatabase(): Promise<IDBDatabase> {
  if (!opening) opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('Private Gospel storage is unavailable in this browser.')); return; }
    const request = indexedDB.open('adigun-aibible-gospel-study', 1); let failed = false;
    const fail = (message: string) => { failed = true; reject(new Error(message)); };
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('workspace')) request.result.createObjectStore('workspace'); };
    request.onerror = () => fail('Could not open Gospel storage. Existing records have not been replaced.');
    request.onblocked = () => fail('Close another Gospel study tab, then retry storage.');
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
export async function loadGospel(): Promise<GospelState> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    let result: GospelState; let failure: unknown;
    const tx = db.transaction('workspace', 'readonly'), request = tx.objectStore('workspace').get('private');
    request.onsuccess = () => { try { result = request.result === undefined ? emptyGospel() : validateGospel(request.result); } catch (error) { failure = error; tx.abort(); } };
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(failure || new Error('Could not read Gospel storage. Existing records were retained.'));
    tx.onerror = () => { failure ||= new Error('Could not read Gospel storage. Existing records were retained.'); };
  });
}
export async function saveGospel(value: GospelState, expectedRevision: number): Promise<GospelState> {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= Number.MAX_SAFE_INTEGER - 1) throw new Error('Invalid Gospel storage revision.');
  const next = validateGospel({ ...value, revision: expectedRevision + 1 }), db = await openDatabase();
  return new Promise((resolve, reject) => {
    let failure: unknown;
    const tx = db.transaction('workspace', 'readwrite'), store = tx.objectStore('workspace'), read = store.get('private');
    read.onsuccess = () => { try {
      const previous = read.result === undefined ? emptyGospel() : validateGospel(read.result);
      if (previous.revision !== expectedRevision) throw new Error('Another tab saved newer Gospel rows. Export your draft, then reload saved rows before saving again.');
      store.put(next, 'private');
    } catch (error) { failure = error; tx.abort(); } };
    tx.oncomplete = () => resolve(next);
    tx.onabort = () => reject(failure || new Error('Gospel changes were not saved. Storage may be full or denied; your draft remains on this screen.'));
    tx.onerror = () => { failure ||= new Error('Gospel changes were not saved. Storage may be full or denied; your draft remains on this screen.'); };
  });
}

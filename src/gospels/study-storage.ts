import { emptyGospelStudy, validateGospelStudy } from './study-model.ts';
import type { GospelStudyState } from './study-model';

let opening: Promise<IDBDatabase> | undefined;
function database(): Promise<IDBDatabase> {
  if (!opening) opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('Private Gospel notebook storage is unavailable in this browser.')); return; }
    let request: IDBOpenDBRequest;
    try { request = indexedDB.open('adigun-aibible-gospel-notebook', 1); }
    catch { reject(new Error('Could not open private Gospel storage. It may be denied; existing records have not been replaced.')); return; }
    let failed = false;
    const fail = (message: string) => { failed = true; reject(new Error(message)); };
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('workspace')) request.result.createObjectStore('workspace'); };
    request.onerror = () => fail('Could not open private Gospel storage. Existing records have not been replaced.');
    request.onblocked = () => fail('Close another Gospel notebook tab, then retry storage.');
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
export async function loadGospelStudy(): Promise<GospelStudyState> {
  const db = await database();
  return new Promise((resolve, reject) => {
    let result: GospelStudyState | undefined, failure: unknown;
    let tx: IDBTransaction, request: IDBRequest;
    try { tx = db.transaction('workspace', 'readonly'); request = tx.objectStore('workspace').get('private'); }
    catch { reject(new Error('Could not read private Gospel storage. Existing records have not been replaced.')); return; }
    request.onsuccess = () => {
      try { result = request.result === undefined ? emptyGospelStudy() : validateGospelStudy(request.result); }
      catch (error) { failure = error; tx.abort(); }
    };
    tx.oncomplete = () => result ? resolve(result) : reject(new Error('Private Gospel storage returned no readable result. Existing records were retained.'));
    tx.onabort = () => reject(failure || new Error('Could not read private Gospel storage. Existing records were retained.'));
    tx.onerror = () => { failure ||= new Error('Could not read private Gospel storage. Existing records were retained.'); };
  });
}
export async function saveGospelStudy(value: GospelStudyState, expectedRevision: number): Promise<GospelStudyState> {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= Number.MAX_SAFE_INTEGER - 1) throw new Error('Invalid Gospel storage revision.');
  const next = { ...validateGospelStudy(value), revision: expectedRevision + 1 }, db = await database();
  return new Promise((resolve, reject) => {
    let failure: unknown, tx: IDBTransaction, store: IDBObjectStore, request: IDBRequest;
    const unsaved = () => new Error('Gospel changes were not saved. Storage may be full or denied; keep your draft and export it.');
    try { tx = db.transaction('workspace', 'readwrite'); store = tx.objectStore('workspace'); request = store.get('private'); }
    catch { reject(unsaved()); return; }
    request.onsuccess = () => {
      try {
        const previous = request.result === undefined ? emptyGospelStudy() : validateGospelStudy(request.result);
        if (previous.revision !== expectedRevision) throw new Error('Another tab saved newer Gospel studies. Export your draft, then reload saved studies before saving again.');
        try { store.put(next, 'private'); } catch { failure = unsaved(); tx.abort(); }
      } catch (error) { failure = error; tx.abort(); }
    };
    tx.oncomplete = () => resolve(next);
    tx.onabort = () => reject(failure || unsaved());
    tx.onerror = () => { failure ||= unsaved(); };
  });
}

import { emptyHistoricalStudy, validateHistoricalStudy } from './model.ts';
import type { HistoricalStudy } from './model';
let opening: Promise<IDBDatabase> | undefined;
function database(): Promise<IDBDatabase> {
  if (!opening) opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('Private historical study storage is unavailable.')); return; }
    const request = indexedDB.open('adigun-aibible-historical-study', 1); let failed = false;
    const fail = (message: string) => { failed = true; reject(new Error(message)); };
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('study')) request.result.createObjectStore('study'); };
    request.onerror = () => fail('Historical study storage could not be opened. Existing records are unchanged.');
    request.onblocked = () => fail('Close another historical study tab and retry.');
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
export async function loadHistoricalStudy(): Promise<HistoricalStudy> {
  const db = await database();
  return new Promise((resolve, reject) => {
    let value: HistoricalStudy; let failure: unknown;
    const transaction = db.transaction('study', 'readonly');
    const request = transaction.objectStore('study').get('private');
    request.onsuccess = () => { try { value = request.result === undefined ? emptyHistoricalStudy() : validateHistoricalStudy(request.result); } catch (error) { failure = error; transaction.abort(); } };
    transaction.oncomplete = () => resolve(value);
    transaction.onabort = () => reject(failure || new Error('Historical study could not be read. Existing records were not replaced.'));
    transaction.onerror = () => { failure ||= new Error('Historical study could not be read.'); };
  });
}
export async function saveHistoricalStudy(value: HistoricalStudy, expectedRevision: number): Promise<HistoricalStudy> {
  const next = validateHistoricalStudy({ ...value, revision: expectedRevision + 1 });
  const db = await database();
  return new Promise((resolve, reject) => {
    let failure: unknown;
    const transaction = db.transaction('study', 'readwrite'); const store = transaction.objectStore('study');
    const request = store.get('private');
    request.onsuccess = () => {
      try {
        const previous = request.result === undefined ? emptyHistoricalStudy() : validateHistoricalStudy(request.result);
        if (previous.revision !== expectedRevision) throw new Error('Another tab saved a newer historical notebook. Reload the saved records before trying again; your draft stays here.');
        store.put(next, 'private');
      } catch (error) { failure = error; transaction.abort(); }
    };
    transaction.oncomplete = () => resolve(next);
    transaction.onabort = () => reject(failure || new Error('Historical study was not saved. Storage may be full or denied; keep your draft and export it.'));
    transaction.onerror = () => { failure ||= new Error('Historical study was not saved. Existing records remain unchanged.'); };
  });
}

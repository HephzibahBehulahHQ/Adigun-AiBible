import { emptyCorrections, validateCorrections } from './model.ts';
import type { SpeakerCorrections } from './model';
const databaseName = 'adigun-aibible-speaker-corrections';
let opening: Promise<IDBDatabase> | undefined;

function openDatabase(): Promise<IDBDatabase> {
  if (!opening) opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('Private device storage is unavailable.')); return; }
    const request = indexedDB.open(databaseName, 1); let failed = false;
    const fail = (message: string) => { failed = true; reject(new Error(message)); };
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('corrections')) request.result.createObjectStore('corrections'); };
    request.onerror = () => fail('Could not open private speaker corrections. Existing proposals have not been replaced.');
    request.onblocked = () => fail('Close another Adigun tab and retry private corrections.');
    request.onsuccess = () => { const db = request.result; if (failed) { db.close(); return; } db.onversionchange = () => { db.close(); opening = undefined; }; db.onclose = () => { opening = undefined; }; resolve(db); };
  }).catch(error => { opening = undefined; throw error; });
  return opening;
}

export async function loadCorrections(): Promise<SpeakerCorrections> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    let state: SpeakerCorrections; let failure: unknown;
    const tx = db.transaction('corrections', 'readonly'), request = tx.objectStore('corrections').get('private');
    request.onsuccess = () => { try { state = request.result === undefined ? emptyCorrections() : validateCorrections(request.result); } catch (error) { failure = error; tx.abort(); } };
    tx.oncomplete = () => resolve(state);
    tx.onabort = () => reject(failure || new Error('Private speaker corrections could not be read.'));
    tx.onerror = () => { failure ||= new Error('Private speaker corrections could not be read.'); };
  });
}

export async function saveCorrections(value: SpeakerCorrections, expectedRevision: number): Promise<SpeakerCorrections> {
  const next = validateCorrections({ ...value, revision: expectedRevision + 1 }), db = await openDatabase();
  return new Promise((resolve, reject) => {
    let failure: unknown;
    const tx = db.transaction('corrections', 'readwrite'), store = tx.objectStore('corrections'), request = store.get('private');
    request.onsuccess = () => {
      try { const previous = request.result === undefined ? emptyCorrections() : validateCorrections(request.result); if (previous.revision !== expectedRevision) throw new Error('Another tab saved newer speaker corrections. Reload them before saving; your unsaved draft is still shown.'); store.put(next, 'private'); }
      catch (error) { failure = error; tx.abort(); }
    };
    tx.oncomplete = () => resolve(next);
    tx.onabort = () => reject(failure || new Error('Speaker corrections were not saved. Storage may be full or denied. Keep your draft open.'));
    tx.onerror = () => { failure ||= new Error('Speaker corrections were not saved. Storage may be full or denied.'); };
  });
}

import { emptyAudioState, validateAudioState } from './model.ts';
import type { AudioState } from './model';

let opening: Promise<IDBDatabase> | undefined;
function database(): Promise<IDBDatabase> {
  if (!opening) opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('Listening storage is unavailable in this browser.')); return; }
    const request = indexedDB.open('adigun-aibible-audio', 1); let failed = false;
    const fail = (message: string) => { failed = true; reject(new Error(message)); };
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('listening')) request.result.createObjectStore('listening'); };
    request.onblocked = () => fail('Close other listening tabs and retry opening storage.');
    request.onerror = () => fail('Could not open listening storage. Existing data has not been replaced.');
    request.onsuccess = () => { const db = request.result; if (failed) { db.close(); return; } db.onversionchange = () => { db.close(); opening = undefined; }; db.onclose = () => { opening = undefined; }; resolve(db); };
  }).catch(error => { opening = undefined; throw error; });
  return opening;
}
export async function loadAudioState(): Promise<AudioState> {
  const db = await database();
  return new Promise((resolve, reject) => {
    let result: AudioState; let failure: unknown;
    const tx = db.transaction('listening', 'readonly'); const read = tx.objectStore('listening').get('private');
    read.onsuccess = () => { try { result = read.result === undefined ? emptyAudioState() : validateAudioState(read.result); } catch (error) { failure = error; tx.abort(); } };
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(failure || new Error('Listening storage could not be read. Existing data has not been replaced.'));
    tx.onerror = () => { failure ||= new Error('Listening storage could not be read.'); };
  });
}
export async function saveAudioState(value: AudioState, expectedRevision: number): Promise<AudioState> {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= Number.MAX_SAFE_INTEGER) throw new Error('Invalid listening revision. Reload saved listening data.');
  const next = validateAudioState({ ...value, revision: expectedRevision + 1 }); const db = await database();
  return new Promise((resolve, reject) => {
    let failure: unknown;
    const tx = db.transaction('listening', 'readwrite'); const store = tx.objectStore('listening'); const read = store.get('private');
    read.onsuccess = () => { try { const previous = read.result === undefined ? emptyAudioState() : validateAudioState(read.result); if (previous.revision !== expectedRevision) throw new Error('Another tab saved newer listening data. Stop playback and reload saved data before changing it.'); store.put(next, 'private'); } catch (error) { failure = error; tx.abort(); } };
    tx.oncomplete = () => resolve(next);
    tx.onabort = () => reject(failure || new Error('Listening changes were not saved. Storage may be full or denied.'));
    tx.onerror = () => { failure ||= new Error('Listening changes were not saved. Storage may be full or denied.'); };
  });
}

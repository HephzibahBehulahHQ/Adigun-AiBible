import { emptyStudy, validateStudy } from './domain';
import type { StudyState } from './types';
let database: Promise<IDBDatabase> | undefined;
function openDatabase() {
  if (!database) database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('adigun-aibible-private-study', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('study');
    request.onsuccess = () => { const db = request.result; db.onversionchange = () => db.close(); resolve(db); };
    request.onerror = () => reject(new Error('Device storage is unavailable. Export your notes before closing.'));
    request.onblocked = () => reject(new Error('Close another open Bible tab and try again.'));
  });
  return database;
}
export async function loadStudy(): Promise<StudyState> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const req = db.transaction('study', 'readonly').objectStore('study').get('personal');
    req.onsuccess = () => { try { resolve(req.result ? validateStudy(req.result) : emptyStudy()); } catch (e) { reject(e); } };
    req.onerror = () => reject(new Error('Could not read saved study data. Existing data has not been replaced.'));
  });
}
export async function saveStudy(state: StudyState): Promise<void> {
  validateStudy(state); const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('study', 'readwrite'); tx.objectStore('study').put(state, 'personal');
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(new Error('Saving failed. Storage may be full. Export a backup now.')); tx.onabort = () => reject(new Error('Saving was interrupted. Export a backup now.'));
  });
}

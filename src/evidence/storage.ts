import { validateSession } from './session.ts';
import type { EvidenceSession } from './session.ts';

let database: Promise<IDBDatabase> | undefined;
function openDatabase(): Promise<IDBDatabase> {
  if (!database) database = new Promise<IDBDatabase>((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('Device storage is unavailable. Export a transcript backup to keep this session.')); return; }
    let failed = false;
    const request = indexedDB.open('adigun-aibible-sermon-evidence', 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('sessions')) request.result.createObjectStore('sessions', { keyPath: 'id' }); };
    request.onsuccess = () => {
      if (failed) { request.result.close(); return; }
      const db = request.result;
      db.onversionchange = () => { db.close(); database = undefined; };
      resolve(db);
    };
    request.onerror = () => { failed = true; reject(new Error('Saved transcripts could not be opened. Existing data has not been replaced.')); };
    request.onblocked = () => { failed = true; reject(new Error('Close other Bible tabs, then retry opening saved transcripts.')); };
  }).catch(error => { database = undefined; throw error; });
  return database;
}

export async function listEvidenceSessions(): Promise<EvidenceSession[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('sessions', 'readonly');
    const request = transaction.objectStore('sessions').getAll();
    transaction.oncomplete = () => {
      try { resolve((request.result as unknown[]).map(validateSession).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))); }
      catch { reject(new Error('A saved transcript failed validation. Existing records were kept; no new session was written.')); }
    };
    transaction.onerror = transaction.onabort = () => reject(new Error('Saved transcripts could not be read. Existing records were kept.'));
  });
}

export async function saveEvidenceSession(session: EvidenceSession): Promise<void> {
  const validated = validateSession(session), db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('sessions', 'readwrite');
    transaction.objectStore('sessions').put(validated);
    transaction.oncomplete = () => resolve();
    transaction.onerror = transaction.onabort = () => reject(new Error('The transcript was not saved. Storage may be unavailable or full. Export a backup before leaving.'));
  });
}

export async function deleteEvidenceSession(id: string): Promise<void> {
  if (!/^[A-Za-z0-9-]{1,80}$/.test(id)) throw new Error('Invalid session identity.');
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('sessions', 'readwrite');
    transaction.objectStore('sessions').delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = transaction.onabort = () => reject(new Error('The saved transcript could not be deleted. No deletion success is claimed.'));
  });
}

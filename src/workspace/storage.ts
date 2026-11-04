import { emptyWorkspace, validateWorkspace } from './model.ts';
import type { WorkspaceState } from './model';
const databaseName = 'adigun-aibible-workspace';
let opening: Promise<IDBDatabase> | undefined;
export class WorkspaceConflictError extends Error { constructor() { super('Another tab saved a newer workspace. Reload the workspace before saving again; your current draft is still shown.'); this.name = 'WorkspaceConflictError'; } }
function openDatabase() {
  if (!opening) {
    opening = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('Private device storage is unavailable in this browser.')); return; }
      const request = indexedDB.open(databaseName, 1); let rejected = false;
      const fail = (message: string) => { rejected = true; reject(new Error(message)); };
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('workspace')) request.result.createObjectStore('workspace'); };
      request.onerror = () => fail('Could not open private workspace storage. Existing records have not been replaced.');
      request.onblocked = () => fail('Close another Adigun workspace tab, then retry storage.');
      request.onsuccess = () => { const db = request.result; if (rejected) { db.close(); return; } db.onversionchange = () => { db.close(); opening = undefined; }; db.onclose = () => { opening = undefined; }; resolve(db); };
    }).catch(error => { opening = undefined; throw error; });
  }
  return opening;
}
export async function loadWorkspace(): Promise<WorkspaceState> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    let state: WorkspaceState; let failure: unknown;
    const tx = db.transaction('workspace', 'readonly'); const request = tx.objectStore('workspace').get('personal');
    request.onsuccess = () => { try { state = request.result === undefined ? emptyWorkspace() : validateWorkspace(request.result); } catch (error) { failure = error; tx.abort(); } };
    tx.oncomplete = () => resolve(state);
    tx.onabort = () => reject(failure || new Error('Could not read your workspace. Existing records have not been replaced.'));
    tx.onerror = () => { failure ||= new Error('Could not read your workspace. Existing records have not been replaced.'); };
  });
}
/** The read and revision-checked write are one transaction; two tabs cannot silently overwrite each other. */
export async function saveWorkspace(value: WorkspaceState, expectedRevision: number): Promise<WorkspaceState> {
  const next = validateWorkspace({ ...value, revision: expectedRevision + 1 }); const db = await openDatabase();
  return new Promise((resolve, reject) => {
    let failure: unknown;
    const tx = db.transaction('workspace', 'readwrite'); const store = tx.objectStore('workspace'); const read = store.get('personal');
    read.onsuccess = () => { try { const previous = read.result === undefined ? emptyWorkspace() : validateWorkspace(read.result); if (previous.revision !== expectedRevision) throw new WorkspaceConflictError(); store.put(next, 'personal'); } catch (error) { failure = error; tx.abort(); } };
    tx.oncomplete = () => resolve(next);
    tx.onabort = () => reject(failure || new Error('Workspace was not saved. Storage may be full or denied. Keep this tab open and export your existing records.'));
    tx.onerror = () => { failure ||= new Error('Workspace was not saved. Storage may be full or denied. Keep this tab open and export your existing records.'); };
  });
}

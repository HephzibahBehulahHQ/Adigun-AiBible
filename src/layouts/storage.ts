import { emptyLayouts, validateLayouts } from './model.ts';
import type { WorkspaceLayouts } from './model';

export class LayoutConflictError extends Error {
  constructor() { super('Another window saved newer layouts. Reload layouts before making more changes. Your current name draft is still shown.'); this.name = 'LayoutConflictError'; }
}
export class LayoutCancelledError extends Error {
  constructor() { super('The layout action was cancelled before it finished.'); this.name = 'LayoutCancelledError'; }
}
export class DamagedLayoutsError extends Error {
  readonly backup: string | null;
  constructor(raw: unknown) {
    super('Saved layouts are damaged or use an unsupported version. They have not been replaced. Download the saved data before choosing whether to reset layouts.');
    this.name = 'DamagedLayoutsError';
    try { this.backup = JSON.stringify({ kind: 'adigun-damaged-layouts', version: 1, raw }, null, 2); }
    catch { this.backup = null; }
  }
}
export interface LayoutGuard { signal?: AbortSignal; isCurrent?: () => boolean }
function assertCurrent(guard: LayoutGuard) {
  if (guard.signal?.aborted || guard.isCurrent && !guard.isCurrent()) throw new LayoutCancelledError();
}
let opening: Promise<IDBDatabase> | undefined;
function database(): Promise<IDBDatabase> {
  if (!opening) opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('Workspace layout storage is unavailable in this browser.')); return; }
    const request = indexedDB.open('adigun-aibible-layouts', 1);
    let failed = false;
    const fail = (message: string) => { failed = true; reject(new Error(message)); };
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('layouts')) request.result.createObjectStore('layouts'); };
    request.onerror = () => fail('Workspace layout storage could not be opened. Existing layouts have not been replaced.');
    request.onblocked = () => fail('Close other layout windows, then reload layouts.');
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
function storedLayouts(raw: unknown): WorkspaceLayouts {
  if (raw === undefined) return emptyLayouts();
  try { return validateLayouts(raw); } catch { throw new DamagedLayoutsError(raw); }
}
export async function loadLayouts(): Promise<WorkspaceLayouts> {
  const db = await database();
  return new Promise((resolve, reject) => {
    let result: WorkspaceLayouts, failure: unknown;
    const tx = db.transaction('layouts', 'readonly'), read = tx.objectStore('layouts').get('private');
    read.onsuccess = () => { try { result = storedLayouts(read.result); } catch (error) { failure = error; tx.abort(); } };
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(failure || new Error('Saved layouts could not be read. Existing data has not been replaced.'));
    tx.onerror = () => { failure ||= new Error('Saved layouts could not be read.'); };
  });
}
async function writeLayouts(next: WorkspaceLayouts, inspect: (raw: unknown) => void, guard: LayoutGuard): Promise<WorkspaceLayouts> {
  assertCurrent(guard);
  const db = await database();
  assertCurrent(guard);
  return new Promise((resolve, reject) => {
    let failure: unknown;
    const tx = db.transaction('layouts', 'readwrite'), store = tx.objectStore('layouts'), read = store.get('private');
    const cancel = () => { failure = new LayoutCancelledError(); try { tx.abort(); } catch { /* A completed transaction cannot be reopened. */ } };
    guard.signal?.addEventListener('abort', cancel, { once: true });
    const cleanup = () => guard.signal?.removeEventListener('abort', cancel);
    read.onsuccess = () => {
      try { assertCurrent(guard); inspect(read.result); store.put(next, 'private'); }
      catch (error) { failure = error; tx.abort(); }
    };
    tx.oncomplete = () => { cleanup(); resolve(next); };
    tx.onabort = () => { cleanup(); reject(failure || new Error('Layouts were not saved. Storage may be full or denied.')); };
    tx.onerror = () => { failure ||= new Error('Layouts were not saved. Storage may be full or denied.'); };
  });
}
/** Compare and write in one transaction, so stale windows never erase a newer layout. */
export async function saveLayouts(value: WorkspaceLayouts, expectedRevision: number, guard: LayoutGuard = {}): Promise<WorkspaceLayouts> {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= Number.MAX_SAFE_INTEGER - 2) throw new Error('Layout revision is invalid.');
  const next = validateLayouts({ ...value, revision: expectedRevision + 1 });
  return writeLayouts(next, raw => {
    if (storedLayouts(raw).revision !== expectedRevision) throw new LayoutConflictError();
  }, guard);
}
/** Deliberate recovery only. A concurrent repair or changed damaged record is preserved. */
export async function resetDamagedLayouts(expectedBackup: string | null, guard: LayoutGuard = {}): Promise<WorkspaceLayouts> {
  if (expectedBackup === null) throw new Error('The damaged record could not be compared safely. Reload layouts before resetting.');
  return writeLayouts({ ...emptyLayouts(), revision: Date.now() }, raw => {
    let damaged: DamagedLayoutsError | undefined;
    try { storedLayouts(raw); } catch (error) { if (error instanceof DamagedLayoutsError) damaged = error; else throw error; }
    if (!damaged) throw new Error('Another window repaired these layouts. Reload layouts before making changes.');
    if (damaged.backup !== expectedBackup) throw new Error('The damaged layouts changed in another window. Reload them before resetting.');
  }, guard);
}

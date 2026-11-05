import { emptyWorkspace, validateWorkspace, workspaceRecordings } from './model.ts';
import type { WorkspaceState } from './model';
import { checkWorkspaceMedia, verifyWorkspaceSnapshot } from './retelling-inventory.ts';
import type { WorkspaceSnapshot } from './retelling-inventory';
import { MAX_WORKSPACE_AUDIO_BYTES, sameRecording, verifyRetellingMedia } from './retelling-media.ts';
import type { RetellingMedia, RetellingRecording } from './retelling-media';

const databaseName = 'adigun-aibible-workspace';
const audioStore = 'retelling-audio';
let opening: Promise<IDBDatabase> | undefined;
export class WorkspaceConflictError extends Error {
  constructor() { super('Another tab saved a newer workspace. Reload the workspace before saving again; your current draft is still shown.'); this.name = 'WorkspaceConflictError'; }
}
function openDatabase() {
  if (!opening) {
    opening = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('Private device storage is unavailable in this browser.')); return; }
      const request = indexedDB.open(databaseName, 2); let rejected = false;
      const fail = (message: string) => { rejected = true; reject(new Error(message)); };
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('workspace')) db.createObjectStore('workspace');
        if (!db.objectStoreNames.contains(audioStore)) db.createObjectStore(audioStore);
      };
      request.onerror = () => fail('Could not open private workspace storage. Existing records have not been replaced.');
      request.onblocked = () => fail('Close another Adigun workspace tab, then retry storage.');
      request.onsuccess = () => {
        const db = request.result; if (rejected) { db.close(); return; }
        db.onversionchange = () => { db.close(); opening = undefined; };
        db.onclose = () => { opening = undefined; };
        resolve(db);
      };
    }).catch(error => { opening = undefined; throw error; });
  }
  return opening;
}
/** Metadata and original bytes come from the same readonly transaction/revision. */
export async function readWorkspaceSnapshot(): Promise<WorkspaceSnapshot> {
  const db = await openDatabase();
  const snapshot = await new Promise<WorkspaceSnapshot>((resolve, reject) => {
    let state: WorkspaceState; let media: RetellingMedia[]; let failure: unknown;
    const tx = db.transaction(['workspace', audioStore], 'readonly');
    const read = tx.objectStore('workspace').get('personal');
    const audio = tx.objectStore(audioStore).getAll();
    read.onsuccess = () => { try { state = read.result === undefined ? emptyWorkspace() : validateWorkspace(read.result); } catch (error) { failure = error; tx.abort(); } };
    audio.onsuccess = () => { media = audio.result; };
    tx.oncomplete = () => resolve({ state, media });
    tx.onabort = () => reject(failure || new Error('Could not read your workspace. Existing records have not been replaced.'));
    tx.onerror = () => { failure ||= new Error('Could not read your workspace. Existing records have not been replaced.'); };
  });
  return verifyWorkspaceSnapshot(snapshot);
}
export async function loadWorkspace(): Promise<WorkspaceState> { return (await readWorkspaceSnapshot()).state; }
export async function loadRetellingMedia(recording: RetellingRecording): Promise<RetellingMedia> {
  const db = await openDatabase();
  const value = await new Promise<unknown>((resolve, reject) => {
    const tx = db.transaction(audioStore, 'readonly'); const read = tx.objectStore(audioStore).get(recording.id);
    tx.oncomplete = () => resolve(read.result);
    tx.onabort = tx.onerror = () => reject(new Error('Could not read the original recording. Your saved record was retained.'));
  });
  const file = await verifyRetellingMedia(value);
  if (!sameRecording(recording, file.recording)) throw new Error('This recording changed in another tab. Reload the workspace before playing it.');
  return file;
}
export interface WorkspaceSave { state: WorkspaceState; previous: WorkspaceState; removedMedia: RetellingMedia[] }
/** Every private change uses one revision-checked write transaction for metadata AND media. */
export async function saveWorkspaceWithMedia(value: WorkspaceState, expectedRevision: number, additions: RetellingMedia[] = []): Promise<WorkspaceSave> {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error('Invalid expected workspace revision.');
  const next = validateWorkspace({ ...value, revision:expectedRevision + 1 });
  if (!Array.isArray(additions) || additions.length > 5000 || additions.reduce((sum, file) => sum + (file?.blob?.size || 0), 0) > MAX_WORKSPACE_AUDIO_BYTES) throw new Error('Incoming recordings exceed the 32 MiB workspace limit.');
  const incoming = new Map<string, RetellingMedia>();
  for (const value of additions) {
    const file = await verifyRetellingMedia(value);
    if (incoming.has(file.recording.id)) throw new Error('Duplicate incoming recording ID.');
    incoming.set(file.recording.id, file);
  }
  // Hash all originals before the write transaction. Never await crypto inside an IDB transaction.
  const previous = await readWorkspaceSnapshot();
  if (previous.state.revision !== expectedRevision) throw new WorkspaceConflictError();
  const existing = new Map(previous.media.map(file => [file.recording.id, file]));
  const references = workspaceRecordings(next);
  for (const [id, file] of incoming) if (!references.some(ref => ref.id === id && sameRecording(ref, file.recording))) throw new Error('An incoming recording is not referenced by the selected workspace records.');
  const selected = references.map(ref => incoming.get(ref.id) || existing.get(ref.id)).filter((file): file is RetellingMedia => !!file);
  checkWorkspaceMedia(next, selected);
  const removedMedia = previous.media.filter(file => !references.some(ref => sameRecording(ref, file.recording)));
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    let failure: unknown;
    const tx = db.transaction(['workspace', audioStore], 'readwrite');
    const store = tx.objectStore('workspace'); const audio = tx.objectStore(audioStore); const read = store.get('personal');
    read.onsuccess = () => {
      try {
        const stored = read.result === undefined ? emptyWorkspace() : validateWorkspace(read.result);
        if (stored.revision !== expectedRevision) throw new WorkspaceConflictError();
        for (const file of removedMedia) audio.delete(file.recording.id);
        for (const file of incoming.values()) audio.put(file, file.recording.id);
        store.put(next, 'personal');
      } catch (error) { failure = error; tx.abort(); }
    };
    tx.oncomplete = () => resolve({ state:next, previous:previous.state, removedMedia });
    tx.onabort = () => reject(failure || new Error('Workspace was not saved. Storage may be full or denied. Your writing and unsaved recording remain in the form.'));
    tx.onerror = () => { failure ||= new Error('Workspace was not saved. Storage may be full or denied. Your writing and unsaved recording remain in the form.'); };
  });
}
export async function saveWorkspace(value: WorkspaceState, expectedRevision: number): Promise<WorkspaceState> { return (await saveWorkspaceWithMedia(value, expectedRevision)).state; }

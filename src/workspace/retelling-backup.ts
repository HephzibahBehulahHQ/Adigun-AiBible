import { MAX_BACKUP_BYTES, validateWorkspace, workspaceRecordings } from './model.ts';
import { verifyWorkspaceSnapshot } from './retelling-inventory.ts';
import type { WorkspaceSnapshot } from './retelling-inventory';
import { MAX_AUDIO_BACKUP_BYTES, sameRecording, verifyRetellingMedia } from './retelling-media.ts';
import type { RetellingMedia } from './retelling-media';
import type { WorkspaceState } from './model';

const format = 'adigun-aibible-workspace';
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }

export async function completeWorkspaceBackup(snapshot: WorkspaceSnapshot, now = new Date()): Promise<Blob> {
  const verified = await verifyWorkspaceSnapshot(snapshot);
  const parts: BlobPart[] = [`{"format":"${format}","schemaVersion":2,"exportedAt":${JSON.stringify(now.toISOString())},"state":`, JSON.stringify(verified.state), ',"media":['];
  for (const [index, file] of verified.media.entries()) {
    parts.push(`${index ? ',' : ''}{"id":${JSON.stringify(file.recording.id)},"dataBase64":"`);
    for (let offset = 0; offset < file.blob.size; offset += 49152) {
      const bytes = new Uint8Array(await file.blob.slice(offset, offset + 49152).arrayBuffer());
      let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
      parts.push(btoa(binary));
    }
    parts.push('"}');
  }
  parts.push(']}');
  const result = new Blob(parts, { type:'application/json' });
  if (result.size > MAX_AUDIO_BACKUP_BYTES) throw new Error('The complete workspace backup exceeds 64 MiB.');
  return result;
}

export async function readCompleteWorkspaceBackup(file: Blob): Promise<WorkspaceSnapshot> {
  if (!(file instanceof Blob) || file.size < 1 || file.size > MAX_AUDIO_BACKUP_BYTES) throw new Error('Complete workspace backups must be between 1 byte and 64 MiB.');
  let raw: unknown; try { raw = JSON.parse(await file.text()); } catch { throw new Error('This file is not valid JSON.'); }
  if (!object(raw) || raw.format !== format || (raw.schemaVersion !== 1 && raw.schemaVersion !== 2)) throw new Error('Choose an Adigun personal-workspace backup. The reader backup is imported in Saved study.');
  if (raw.schemaVersion === 1 && (file.size > MAX_BACKUP_BYTES || (raw.media !== undefined && (!Array.isArray(raw.media) || raw.media.length > 0)))) throw new Error('Legacy workspace backups must be text-only and no larger than 12 MiB.');
  if (!object(raw.state) || raw.state.schemaVersion !== raw.schemaVersion) throw new Error('The workspace and backup schema versions do not agree.');
  const state = validateWorkspace(raw.state);
  const entries = raw.schemaVersion === 1 ? [] : raw.media;
  const references = new Map(workspaceRecordings(state).map(item => [item.id, item]));
  if (!Array.isArray(entries) || entries.length !== references.size || entries.length > 5000) throw new Error('The backup must contain exactly one original for every recording reference.');
  const seen = new Set<string>(); const media: RetellingMedia[] = [];
  for (const entry of entries) {
    if (!object(entry) || typeof entry.id !== 'string' || seen.has(entry.id)) throw new Error('The backup contains an invalid or duplicate recording ID.');
    const recording = references.get(entry.id);
    if (!recording || typeof entry.dataBase64 !== 'string' || entry.dataBase64.length !== Math.ceil(recording.bytes / 3) * 4) throw new Error('The recording bytes do not match the backup inventory.');
    const encoded = entry.dataBase64;
    const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
    if (/[^A-Za-z0-9+/]/.test(encoded.slice(0, encoded.length - padding))) throw new Error('The recording encoding is invalid.');
    let binary: string;
    try { binary = atob(encoded); } catch { throw new Error('The recording encoding is invalid.'); }
    if (binary.length !== recording.bytes || btoa(binary) !== encoded) throw new Error('The recording byte length or encoding is invalid.');
    const bytes = new Uint8Array(binary.length); for (let i = 0; i < bytes.length; i++) bytes[i] = binary.charCodeAt(i);
    media.push(await verifyRetellingMedia({ recording, blob:new Blob([bytes], { type:recording.mimeType }) }));
    seen.add(entry.id);
  }
  return { state, media };
}

/** Only bytes belonging to records chosen by the existing conflict policy may be imported. */
export function selectedImportedMedia(state: WorkspaceState, media: RetellingMedia[]): RetellingMedia[] {
  const needed = new Map(workspaceRecordings(state).map(recording => [recording.id, recording]));
  return media.filter(file => { const ref = needed.get(file.recording.id); return !!ref && sameRecording(ref, file.recording); });
}

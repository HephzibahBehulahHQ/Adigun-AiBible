import { familyFingerprint, familyItemMetadata, MAX_FAMILY_BACKUP_BYTES, MAX_FAMILY_FILE_BYTES, MAX_FAMILY_ITEMS, validateFamilyState, verifyFamilyState } from './model.ts';
import type { FamilyItem, FamilyState } from './model';

export interface FamilyImportPreview { items: FamilyItem[]; added: number; identical: number; conflicts: number; fileBytes: number }
export type FamilyConflictPolicy = 'keep-device' | 'use-import';
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

async function base64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const segments: string[] = [];
  // A multiple of three avoids padding in intermediate chunks.
  for (let i = 0; i < bytes.length; i += 49152) segments.push(btoa(String.fromCharCode(...bytes.subarray(i, i + 49152))));
  return segments.join('');
}

export async function familyBackup(value: FamilyState, now = new Date()): Promise<Blob> {
  const state = await verifyFamilyState(value);
  const parts: BlobPart[] = [`{"format":"adigun-aibible-family","schemaVersion":1,"exportedAt":${JSON.stringify(now.toISOString())},"items":[`];
  for (let i = 0; i < state.items.length; i++) {
    const item = state.items[i];
    const meta = familyItemMetadata(item);
    if (i) parts.push(',');
    parts.push(JSON.stringify({ ...meta, ...(item.attachment ? { attachment: { ...meta.attachment, dataBase64: await base64(item.attachment.blob) } } : {}) }));
  }
  parts.push(']}');
  const result = new Blob(parts, { type: 'application/json' });
  if (result.size > MAX_FAMILY_BACKUP_BYTES) throw new Error('This family backup exceeds the 128 MiB limit. Export smaller selections of items.');
  return result;
}

export function summarizeFamilyImport(current: FamilyState, items: FamilyItem[]): FamilyImportPreview {
  const incoming = validateFamilyState({ schemaVersion: 1, revision: 0, items }).items;
  const byId = new Map(current.items.map(item => [item.id, item]));
  let added = 0, identical = 0, conflicts = 0;
  for (const item of incoming) {
    const existing = byId.get(item.id);
    if (!existing) added++;
    else if (familyFingerprint(existing) === familyFingerprint(item)) identical++;
    else conflicts++;
  }
  return { items: incoming, added, identical, conflicts, fileBytes: incoming.reduce((n, item) => n + (item.attachment?.size || 0), 0) };
}

export async function previewFamilyBackup(current: FamilyState, file: Blob): Promise<FamilyImportPreview> {
  if (!file.size || file.size > MAX_FAMILY_BACKUP_BYTES) throw new Error('Choose a family archive JSON backup no larger than 128 MiB.');
  let raw: unknown;
  try { raw = JSON.parse(await file.text()); } catch { throw new Error('This file is not valid JSON. Your saved archive is unchanged.'); }
  if (!isObject(raw) || raw.format !== 'adigun-aibible-family' || raw.schemaVersion !== 1 || !Array.isArray(raw.items) || raw.items.length > MAX_FAMILY_ITEMS) throw new Error('Choose an Adigun Family Legacy backup. Other app backups cannot replace this archive.');
  const items: unknown[] = [];
  for (const entry of raw.items) {
    if (!isObject(entry)) throw new Error('A family archive record is invalid.');
    if (entry.attachment === undefined) { items.push(entry); continue; }
    const media = entry.attachment;
    if (!isObject(media) || typeof media.dataBase64 !== 'string' || !Number.isSafeInteger(media.size) || Number(media.size) < 1 || Number(media.size) > MAX_FAMILY_FILE_BYTES || media.dataBase64.length !== Math.ceil(Number(media.size) / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(media.dataBase64) || typeof media.type !== 'string') throw new Error('An original file in this backup has invalid size or encoding.');
    let binary: string;
    try { binary = atob(media.dataBase64); } catch { throw new Error('An original file in this backup is not valid base64.'); }
    if (binary.length !== media.size) throw new Error('An original file in this backup has an incorrect byte count.');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: media.type });
    items.push({ ...entry, attachment: { ...media, blob } });
  }
  const verified = await verifyFamilyState({ schemaVersion: 1, revision: 0, items });
  return summarizeFamilyImport(current, verified.items);
}

export function mergeFamilyArchive(current: FamilyState, items: FamilyItem[], policy: FamilyConflictPolicy): FamilyState {
  if (!['keep-device', 'use-import'].includes(policy)) throw new Error('Choose how to handle conflicting family records.');
  const next = new Map(validateFamilyState(current).items.map(item => [item.id, item]));
  const incoming = validateFamilyState({ schemaVersion: 1, revision: 0, items }).items;
  for (const item of incoming) if (!next.has(item.id) || policy === 'use-import') next.set(item.id, item);
  return validateFamilyState({ ...current, items: [...next.values()] });
}

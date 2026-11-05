import { isReference } from '../domain.ts';
import type { Reference } from '../types';

export const MAX_RETELLING_AUDIO_BYTES = 8 * 1024 * 1024;
export const MAX_WORKSPACE_AUDIO_BYTES = 32 * 1024 * 1024;
export const MAX_RETELLING_CAPTURE_MS = 5 * 60 * 1000;
export const MAX_AUDIO_BACKUP_BYTES = 64 * 1024 * 1024;
export interface RetellingSource { ref: Reference; editionSha256: string }
export interface RetellingRecording {
  id: string; name: string; mimeType: string; bytes: number; sha256: string;
  /** Elapsed capture time, not a decoded-media duration assertion. */
  captureMs: number; source: RetellingSource;
}
export interface RetellingMedia { recording: RetellingRecording; blob: Blob }
export type RetellingDraft = Omit<RetellingRecording, 'id'> & { blob: Blob };

const hashPattern = /^[a-f0-9]{64}$/;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,149}$/;
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
export function recordingExtension(mime: string): string | null {
  if (!/^audio\/(webm|ogg|mp4)(?:;\s*codecs="?[a-z0-9][a-z0-9.,_-]*"?)?$/.test(mime)) return null;
  return mime.startsWith('audio/mp4') ? 'm4a' : mime.startsWith('audio/ogg') ? 'ogg' : 'webm';
}
export function validateRetellingSource(value: unknown): RetellingSource {
  if (!object(value) || !isReference(value.ref) || !value.ref.editionId || typeof value.editionSha256 !== 'string' || !hashPattern.test(value.editionSha256)) throw new Error('The recording needs its exact source reference, edition and source revision.');
  const r = value.ref;
  return { ref: { bookId:r.bookId, chapter:r.chapter, verse:r.verse, ...(r.endVerse !== undefined ? { endVerse:r.endVerse } : {}), editionId:r.editionId }, editionSha256:value.editionSha256 };
}
export function validateRetellingRecording(value: unknown): RetellingRecording {
  if (!object(value) || typeof value.id !== 'string' || !idPattern.test(value.id)) throw new Error('Invalid retelling recording ID.');
  if (typeof value.mimeType !== 'string' || !recordingExtension(value.mimeType) || typeof value.name !== 'string' || !value.name || value.name.length > 240 || /[\u0000-\u001f/\\]/.test(value.name) || !value.name.endsWith(`.${recordingExtension(value.mimeType)}`)) throw new Error('The recording filename and actual audio format do not agree.');
  if (!Number.isSafeInteger(value.bytes) || Number(value.bytes) < 1 || Number(value.bytes) > MAX_RETELLING_AUDIO_BYTES) throw new Error('Each original recording must contain between 1 byte and 8 MiB.');
  if (typeof value.sha256 !== 'string' || !hashPattern.test(value.sha256)) throw new Error('The recording integrity hash is invalid.');
  if (!Number.isSafeInteger(value.captureMs) || Number(value.captureMs) < 0 || Number(value.captureMs) > MAX_RETELLING_CAPTURE_MS) throw new Error('Recording capture time must be at most five minutes.');
  return { id:value.id, name:value.name, mimeType:value.mimeType, bytes:Number(value.bytes), sha256:value.sha256, captureMs:Number(value.captureMs), source:validateRetellingSource(value.source) };
}
export async function recordingHash(blob: Blob): Promise<string> {
  if (!(blob instanceof Blob) || !blob.size || blob.size > MAX_RETELLING_AUDIO_BYTES) throw new Error('The original recording is empty or exceeds 8 MiB.');
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), b => b.toString(16).padStart(2, '0')).join('');
}
async function verifySignature(blob: Blob) {
  const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  const ascii = new TextDecoder().decode(head);
  const extension = recordingExtension(blob.type);
  const matches = extension === 'webm' ? [0x1a,0x45,0xdf,0xa3].every((b,i) => head[i] === b)
    : extension === 'ogg' ? ascii.startsWith('OggS') : extension === 'm4a' ? ascii.slice(4,8) === 'ftyp' : false;
  if (!matches) throw new Error('The original bytes do not match the supported recording format.');
}
export async function verifyRetellingMedia(value: unknown): Promise<RetellingMedia> {
  if (!object(value)) throw new Error('The original recording is unavailable.');
  const recording = validateRetellingRecording(value.recording);
  const blob = value.blob;
  if (!(blob instanceof Blob) || blob.size !== recording.bytes || blob.type !== recording.mimeType) throw new Error('The original recording size or MIME does not match its metadata.');
  await verifySignature(blob);
  if (await recordingHash(blob) !== recording.sha256) throw new Error('The original recording failed its integrity check. Existing data was not replaced.');
  return { recording, blob };
}
export async function prepareRetellingDraft(blob: Blob, captureMs: number, source: RetellingSource, now = new Date()): Promise<RetellingDraft> {
  const extension = recordingExtension(blob.type);
  if (!extension) throw new Error('This browser produced an unsupported recording format.');
  const value = { recording: { id:'draft', name:`retelling-${now.toISOString().replace(/[:.]/g, '-')}.${extension}`, mimeType:blob.type, bytes:blob.size, sha256:await recordingHash(blob), captureMs, source }, blob };
  const verified = await verifyRetellingMedia(value);
  const { id: _id, ...metadata } = verified.recording;
  void _id;
  return { ...metadata, blob };
}
export function sameRecording(a: RetellingRecording, b: RetellingRecording) { return JSON.stringify(a) === JSON.stringify(b); }

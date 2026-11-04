import { isReference } from '../domain.ts';
import type { Reference } from '../types';

export const MAX_FAMILY_FILE_BYTES = 32 * 1024 * 1024;
export const MAX_FAMILY_BACKUP_BYTES = 128 * 1024 * 1024;
export const MAX_FAMILY_TEXT = 200_000;
export const MAX_FAMILY_ITEMS = 1000;
export type FamilyCategory = 'memory' | 'testimony' | 'explanation' | 'family_record';
export type FamilyMediaKind = 'audio' | 'photo' | 'document';
export interface FamilyAttachment {
  name: string;
  type: string;
  size: number;
  sha256: string;
  kind: FamilyMediaKind;
  origin: 'upload' | 'microphone';
  blob: Blob;
}
export interface FamilyPassage { reference: Reference; label: string; sourceSha256?: string }
export interface FamilyItem {
  schemaVersion: 1;
  id: string;
  title: string;
  person: string;
  occurredOn: string | null;
  category: FamilyCategory;
  collection: string;
  topics: string[];
  body: string;
  transcript: string;
  captionsVtt: string;
  passages: FamilyPassage[];
  consent: { basis: 'own_work' | 'permission'; grantedBy: string; confirmedAt: string; note: string };
  stewardNote: string;
  visibility: 'private' | 'hidden';
  createdAt: string;
  updatedAt: string;
  attachment?: FamilyAttachment;
}
export interface CaptionCue { start: number; end: number; text: string }
export interface FamilyFilter { query?: string; person?: string; collection?: string; from?: string; to?: string; showHidden?: boolean }
export interface FamilyState { schemaVersion: 1; revision: number; items: FamilyItem[] }
export const emptyFamilyArchive = (): FamilyState => ({ schemaVersion: 1, revision: 0, items: [] });

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const smallText = (value: unknown, max: number, required = false): value is string => typeof value === 'string' && value.length <= max && (!required || !!value.trim());
const validInstant = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 19) === value.slice(0, 19);
export const validFamilyDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d\d-\d\d$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
export const familyCategories: FamilyCategory[] = ['memory', 'testimony', 'explanation', 'family_record'];

export async function familyHash(blob: Blob): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function validateFamilyItem(value: unknown): FamilyItem {
  if (!object(value) || value.schemaVersion !== 1 || typeof value.id !== 'string' || !/^[A-Za-z0-9-]{1,80}$/.test(value.id)) throw new Error('Invalid family archive record.');
  for (const key of ['title', 'person']) if (!smallText(value[key], 200, true)) throw new Error('Add a title and the named speaker, author or family member.');
  if (!familyCategories.includes(value.category as FamilyCategory) || !smallText(value.collection, 120) || !Array.isArray(value.topics) || value.topics.length > 30 || value.topics.some(topic => !smallText(topic, 80, true))) throw new Error('Invalid family category, collection or topics.');
  if (value.occurredOn !== null && !validFamilyDate(value.occurredOn)) throw new Error('Use a valid recording or event date, or leave it unknown.');
  if (!smallText(value.body, MAX_FAMILY_TEXT) || !smallText(value.transcript, MAX_FAMILY_TEXT) || !smallText(value.captionsVtt, MAX_FAMILY_TEXT) || !smallText(value.stewardNote, 4000)) throw new Error('The writing, transcript, captions or recovery note is too long.');
  if (value.captionsVtt) parseCaptions(value.captionsVtt);
  if (!Array.isArray(value.passages) || value.passages.length > 30 || value.passages.some(link => !object(link) || !isReference(link.reference) || !link.reference.editionId || !smallText(link.label, 250, true) || (link.sourceSha256 !== undefined && (typeof link.sourceSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(link.sourceSha256))))) throw new Error('A family passage link is invalid or has no named edition.');
  if (!object(value.consent) || !['own_work', 'permission'].includes(String(value.consent.basis)) || !smallText(value.consent.grantedBy, 200, true) || !validInstant(value.consent.confirmedAt) || !smallText(value.consent.note, 4000)) throw new Error('Record who authorized this item before saving it.');
  if (!['private', 'hidden'].includes(String(value.visibility)) || !validInstant(value.createdAt) || !validInstant(value.updatedAt) || Date.parse(value.updatedAt) < Date.parse(value.createdAt)) throw new Error('Invalid privacy or date metadata.');
  let attachment: FamilyAttachment | undefined;
  if (value.attachment !== undefined) {
    const file = value.attachment;
    if (!object(file) || !smallText(file.name, 240, true) || /[\u0000-\u001f/\\]/.test(file.name) || !smallText(file.type, 150, true) || !['audio', 'photo', 'document'].includes(String(file.kind)) || !['upload', 'microphone'].includes(String(file.origin)) || !Number.isInteger(file.size) || Number(file.size) < 1 || Number(file.size) > MAX_FAMILY_FILE_BYTES || typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256) || !(file.blob instanceof Blob) || file.blob.size !== file.size || file.blob.type !== file.type) throw new Error('The original family file or its integrity metadata is invalid.');
    attachment = { name: file.name, type: file.type, size: Number(file.size), sha256: file.sha256, kind: file.kind as FamilyMediaKind, origin: file.origin as FamilyAttachment['origin'], blob: file.blob };
  }
  if (!attachment && !(value.body as string).trim() && !(value.transcript as string).trim()) throw new Error('Add writing, a transcript or an original file before saving this item.');
  return { schemaVersion: 1, id: value.id, title: value.title as string, person: value.person as string, occurredOn: value.occurredOn as string | null, category: value.category as FamilyCategory, collection: value.collection as string, topics: [...new Set(value.topics as string[])], body: value.body as string, transcript: value.transcript as string, captionsVtt: value.captionsVtt as string, passages: (value.passages as FamilyPassage[]).map(link => ({ reference: { bookId: link.reference.bookId, chapter: link.reference.chapter, verse: link.reference.verse, ...(link.reference.endVerse === undefined ? {} : { endVerse: link.reference.endVerse }), editionId: link.reference.editionId }, label: link.label, ...(link.sourceSha256 ? { sourceSha256: link.sourceSha256 } : {}) })), consent: { basis: value.consent.basis as FamilyItem['consent']['basis'], grantedBy: value.consent.grantedBy, confirmedAt: value.consent.confirmedAt, note: value.consent.note }, stewardNote: value.stewardNote as string, visibility: value.visibility as FamilyItem['visibility'], createdAt: value.createdAt, updatedAt: value.updatedAt, ...(attachment ? { attachment } : {}) };
}

export function familyItemMetadata(item: FamilyItem) {
  const { attachment, ...metadata } = item;
  return { ...metadata, ...(attachment ? { attachment: { name: attachment.name, type: attachment.type, size: attachment.size, sha256: attachment.sha256, kind: attachment.kind, origin: attachment.origin } } : {}) };
}

export function familyFingerprint(item: FamilyItem): string { return JSON.stringify(familyItemMetadata(validateFamilyItem(item))); }

/** Exact UTF-8 size of the canonical JSON export, including base64 expansion. */
export function familyBackupSize(items: FamilyItem[]): number {
  const shell = { format: 'adigun-aibible-family', schemaVersion: 1, exportedAt: '2000-01-01T00:00:00.000Z', items: items.map(item => { const meta = familyItemMetadata(item); return { ...meta, ...(meta.attachment ? { attachment: { ...meta.attachment, dataBase64: '' } } : {}) }; }) };
  return new TextEncoder().encode(JSON.stringify(shell)).byteLength + items.reduce((bytes, item) => bytes + (item.attachment ? Math.ceil(item.attachment.size / 3) * 4 : 0), 0);
}

export function validateFamilyState(value: unknown): FamilyState {
  if (!object(value) || value.schemaVersion !== 1) throw new Error('Unsupported family archive version. Existing device records have not been replaced.');
  if (!Number.isSafeInteger(value.revision) || Number(value.revision) < 0 || !Array.isArray(value.items) || value.items.length > MAX_FAMILY_ITEMS) throw new Error('Invalid family archive inventory. Existing device records have not been replaced.');
  const items = value.items.map(validateFamilyItem);
  if (new Set(items.map(item => item.id)).size !== items.length) throw new Error('This family archive contains duplicate record IDs.');
  if (familyBackupSize(items) > MAX_FAMILY_BACKUP_BYTES) throw new Error('The archive would exceed the 128 MiB portable-backup limit. Export existing records before removing items or use a smaller file.');
  return { schemaVersion: 1, revision: Number(value.revision), items };
}

export async function verifyFamilyState(value: unknown): Promise<FamilyState> {
  const state = validateFamilyState(value);
  for (const item of state.items) {
    if (!item.attachment) continue;
    const verified = await prepareFamilyAttachment(item.attachment.blob, item.attachment.name, item.attachment.origin);
    if (verified.sha256 !== item.attachment.sha256 || verified.type !== item.attachment.type || verified.kind !== item.attachment.kind) throw new Error(`The original file for “${item.title}” failed its integrity check. Existing device records have not been replaced.`);
  }
  return state;
}

function timeSeconds(value: string): number | null {
  const match = value.match(/^(?:(\d{2,}):)?(\d{2}):(\d{2})\.(\d{3})$/);
  if (!match || Number(match[2]) >= 60 || Number(match[3]) >= 60) return null;
  const seconds = Number(match[1] || 0) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000;
  return Number.isFinite(seconds) ? seconds : null;
}
export function parseCaptions(text: string): CaptionCue[] {
  if (!text.trim()) return [];
  if (text.length > MAX_FAMILY_TEXT || !/^\uFEFF?WEBVTT(?:\s|$)/.test(text)) throw new Error('Captions must be a valid WebVTT text file beginning with WEBVTT.');
  const cues: CaptionCue[] = [];
  for (const block of text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split(/\n{2,}/).slice(1)) {
    const lines = block.trim().split('\n');
    if (!lines[0] || /^(NOTE|STYLE|REGION)(\s|$)/.test(lines[0])) continue;
    const timing = lines.findIndex(line => line.includes('-->'));
    if (timing < 0) throw new Error('A caption is missing its timestamp range.');
    const match = lines[timing].match(/^(\S+)\s+-->\s+(\S+)(?:\s+.*)?$/);
    const start = match ? timeSeconds(match[1]) : null, end = match ? timeSeconds(match[2]) : null;
    if (start === null || end === null || end <= start || cues.length >= 5000) throw new Error('A caption timestamp is invalid or the cue limit was exceeded.');
    const caption = lines.slice(timing + 1).join('\n').replace(/<[^>]*>/g, '');
    if (!caption.trim()) throw new Error('A caption has no display text.');
    cues.push({ start, end, text: caption });
  }
  if (!cues.length) throw new Error('This WebVTT file has no usable captions.');
  return cues.sort((a, b) => a.start - b.start);
}

export async function prepareFamilyAttachment(blob: Blob, name: string, origin: FamilyAttachment['origin'] = 'upload'): Promise<FamilyAttachment> {
  if (!blob.size || blob.size > MAX_FAMILY_FILE_BYTES) throw new Error('Use an original file between 1 byte and 32 MiB. Longer recordings can be archived in separate parts.');
  if (!name || name.length > 240 || /[\u0000-\u001f/\\]/.test(name)) throw new Error('Use a plain filename without folders or control characters.');
  const extension = name.toLowerCase().split('.').pop() || '';
  const types: Record<string, { type: string; kind: FamilyMediaKind }> = {
    jpg:{type:'image/jpeg',kind:'photo'},jpeg:{type:'image/jpeg',kind:'photo'},png:{type:'image/png',kind:'photo'},webp:{type:'image/webp',kind:'photo'},gif:{type:'image/gif',kind:'photo'},
    mp3:{type:'audio/mpeg',kind:'audio'},wav:{type:'audio/wav',kind:'audio'},ogg:{type:'audio/ogg',kind:'audio'},webm:{type:'audio/webm',kind:'audio'},m4a:{type:'audio/mp4',kind:'audio'},
    pdf:{type:'application/pdf',kind:'document'},txt:{type:'text/plain',kind:'document'},docx:{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',kind:'document'},odt:{type:'application/vnd.oasis.opendocument.text',kind:'document'},
  };
  const type = types[extension];
  if (!type) throw new Error('Supported originals: JPG, PNG, WebP, GIF; MP3, WAV, OGG, WebM, M4A; PDF, TXT, DOCX and ODT.');
  const head = new Uint8Array(await blob.slice(0, 64).arrayBuffer()), ascii = new TextDecoder().decode(head);
  const signatureMatches = extension === 'txt' ? !ascii.includes('\0')
    : ['jpg', 'jpeg'].includes(extension) ? head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff
    : extension === 'png' ? [137,80,78,71,13,10,26,10].every((byte, i) => head[i] === byte)
    : extension === 'gif' ? /^GIF8[79]a/.test(ascii)
    : extension === 'webp' ? ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP'
    : extension === 'wav' ? ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WAVE'
    : extension === 'ogg' ? ascii.startsWith('OggS')
    : extension === 'webm' ? [0x1a,0x45,0xdf,0xa3].every((byte, i) => head[i] === byte)
    : extension === 'm4a' ? ascii.slice(4, 8) === 'ftyp'
    : extension === 'mp3' ? ascii.startsWith('ID3') || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0)
    : extension === 'pdf' ? ascii.startsWith('%PDF-')
    : ascii.startsWith('PK\u0003\u0004');
  if (!signatureMatches) throw new Error('The file content does not match its supported filename type. The original was not saved.');
  const normalizedBlob = blob.type === type.type ? blob : blob.slice(0, blob.size, type.type);
  return { name, type: type.type, kind: type.kind, origin, size: blob.size, sha256: await familyHash(blob), blob: normalizedBlob };
}

const searchFold = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
export function filterFamilyItems(items: FamilyItem[], filter: FamilyFilter): FamilyItem[] {
  const words = searchFold(filter.query || '').trim().split(/\s+/).filter(Boolean);
  return items.filter(item => {
    if (!filter.showHidden && item.visibility === 'hidden') return false;
    if (filter.person && item.person !== filter.person) return false;
    if (filter.collection && item.collection !== filter.collection) return false;
    if (filter.from && (!item.occurredOn || item.occurredOn < filter.from)) return false;
    if (filter.to && (!item.occurredOn || item.occurredOn > filter.to)) return false;
    const haystack = searchFold([item.title, item.person, item.collection, ...item.topics, item.body, item.transcript, ...item.passages.map(link => `${link.label} ${link.reference.bookId} ${link.reference.chapter}:${link.reference.verse}`)].join('\n'));
    return words.every(word => haystack.includes(word));
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

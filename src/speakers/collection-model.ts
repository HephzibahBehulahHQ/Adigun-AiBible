import type { Reference } from '../types';

export const MAX_SPEECH_COLLECTIONS = 100;
export const MAX_SPEECH_ENTRIES = 200;
export const MAX_SPEECH_COLLECTION_BACKUP_BYTES = 2 * 1024 * 1024;

/** Private source locators contain no copied Scripture or editorial approval. */
export interface SpeechPin {
  id: string; reference: Reference & { editionId: string }; editionSha256: string;
  sourceTextHash: string; editionName: string; bookName: string; language: string; sourceUrl: string;
  marker: 'wj'; offsetUnit: 'unicode-codepoint'; start: number; end: number;
}
export interface SpeechCollection {
  id: string; title: string; entries: SpeechPin[]; createdAt: string; updatedAt: string;
}
export interface SpeechCollectionsState { schemaVersion: 1; revision: number; collections: SpeechCollection[] }
export const emptySpeechCollections = (): SpeechCollectionsState => ({ schemaVersion: 1, revision: 0, collections: [] });

function record(value: unknown, fields: string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error(`Invalid ${label}.`);
  const row = value as Record<string, unknown>;
  if (Reflect.ownKeys(row).some(key => typeof key !== 'string' || !fields.includes(key))
    || fields.some(key => !Object.hasOwn(row, key))) {
    throw new Error(`Incomplete or unknown ${label} fields. Copied Scripture and review approvals are not accepted.`);
  }
  return row;
}
function text(value: unknown, label: string, maximum: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`${label} is missing, invalid or too long.`);
  }
  return value;
}
function hash(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error(`${label} must be an exact SHA-256.`);
  return value;
}
function date(value: unknown): string {
  const checked = text(value, 'Speech collection date', 30);
  if (!Number.isFinite(Date.parse(checked)) || new Date(checked).toISOString() !== checked) throw new Error('Invalid speech collection date.');
  return checked;
}
function boundedJson(value: unknown): string {
  const json = JSON.stringify(value);
  if (new TextEncoder().encode(json).byteLength > MAX_SPEECH_COLLECTION_BACKUP_BYTES) {
    throw new Error('Speech collections exceed their 2 MiB limit. Back up and remove older collections first.');
  }
  return json;
}

export function validateSpeechPin(value: unknown): SpeechPin {
  const pin = record(value, ['id', 'reference', 'editionSha256', 'sourceTextHash', 'editionName', 'bookName', 'language', 'sourceUrl', 'marker', 'offsetUnit', 'start', 'end'], 'saved speech');
  const rawRef = record(pin.reference, ['bookId', 'chapter', 'verse', 'editionId'], 'saved speech reference');
  const bookId = text(rawRef.bookId, 'Speech book identifier', 4), editionId = text(rawRef.editionId, 'Speech edition identifier', 64);
  if (!/^[1-3]?[A-Z]{2,3}$/.test(bookId) || !/^[a-z0-9][a-z0-9-]*$/.test(editionId)
    || !Number.isSafeInteger(rawRef.chapter) || Number(rawRef.chapter) < 1 || Number(rawRef.chapter) > 1000
    || !Number.isSafeInteger(rawRef.verse) || Number(rawRef.verse) < 1 || Number(rawRef.verse) > 10000) throw new Error('Invalid saved speech reference.');
  if (pin.marker !== 'wj' || pin.offsetUnit !== 'unicode-codepoint'
    || !Number.isSafeInteger(pin.start) || Number(pin.start) < 0
    || !Number.isSafeInteger(pin.end) || Number(pin.end) <= Number(pin.start) || Number(pin.end) > 100000) {
    throw new Error('Saved speech needs publisher wj markings and valid Unicode code-point boundaries.');
  }
  const reference = { bookId, chapter: Number(rawRef.chapter), verse: Number(rawRef.verse), editionId };
  const start = Number(pin.start), end = Number(pin.end), id = text(pin.id, 'Speech identifier', 180);
  if (id !== `${editionId}:${bookId}:${reference.chapter}:${reference.verse}:${start}-${end}`) throw new Error('The saved speech identifier does not match its exact reference and boundaries.');
  const language = text(pin.language, 'Speech source language', 64);
  if (!/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(language)) throw new Error('Invalid speech source language.');
  const sourceUrl = text(pin.sourceUrl, 'Publisher source URL', 2048);
  let url: URL;
  try { url = new URL(sourceUrl); } catch { throw new Error('Invalid publisher source URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Publisher source URLs must use HTTPS without credentials.');
  return {
    id, reference, editionSha256: hash(pin.editionSha256, 'Speech edition revision'), sourceTextHash: hash(pin.sourceTextHash, 'Speech source text hash'),
    editionName: text(pin.editionName, 'Speech edition name', 200), bookName: text(pin.bookName, 'Speech book name', 100), language, sourceUrl,
    marker: 'wj', offsetUnit: 'unicode-codepoint', start, end,
  };
}

export function validateSpeechCollection(value: unknown): SpeechCollection {
  const row = record(value, ['id', 'title', 'entries', 'createdAt', 'updatedAt'], 'speech collection');
  const id = text(row.id, 'Speech collection identifier', 100);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) throw new Error('Invalid speech collection identifier.');
  if (!Array.isArray(row.entries) || row.entries.length > MAX_SPEECH_ENTRIES) throw new Error(`Keep at most ${MAX_SPEECH_ENTRIES} speech entries in one collection.`);
  const entries = Array.from(row.entries, validateSpeechPin);
  if (new Set(entries.map(entry => entry.id)).size !== entries.length) throw new Error('A speech collection cannot contain duplicate marked spans.');
  const createdAt = date(row.createdAt), updatedAt = date(row.updatedAt);
  if (Date.parse(updatedAt) < Date.parse(createdAt)) throw new Error('The speech collection update date precedes its creation date.');
  return { id, title: text(row.title, 'Speech collection title', 160), entries, createdAt, updatedAt };
}

export function validateSpeechCollections(value: unknown): SpeechCollectionsState {
  const state = record(value, ['schemaVersion', 'revision', 'collections'], 'speech collections');
  if (state.schemaVersion !== 1 || !Number.isSafeInteger(state.revision) || Number(state.revision) < 0 || Number(state.revision) >= Number.MAX_SAFE_INTEGER) throw new Error('Unsupported speech collection version or revision.');
  if (!Array.isArray(state.collections) || state.collections.length > MAX_SPEECH_COLLECTIONS) throw new Error(`Keep at most ${MAX_SPEECH_COLLECTIONS} speech collections.`);
  const collections = Array.from(state.collections, validateSpeechCollection);
  if (new Set(collections.map(collection => collection.id)).size !== collections.length) throw new Error('Duplicate speech collection identifiers.');
  const result: SpeechCollectionsState = { schemaVersion: 1, revision: Number(state.revision), collections };
  boundedJson(result);
  boundedJson({ kind: 'adigun-speech-collections', version: 1, workspace: { ...result, revision: 0 } });
  return result;
}

export function speechCollectionsBackup(value: SpeechCollectionsState): string {
  return boundedJson({ kind: 'adigun-speech-collections', version: 1, workspace: { ...validateSpeechCollections(value), revision: 0 } });
}
export function parseSpeechCollectionsBackup(raw: string): SpeechCollectionsState {
  if (typeof raw !== 'string') throw new Error('The speech collection backup must be JSON text.');
  if (raw.length > MAX_SPEECH_COLLECTION_BACKUP_BYTES || new TextEncoder().encode(raw).byteLength > MAX_SPEECH_COLLECTION_BACKUP_BYTES) throw new Error('Choose a speech collection backup no larger than 2 MiB.');
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('The speech collection backup is not valid JSON.'); }
  const backup = record(value, ['kind', 'version', 'workspace'], 'speech collection backup');
  if (backup.kind !== 'adigun-speech-collections' || backup.version !== 1) throw new Error('Choose an Adigun speech collection backup.');
  return { ...validateSpeechCollections(backup.workspace), revision: 0 };
}
export function previewSpeechCollectionsImport(current: SpeechCollectionsState, incoming: SpeechCollectionsState): { added: number; identical: number; conflicts: number } {
  const saved = new Map(validateSpeechCollections(current).collections.map(collection => [collection.id, collection]));
  let added = 0, identical = 0, conflicts = 0;
  for (const collection of validateSpeechCollections(incoming).collections) {
    const previous = saved.get(collection.id);
    if (!previous) added++;
    else if (JSON.stringify(previous) === JSON.stringify(collection)) identical++;
    else conflicts++;
  }
  return { added, identical, conflicts };
}
export function mergeSpeechCollections(current: SpeechCollectionsState, incoming: SpeechCollectionsState, conflict: 'keep-device' | 'use-backup'): SpeechCollectionsState {
  if (conflict !== 'keep-device' && conflict !== 'use-backup') throw new Error('Choose how conflicting speech collections should be restored.');
  const clean = validateSpeechCollections(current), collections = new Map(clean.collections.map(collection => [collection.id, collection]));
  for (const collection of validateSpeechCollections(incoming).collections) {
    if (!collections.has(collection.id) || conflict === 'use-backup') collections.set(collection.id, collection);
  }
  return validateSpeechCollections({ ...clean, collections: [...collections.values()] });
}
export function moveSpeechEntry(value: SpeechCollection, id: string, delta: -1 | 1): SpeechCollection {
  if (delta !== -1 && delta !== 1) throw new Error('Choose one position earlier or later for this speech.');
  const collection = validateSpeechCollection(value), entries = collection.entries.slice();
  const index = entries.findIndex(entry => entry.id === id), target = index + delta;
  if (index < 0 || target < 0 || target >= entries.length) throw new Error('This speech cannot move further in that direction.');
  [entries[index], entries[target]] = [entries[target], entries[index]];
  return { ...collection, entries };
}

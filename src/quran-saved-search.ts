import type { QuranSearchMode, QuranSearchOptions } from './quran-search';

export interface SavedQuranSearch {
  id: string;
  name: string;
  query: string;
  editionId: 'eng-clearquran';
  options: QuranSearchOptions;
  createdAt: string;
  updatedAt: string;
}

export const MAX_SAVED_QURAN_SEARCHES = 20;
const modes = ['phrase', 'all', 'any', 'boolean'];
const cleanText = (value: unknown, max: number, label: string, required = false): string => {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new Error(`Invalid saved Quran search ${label}.`);
  return value.trim();
};
const timestamp = (value: unknown): string => {
  if (typeof value !== 'string' || !/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error('Invalid saved Quran search date.');
  }
  return value;
};

export function validateSavedQuranSearches(value: unknown): SavedQuranSearch[] {
  if (!Array.isArray(value) || value.length > MAX_SAVED_QURAN_SEARCHES) throw new Error('Saved Quran searches must be a list of at most 20 items.');
  const items = value.map((entry): SavedQuranSearch => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Invalid saved Quran search record.');
    const record = entry as Record<string, unknown>;
    const raw = record.options;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid saved Quran search filters.');
    const options = raw as Record<string, unknown>;
    const surah = options.surah;
    if (!modes.includes(String(options.mode)) || !(surah === '' || (Number.isSafeInteger(surah) && Number(surah) >= 1 && Number(surah) <= 114))) {
      throw new Error('Invalid saved Quran search filters.');
    }
    if (record.editionId !== 'eng-clearquran') throw new Error('Saved Quran search edition is not supported.');
    return {
      id: cleanText(record.id, 80, 'ID', true),
      name: cleanText(record.name, 80, 'name', true),
      query: cleanText(record.query, 500, 'query', true),
      editionId: 'eng-clearquran',
      options: {
        mode: options.mode as QuranSearchMode,
        surah: surah as QuranSearchOptions['surah'],
        exclude: cleanText(options.exclude, 200, 'exclusion'),
      },
      createdAt: timestamp(record.createdAt),
      updatedAt: timestamp(record.updatedAt),
    };
  });
  if (new Set(items.map(item => item.id)).size !== items.length) throw new Error('Saved Quran searches contain duplicate IDs.');
  if (new Set(items.map(item => item.name.toLocaleLowerCase())).size !== items.length) throw new Error('Saved Quran search names must be unique.');
  return items;
}

export function saveQuranSearch(items: SavedQuranSearch[], candidate: SavedQuranSearch): SavedQuranSearch[] {
  const current = validateSavedQuranSearches(items);
  const next = validateSavedQuranSearches([candidate])[0];
  if (current.length >= MAX_SAVED_QURAN_SEARCHES && !current.some(item => item.id === next.id)) {
    throw new Error('You can save up to 20 Quran searches. Remove one before adding another.');
  }
  if (current.some(item => item.id !== next.id && item.name.toLocaleLowerCase() === next.name.toLocaleLowerCase())) {
    throw new Error('Choose a different saved Quran search name.');
  }
  return validateSavedQuranSearches([next, ...current.filter(item => item.id !== next.id)]);
}

export function removeQuranSearch(items: SavedQuranSearch[], id: string): SavedQuranSearch[] {
  const current = validateSavedQuranSearches(items);
  if (!current.some(item => item.id === id)) throw new Error('That saved Quran search no longer exists.');
  return current.filter(item => item.id !== id);
}

const databaseName = 'adigun-aibible-quran-saved-searches';
let opening: Promise<IDBDatabase> | undefined;
function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('Private Quran search storage is unavailable.'));
  if (!opening) {
    opening = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('searches')) request.result.createObjectStore('searches'); };
      request.onsuccess = () => { const db = request.result; db.onversionchange = () => db.close(); resolve(db); };
      request.onerror = () => reject(new Error('Could not open private Quran search storage.'));
      request.onblocked = () => reject(new Error('Close another Adigun-AiBible tab and retry.'));
    }).catch(error => { opening = undefined; throw error; });
  }
  return opening;
}

export async function loadSavedQuranSearches(): Promise<SavedQuranSearch[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction('searches', 'readonly').objectStore('searches').get('private');
    request.onsuccess = () => { try { resolve(request.result === undefined ? [] : validateSavedQuranSearches(request.result)); } catch (error) { reject(error); } };
    request.onerror = () => reject(new Error('Could not read private Quran searches; existing records were not changed.'));
  });
}

export async function persistSavedQuranSearches(items: SavedQuranSearch[]): Promise<void> {
  const valid = validateSavedQuranSearches(items);
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('searches', 'readwrite');
    tx.objectStore('searches').put(valid, 'private');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error('Private Quran searches were not saved; storage may be full.'));
    tx.onabort = () => reject(new Error('Saving private Quran searches was interrupted.'));
  });
}

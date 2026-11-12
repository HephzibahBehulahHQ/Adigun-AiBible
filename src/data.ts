import type { Book, CanonProfile, Edition, EditionCatalog, Manifest, Preferences, QuranSource } from './types';
import installedCatalog from '../data/editions/catalog.json';
import { requirePermission } from './permissions';
import { AsyncLruCache, SOURCE_BOOK_CACHE_LIMIT, SOURCE_MANIFEST_CACHE_LIMIT } from './source-cache.ts';
import { readSourceJson } from './source-codec.ts';
const base = import.meta.env?.BASE_URL || '/';
export const assetUrl = (path: string) => `${base}${path}`;
export const bibleEditionIds: string[] = ['eng-web', ...installedCatalog.editions.filter(edition => edition.corpus === 'bible').map(edition => edition.id)];
export function presetEditionId(preset: Preferences['preset']): string { return preset === 'de' ? 'deu1912' : preset === 'yo' ? 'yor' : 'eng-web'; }
export function editionPreset(id: string): Preferences['preset'] { return id === 'deu1912' ? 'de' : id === 'yor' ? 'yo' : 'en'; }
export function editionDataPath(editionId = 'eng-web', path = ''): string {
  if (!bibleEditionIds.includes(editionId)) throw new Error('That Bible edition is not installed.');
  return `${editionId === 'eng-web' ? 'data' : `data/editions/${editionId}`}/${path}`;
}
function validCanonProfile(value: unknown): value is CanonProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const profile = value as Record<string, unknown>;
  return typeof profile.id === 'string' && /^[a-z0-9-]{1,80}$/.test(profile.id)
    && typeof profile.label === 'string' && !!profile.label.trim() && profile.label.length <= 160
    && typeof profile.description === 'string' && !!profile.description.trim() && profile.description.length <= 1000
    && typeof profile.sourceUrl === 'string' && /^https:\/\//.test(profile.sourceUrl)
    && Number.isSafeInteger(profile.bookCount) && Number(profile.bookCount) > 0 && Number(profile.bookCount) <= 200
    && (profile.oldTestamentBookCount === undefined || Number.isSafeInteger(profile.oldTestamentBookCount)
      && Number(profile.oldTestamentBookCount) > 0 && Number(profile.oldTestamentBookCount) < Number(profile.bookCount));
}
async function readJSON(path: string, message: string): Promise<unknown> {
  let response: Response;
  try { response = await fetch(assetUrl(path)); }
  catch (error) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new Error(path.includes('/books/') ? "This chapter isn't cached yet. Reconnect to load it." : message);
    }
    throw error;
  }
  if (!response.ok) throw new Error(typeof navigator !== 'undefined' && !navigator.onLine && path.includes('/books/') ? "This chapter isn't cached yet. Reconnect to load it." : message);
  return readSourceJson(response);
}
const manifests = new AsyncLruCache<string, Manifest>(SOURCE_MANIFEST_CACHE_LIMIT);
export function getManifest(editionId = 'eng-web'): Promise<Manifest> {
  if (!bibleEditionIds.includes(editionId)) return Promise.reject(new Error('That Bible edition is not installed. Choose an available edition in the library.'));
  return manifests.getOrLoad(editionId, () => readJSON(editionDataPath(editionId, 'manifest.json'), 'This edition is not downloaded. Reconnect to open it.').then(async raw => {
    const data = raw as Manifest;
    if (data.schemaVersion !== 1 || data.edition?.id !== editionId || !Array.isArray(data.books) || !data.books.length || !data.totals || data.books.some(b => !/^[1-3]?[A-Z]{2,3}$/.test(b.id) || !Array.isArray(b.verseCounts) || b.chapters !== b.verseCounts.length) || data.edition.canonProfile !== undefined && (!validCanonProfile(data.edition.canonProfile) || data.edition.canonProfile.bookCount !== data.books.length)) throw new Error('This edition manifest failed validation.');
    await requirePermission(data.edition,'display');
    return data;
  }));
}
const books = new AsyncLruCache<string, Book>(SOURCE_BOOK_CACHE_LIMIT);
export function getBook(id: string, editionId = 'eng-web'): Promise<Book> {
  if (!/^[1-3]?[A-Z]{2,3}$/.test(id)) return Promise.reject(new Error('Invalid book identifier.'));
  const key = `${editionId}:${id}`;
  return books.getOrLoad(key, () => getManifest(editionId).then(manifest => {
    if (!manifest.books.some(book => book.id === id)) throw new Error('This book is absent from the selected edition.');
    return readJSON(editionDataPath(editionId, `books/${id}.json`), 'This book is not downloaded for the selected edition. Reconnect or choose a downloaded edition.');
  }).then(raw => {
    const book = raw as Book;
    if (book.id !== id || !Array.isArray(book.chapters) || book.chapters.some(ch => !Number.isInteger(ch.number) || !Array.isArray(ch.verses) || ch.verses.some(v => !Number.isInteger(v.number) || typeof v.text !== 'string'))) throw new Error('The downloaded book failed validation.');
    return book;
  }));
}
let catalog: Promise<EditionCatalog> | undefined;
export function getEditionCatalog(): Promise<EditionCatalog> {
  if (!catalog) catalog = Promise.all([getManifest(), readJSON('data/editions/catalog.json', 'Additional edition information is not downloaded.')]).then(([baseline, raw]) => {
    const imported = raw as EditionCatalog;
    if (imported.schemaVersion !== 1 || !Array.isArray(imported.editions) || imported.editions.some(e => typeof e.id !== 'string' || typeof e.name !== 'string' || !/^https:\/\//.test(e.sourceUrl) || !/^https:\/\//.test(e.licenseUrl) || e.canonProfile !== undefined && !validCanonProfile(e.canonProfile))) throw new Error('Edition catalog failed validation.');
    return {schemaVersion: 1, editions: [{...baseline.edition, corpus: 'bible' as const, rights:{redistribute:true,adapt:true,offline:true,audio:true,export:true}, attribution:'World English Bible. Text in the public domain; the edition name is a trademark of eBible.org.', conditions:['Changed wording must not be presented as the unchanged World English Bible.']}, ...imported.editions.filter(e => e.id !== baseline.edition.id)]};
  }).catch(error => { catalog = undefined; throw error; });
  return catalog;
}
let quran: Promise<QuranSource> | undefined;
export function getQuran(): Promise<QuranSource> {
  if (!quran) quran = Promise.all([getEditionCatalog(), readJSON('data/editions/eng-clearquran/quran.json', 'The English Quran source is not downloaded. Reconnect to open it.')]).then(async ([editions, raw]) => {
    const data = raw as {schemaVersion:number;editionId:string;surahs:QuranSource['surahs']};
    const edition = editions.editions.find(e => e.id === 'eng-clearquran' && e.corpus === 'quran');
    if (!edition || data.schemaVersion !== 1 || data.editionId !== edition.id || !Array.isArray(data.surahs) || data.surahs.length !== 114 || data.surahs.some((s,i) => s.number !== i+1 || !Array.isArray(s.verses) || !s.verses.length || s.verses.some((v,j) => v.number !== j+1 || typeof v.text !== 'string'))) throw new Error('The Quran edition failed validation.');
    await requirePermission(edition,'display');
    return {schemaVersion: 1, edition, surahs: data.surahs};
  }).catch(error => { quran = undefined; throw error; });
  return quran;
}
export function sourceCredit(edition: Edition): string { return [edition.attribution || edition.name, edition.license, edition.licenseUrl, edition.licenseDeedUrl, edition.sourceUrl].filter(Boolean).join('\n'); }

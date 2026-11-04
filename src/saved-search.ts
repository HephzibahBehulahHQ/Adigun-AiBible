export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  editionId: string;
  options: { mode: 'phrase'|'all'|'any'|'boolean'; bookId: string; testament: ''|'old'|'new'; exclude: string };
  createdAt: string;
  updatedAt: string;
}
export const MAX_SAVED_SEARCHES = 40;
const modes = ['phrase','all','any','boolean'];
const cleanText = (value: unknown, max: number, label: string, required = false): string => {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new Error(`Invalid saved search ${label}.`);
  return value.trim();
};
const timestamp = (value: unknown): string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error('Invalid saved search date.');
  return value;
};
export function validateSavedSearches(value: unknown): SavedSearch[] {
  if (!Array.isArray(value) || value.length > MAX_SAVED_SEARCHES) throw new Error('Saved searches must be a list of at most 40 items.');
  const result = value.map((entry): SavedSearch => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Invalid saved search record.');
    const r = entry as Record<string, unknown>, options = r.options;
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error('Invalid saved search filters.');
    const o = options as Record<string, unknown>;
    if (!modes.includes(String(o.mode)) || !['','old','new'].includes(String(o.testament))) throw new Error('Invalid saved search filters.');
    return { id: cleanText(r.id,80,'ID',true), name: cleanText(r.name,80,'name',true), query: cleanText(r.query,500,'query',true), editionId: cleanText(r.editionId,100,'edition',true),
      options: { mode:o.mode as SavedSearch['options']['mode'], bookId:cleanText(o.bookId,32,'book'), testament:o.testament as SavedSearch['options']['testament'], exclude:cleanText(o.exclude,200,'exclusion') },
      createdAt:timestamp(r.createdAt), updatedAt:timestamp(r.updatedAt) };
  });
  if (new Set(result.map(item=>item.id)).size !== result.length) throw new Error('Saved searches contain duplicate IDs.');
  if (new Set(result.map(item=>item.name.toLocaleLowerCase())).size !== result.length) throw new Error('Saved search names must be unique.');
  return result;
}
export function saveSearch(items: SavedSearch[], item: SavedSearch): SavedSearch[] {
  const current = validateSavedSearches(items), next = validateSavedSearches([item,...current.filter(old=>old.id!==item.id)]);
  if (current.length >= MAX_SAVED_SEARCHES && !current.some(old=>old.id===item.id)) throw new Error('You can save up to 40 searches. Remove one before adding another.');
  if (next.some(old=>old.id!==item.id && old.name.toLocaleLowerCase()===item.name.toLocaleLowerCase())) throw new Error('Choose a different saved-search name.');
  return next;
}
export function removeSavedSearch(items: SavedSearch[], id: string): SavedSearch[] {
  const current=validateSavedSearches(items);
  if(!current.some(item=>item.id===id)) throw new Error('That saved search no longer exists.');
  return current.filter(item=>item.id!==id);
}
const databaseName='adigun-aibible-saved-searches';
let opening:Promise<IDBDatabase>|undefined;
function openDatabase():Promise<IDBDatabase> {
  if(typeof indexedDB==='undefined') return Promise.reject(new Error('Private saved-search storage is unavailable.'));
  if(!opening) {
    const pending = new Promise<IDBDatabase>((resolve,reject)=>{
      const request=indexedDB.open(databaseName,1);
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('searches'))request.result.createObjectStore('searches');};
      request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>db.close();resolve(db);};
      request.onerror=()=>reject(new Error('Could not open saved-search storage.'));
      request.onblocked=()=>reject(new Error('Close another Adigun-AiBible tab and retry.'));
    }).catch(error=>{opening=undefined;throw error;});
    opening=pending;
  }
  return opening!;
}
export async function loadSavedSearches():Promise<SavedSearch[]> {
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{const request=db.transaction('searches','readonly').objectStore('searches').get('private');
    request.onsuccess=()=>{try{resolve(request.result===undefined?[]:validateSavedSearches(request.result));}catch(error){reject(error);}};
    request.onerror=()=>reject(new Error('Could not read saved searches; existing records were not changed.'));
  });
}
export async function persistSavedSearches(items:SavedSearch[]):Promise<void> {
  const valid=validateSavedSearches(items),db=await openDatabase();
  return new Promise((resolve,reject)=>{const tx=db.transaction('searches','readwrite');tx.objectStore('searches').put(valid,'private');
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(new Error('Saved searches were not written; storage may be full.'));
    tx.onabort=()=>reject(new Error('Saving saved searches was interrupted.'));
  });
}

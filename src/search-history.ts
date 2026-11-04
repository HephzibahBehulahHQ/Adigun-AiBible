import type { SearchOptions } from './search-query';
export interface SearchHistoryItem {
  id: string;
  query: string;
  editionId: string;
  options: SearchOptions;
  searchedAt: string;
}
export const MAX_SEARCH_HISTORY = 20;
const modes = ['phrase','all','any','boolean'];
const text = (value: unknown, max: number, label: string, required = false): string => {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new Error(`Invalid search history ${label}.`);
  return value.trim();
};
const date = (value: unknown): string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error('Invalid search history date.');
  return value;
};
export function validateSearchHistory(value: unknown): SearchHistoryItem[] {
  if (!Array.isArray(value) || value.length > MAX_SEARCH_HISTORY) throw new Error('Search history must contain at most 20 items.');
  const items = value.map((entry): SearchHistoryItem => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Invalid search history record.');
    const r = entry as Record<string, unknown>, raw = r.options;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid search history filters.');
    const o = raw as Record<string, unknown>;
    if (!modes.includes(String(o.mode)) || !['','old','new'].includes(String(o.testament))) throw new Error('Invalid search history filters.');
    return { id:text(r.id,80,'ID',true), query:text(r.query,500,'query',true), editionId:text(r.editionId,100,'edition',true),
      options:{ mode:o.mode as SearchOptions['mode'], bookId:text(o.bookId,32,'book'), testament:o.testament as SearchOptions['testament'], exclude:text(o.exclude,200,'exclusion') }, searchedAt:date(r.searchedAt) };
  });
  if (new Set(items.map(item=>item.id)).size !== items.length) throw new Error('Search history contains duplicate IDs.');
  const keys = items.map(item=>JSON.stringify([item.query.toLocaleLowerCase(),item.editionId,item.options]));
  if (new Set(keys).size !== keys.length) throw new Error('Search history contains duplicate queries.');
  return items;
}
export function recordSearchHistory(items: SearchHistoryItem[], item: SearchHistoryItem): SearchHistoryItem[] {
  const current=validateSearchHistory(items), candidate=validateSearchHistory([item])[0];
  const key=(x:SearchHistoryItem)=>JSON.stringify([x.query.toLocaleLowerCase(),x.editionId,x.options]);
  return validateSearchHistory([candidate,...current.filter(old=>key(old)!==key(candidate))].slice(0,MAX_SEARCH_HISTORY));
}
export function removeSearchHistory(items: SearchHistoryItem[], id: string): SearchHistoryItem[] {
  const current=validateSearchHistory(items);
  if(!current.some(item=>item.id===id))throw new Error('That search history item no longer exists.');
  return current.filter(item=>item.id!==id);
}
export function clearSearchHistory(): SearchHistoryItem[] { return []; }
const databaseName='adigun-aibible-search-history';
let opening:Promise<IDBDatabase>|undefined;
function openDatabase():Promise<IDBDatabase> {
  if(typeof indexedDB==='undefined')return Promise.reject(new Error('Private search history storage is unavailable.'));
  if(!opening){
    const pending=new Promise<IDBDatabase>((resolve,reject)=>{
      const request=indexedDB.open(databaseName,1);
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('history'))request.result.createObjectStore('history');};
      request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>db.close();resolve(db);};
      request.onerror=()=>reject(new Error('Could not open search history storage.'));
      request.onblocked=()=>reject(new Error('Close another Adigun-AiBible tab and retry.'));
    }).catch(error=>{opening=undefined;throw error;});
    opening=pending;
  }
  return opening!;
}
export async function loadSearchHistory():Promise<SearchHistoryItem[]>{
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{const request=db.transaction('history','readonly').objectStore('history').get('private');
    request.onsuccess=()=>{try{resolve(request.result===undefined?[]:validateSearchHistory(request.result));}catch(error){reject(error);}};
    request.onerror=()=>reject(new Error('Could not read search history; existing records were not changed.'));
  });
}
export async function persistSearchHistory(items:SearchHistoryItem[]):Promise<void>{
  const valid=validateSearchHistory(items),db=await openDatabase();
  return new Promise((resolve,reject)=>{const tx=db.transaction('history','readwrite');tx.objectStore('history').put(valid,'private');
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(new Error('Search history was not saved; storage may be full.'));
    tx.onabort=()=>reject(new Error('Saving search history was interrupted.'));
  });
}

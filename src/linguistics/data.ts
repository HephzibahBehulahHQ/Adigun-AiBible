import manifest from '../../data/linguistics/manifest.json';
import { assetUrl } from '../data';
import { parseLexicon } from './lexicon';
import type { DictionaryId, Lexicon } from './lexicon';
export const lexiconManifest = manifest;
const cache = new Map<DictionaryId, Promise<Lexicon>>();
export function getLexicon(id: DictionaryId): Promise<Lexicon> {
  if (!cache.has(id)) {
    const descriptor = manifest.dictionaries.find(row => row.id === id);
    if (!descriptor) return Promise.reject(new Error('That dictionary is not installed.'));
    const request = fetch(assetUrl(`data/linguistics/${descriptor.path}`)).then(async response => {
      if (!response.ok) throw new Error('This historical dictionary is not downloaded. Reconnect and retry.');
      return parseLexicon(await response.text(), descriptor);
    }).catch(error => { cache.delete(id); throw error; });
    cache.set(id, request);
  }
  return cache.get(id)!;
}

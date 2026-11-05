import { hashSourceText } from '../editorial.ts';
export type DictionaryId = 'greek' | 'hebrew';
export interface LexiconEntry {
  id: string; dictionary: DictionaryId; language: 'grc' | 'heb' | 'arc' | 'x-pn'; lemma: string;
  transliteration: string; pronunciation: string; lexicalTag: string; definition: string; derivation: string;
  kjvRenderings: string; notes: string; relatedIds: string[]; entrySha256: string;
}
export interface DictionaryDescriptor {
  id: string; title: string; path: string; records: number; headwords: number; languageCounts: Partial<Record<'grc' | 'heb' | 'arc' | 'x-pn', number>>;
  sourceUrl: string; sourceSha256: string; dataSha256: string; originalDate: string; digitalEdition: string; license: string; attribution: string;
}
export interface Lexicon { dictionaryId: DictionaryId; sourceSha256: string; entries: LexiconEntry[] }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const sha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const strongId = (value: string): string | null => { const match = value.trim().toUpperCase().match(/^([GH])0*([1-9]\d{0,3})$/); return match ? `${match[1]}${Number(match[2])}` : null; };
export function validateLexicon(value: unknown, descriptor: DictionaryDescriptor): Lexicon {
  if (!object(value) || value.schemaVersion !== 1 || value.dictionaryId !== descriptor.id || value.sourceSha256 !== descriptor.sourceSha256 || !Array.isArray(value.entries) || value.entries.length !== descriptor.records) throw new Error('The dictionary identity, revision or record count is invalid.');
  const seen = new Set<string>(), entries = value.entries.map(item => {
    if (!object(item) || typeof item.id !== 'string' || strongId(item.id) !== item.id || !item.id.startsWith(descriptor.id === 'greek' ? 'G' : 'H') || seen.has(item.id) || item.dictionary !== descriptor.id || !['grc','heb','arc','x-pn'].includes(String(item.language)) || !sha(item.entrySha256) || ['lemma','transliteration','pronunciation','lexicalTag','definition','derivation','kjvRenderings','notes'].some(key => typeof item[key] !== 'string' || String(item[key]).length > 40000) || !Array.isArray(item.relatedIds) || item.relatedIds.some(id => typeof id !== 'string' || strongId(id) !== id)) throw new Error('A historical dictionary entry is malformed or duplicated.');
    seen.add(item.id); return item as unknown as LexiconEntry;
  });
  return { dictionaryId: value.dictionaryId as DictionaryId, sourceSha256: String(value.sourceSha256), entries };
}
export async function parseLexicon(raw: string, descriptor: DictionaryDescriptor): Promise<Lexicon> {
  if (raw.length > 8_000_000 || await hashSourceText(raw) !== descriptor.dataSha256) throw new Error('The dictionary download does not match its pinned source checksum. It has not been opened.');
  return validateLexicon(JSON.parse(raw), descriptor);
}
export const foldLexical = (value: string): string => value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('en').trim();
export function searchLexicon(entries: LexiconEntry[], query: string, scope: 'all' | 'lemma' | 'definition' = 'all', language = ''): LexiconEntry[] {
  const term = foldLexical(query), exact = strongId(query), terms = term.split(/\s+/).filter(Boolean);
  return entries.filter(entry => {
    if (language && entry.language !== language) return false;
    if (exact) return entry.id === exact;
    if (/^[1-9]\d{0,3}$/.test(term)) return entry.id.slice(1) === term;
    const fields = scope === 'lemma' ? `${entry.lemma} ${entry.transliteration}` : scope === 'definition' ? `${entry.definition} ${entry.kjvRenderings}` : `${entry.id} ${entry.lemma} ${entry.transliteration} ${entry.definition} ${entry.derivation} ${entry.kjvRenderings} ${entry.notes}`;
    const folded = foldLexical(fields); return terms.every(word => folded.includes(word));
  }).sort((a, b) => Number(foldLexical(b.lemma) === term || foldLexical(b.transliteration) === term) - Number(foldLexical(a.lemma) === term || foldLexical(a.transliteration) === term) || a.id[0].localeCompare(b.id[0]) || Number(a.id.slice(1)) - Number(b.id.slice(1)));
}

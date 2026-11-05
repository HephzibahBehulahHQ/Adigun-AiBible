import type { Reference } from '../types';

export const lawSections = [
  { id: 'timeline', title: 'Timeline', summary: 'Eleven textual and historical study layers; no invented dates.' },
  { id: 'social', title: 'Social laws', summary: 'Justice, property, servitude, marriage, inheritance and restitution.' },
  { id: 'money', title: 'Money', summary: 'Possessions, attachment to wealth, generosity and responsibility.' },
  { id: 'sermons', title: 'Sermons', summary: 'Seven Gospel teaching collections, with their own literary settings.' },
  { id: 'evangelism', title: 'Evangelism', summary: 'A descriptive study of proclamation and its historical reception.' },
  { id: 'apostles', title: 'Apostles', summary: 'Fourteen people: biblical testimony distinguished from later death traditions.' },
  { id: 'second-coming', title: 'Second Coming', summary: 'Bible and Quran passages, with Hadith kept in a separate source category.' },
] as const;
export type LawSection = typeof lawSections[number]['id'];
export const lawCategories = ['sacrifice', 'purity', 'festivals', 'civil', 'family', 'dietary'] as const;
export type LawCategory = typeof lawCategories[number];
export interface BibleCitation { type: 'bible'; bookId: string; bookName: string; chapter: number; verse: number; endVerse?: number }
export interface QuranCitation { type: 'quran'; surah: number; ayah: number; endAyah?: number }
export interface ExternalCitation {
  type: 'church_tradition' | 'rabbinic' | 'hadith' | 'scholarship' | 'fiqh';
  title: string; url: string; note: string;
}
export type LawSource = BibleCitation | QuranCitation | ExternalCitation;
export interface LawEntry {
  id: string; section: LawSection; title: string; summary: string; contextNote: string;
  sources: LawSource[]; aiReviewStatus: 'ai_assisted'; humanReviewStatus: 'pending';
  prosperityGospelRisk: 'none' | 'flagged'; researchGap?: string;
  debate?: { question: string; note: string };
  categorySamples?: { category: LawCategory; sources: BibleCitation[] }[];
}

export function sourceLabel(source: LawSource): string {
  if (source.type === 'bible') return `${source.bookName} ${source.chapter}:${source.verse}${source.endVerse && source.endVerse !== source.verse ? `–${source.endVerse}` : ''}`;
  if (source.type === 'quran') return `Quran ${source.surah}:${source.ayah}${source.endAyah && source.endAyah !== source.ayah ? `–${source.endAyah}` : ''}`;
  return source.title;
}

export function bibleReference(source: BibleCitation, editionId: string): Reference {
  if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(editionId)) throw new Error('Choose a valid Bible edition.');
  return { bookId: source.bookId, chapter: source.chapter, verse: source.verse, ...(source.endVerse ? { endVerse: source.endVerse } : {}), editionId };
}

export function readLawSection(hash: string): LawSection {
  const section = hash.split('?')[0].split('/')[2];
  return lawSections.some(item => item.id === section) ? section as LawSection : 'timeline';
}

export function lawSectionHash(section: LawSection, hash: string): string {
  if (!lawSections.some(item => item.id === section)) throw new Error('Unknown Law Diary section.');
  const query = hash.includes('?') ? hash.slice(hash.indexOf('?')) : '';
  return `#/law-diary/${section}${query}`;
}

export function searchLawEntries(entries: LawEntry[], section: LawSection, query: string): LawEntry[] {
  const needle = query.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase().trim();
  return entries.filter(entry => entry.section === section && (!needle || [entry.title, entry.summary, entry.contextNote, ...entry.sources.map(sourceLabel)].join(' ').normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase().includes(needle)));
}

export function validateLawEntries(entries: LawEntry[]): void {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (!/^[a-z0-9-]+$/.test(entry.id) || ids.has(entry.id)) throw new Error(`Duplicate or invalid Law Diary id: ${entry.id}`);
    ids.add(entry.id);
    if (!lawSections.some(section => section.id === entry.section) || !entry.title.trim() || !entry.summary.trim() || !entry.contextNote.trim()) throw new Error(`Incomplete Law Diary entry: ${entry.id}`);
    if (entry.aiReviewStatus !== 'ai_assisted' || entry.humanReviewStatus !== 'pending' || 'relationship' in entry) throw new Error('Research entries cannot assert human approval or a comparison relationship.');
    if (!['none', 'flagged'].includes(entry.prosperityGospelRisk) || !entry.sources.length) throw new Error(`Missing provenance: ${entry.id}`);
    const citations = [...entry.sources, ...(entry.categorySamples?.flatMap(group => group.sources) || [])];
    for (const source of citations) {
      if (source.type === 'bible') {
        if (!/^[1-3]?[A-Z]{2,3}$/.test(source.bookId) || !source.bookName.trim() || !Number.isSafeInteger(source.chapter) || source.chapter < 1 || !Number.isSafeInteger(source.verse) || source.verse < 1 || (source.endVerse !== undefined && (!Number.isSafeInteger(source.endVerse) || source.endVerse < source.verse))) throw new Error(`Invalid Bible citation: ${entry.id}`);
      } else if (source.type === 'quran') {
        if (!Number.isSafeInteger(source.surah) || source.surah < 1 || source.surah > 114 || !Number.isSafeInteger(source.ayah) || source.ayah < 1 || (source.endAyah !== undefined && (!Number.isSafeInteger(source.endAyah) || source.endAyah < source.ayah)) || 'url' in source || 'collection' in source) throw new Error(`Invalid Quran citation: ${entry.id}`);
      } else {
        if (!['church_tradition', 'rabbinic', 'hadith', 'scholarship', 'fiqh'].includes(source.type) || !source.title.trim() || !source.note.trim()) throw new Error(`Unidentified external source: ${entry.id}`);
        const url = new URL(source.url);
        if (url.protocol !== 'https:' || url.username || url.password) throw new Error(`Unsafe source link: ${entry.id}`);
      }
    }
    if (entry.categorySamples?.some(group => !lawCategories.includes(group.category) || !group.sources.length)) throw new Error(`Invalid Torah category: ${entry.id}`);
  }
}

export interface Verse { number: number; text: string }
export interface Chapter { number: number; verses: Verse[] }
export interface Book { id: string; name: string; chapters: Chapter[] }
export interface BookInfo { id: string; name: string; chapters: number; verseCounts: number[]; verseRecordCounts?: number[] }
export interface EditionRights { redistribute: boolean; adapt: boolean; offline: boolean; audio: boolean; export: boolean }
export interface Edition { id: string; name: string; language: string; license: string; sourceUrl: string; licenseUrl: string; sha256?: string; attribution?: string; rights?: EditionRights; corpus?: 'bible' | 'quran'; noticePath?: string; licenseDeedUrl?: string; conditions?: string[] }
export interface EditionCatalog { schemaVersion: number; editions: Edition[] }
export interface QuranSource { schemaVersion: number; edition: Edition; surahs: {number: number; name?: string; verses: Verse[]}[] }
export interface Manifest { schemaVersion: number; edition: Edition; books: BookInfo[]; totals: { books: number; chapters: number; verses: number } }
export interface Reference { bookId: string; chapter: number; verse: number; endVerse?: number; editionId?: string }
export interface SearchResult extends Reference { text: string }
export interface Note { id: string; ref: Reference; text: string; updatedAt: string }
export interface StudyState { schemaVersion: 1; bookmarks: Reference[]; highlights: string[]; notes: Note[]; completedSessions: string[]; journal: { id: string; text: string; createdAt: string }[]; readingDays: string[] }
export type Locale = 'en' | 'de' | 'yo' | 'pcm';
export type Theme = 'observatory' | 'light' | 'parchment' | 'night' | 'retro';
export interface Preferences { locale: Locale; preset: 'genz' | 'en' | 'de' | 'yo' | 'pcm'; theme: Theme; fontSize: number; lineHeight: number; focus: boolean }
export type View = 'home' | 'read' | 'compare' | 'discover' | 'plans' | 'saved' | 'questions' | 'library' | 'sources' | 'settings' | 'share' | 'atlas' | 'study' | 'evidence' | 'editions' | 'projection' | 'tools' | 'family' | 'audio' | 'drop';

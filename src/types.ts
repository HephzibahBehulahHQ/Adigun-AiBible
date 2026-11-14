export interface SourceNote { at: number; marker: string; caller: string; text: string; content?: unknown[] }
export interface SourceCharacterSpan { start: number; end: number; marker: string }
export interface SourceHeading { afterVerse: number | null; style: string; text: string; content?: unknown[]; notes?: SourceNote[]; offsetUnit?: string }
export interface SourceParagraph { style: string; spans: { verse: number; start: number; end: number }[] }
export interface Verse { number: number; endNumber?: number; text: string; notes?: SourceNote[]; characterSpans?: SourceCharacterSpan[] }
export interface Chapter { number: number; verses: Verse[]; headings?: SourceHeading[]; paragraphs?: SourceParagraph[]; offsetUnit?: string }
export interface Book { id: string; name: string; chapters: Chapter[] }
export interface BookInfo { id: string; name: string; chapters: number; verseCounts: number[]; verseRecordCounts?: number[] }
export interface CanonProfile { id: string; label: string; description: string; sourceUrl: string; bookCount: number; oldTestamentBookCount?: number }
export interface EditionRights { redistribute: boolean; adapt: boolean; offline: boolean; audio: boolean; export: boolean }
export interface Edition { id: string; name: string; language: string; script?: string; direction?: 'ltr' | 'rtl'; nativeTitle?: string; sourceNoticeDate?: string; scope?: 'full-bible' | 'new-testament' | 'portion' | 'historical'; license: string; sourceUrl: string; licenseUrl: string; sha256?: string; attribution?: string; rights?: EditionRights; corpus?: 'bible' | 'quran'; noticePath?: string; licenseDeedUrl?: string; conditions?: string[]; canonProfile?: CanonProfile }
export interface EditionCatalog { schemaVersion: number; editions: Edition[] }
export interface QuranSource { schemaVersion: number; edition: Edition; surahs: {number: number; name?: string; verses: Verse[]}[] }
export interface Manifest { schemaVersion: number; edition: Edition; books: BookInfo[]; totals: { books: number; chapters: number; verses: number } }
export interface Reference { bookId: string; chapter: number; verse: number; endVerse?: number; editionId?: string }
export interface SearchResult extends Reference { text: string }
export interface Note { id: string; ref: Reference; text: string; updatedAt: string }
export interface StudyState { schemaVersion: 1; bookmarks: Reference[]; highlights: string[]; notes: Note[]; completedSessions: string[]; journal: { id: string; text: string; createdAt: string }[]; readingDays: string[] }
export type Locale = 'en' | 'de' | 'yo' | 'pcm';
export type Theme = 'observatory' | 'light' | 'parchment' | 'night' | 'retro';
export interface Preferences { locale: Locale; preset: 'en' | 'de' | 'yo' | 'pcm'; theme: Theme; fontSize: number; lineHeight: number; focus: boolean }
export type View = 'home' | 'read' | 'compare' | 'discover' | 'plans' | 'saved' | 'questions' | 'library' | 'sources' | 'settings' | 'share' | 'atlas' | 'study' | 'evidence' | 'editions' | 'projection' | 'tools' | 'family' | 'audio' | 'drop' | 'support' | 'law-diary' | 'widget' | 'ministry' | 'speakers' | 'editorial-workbench' | 'linguistics' | 'time-travel' | 'nearby' | 'interpretation' | 'concordance' | 'hebrew-study' | 'greek-study' | 'gospels';

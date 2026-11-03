import type { BookInfo, Reference, StudyState } from './types';
export const emptyStudy = (): StudyState => ({ schemaVersion: 1, bookmarks: [], highlights: [], notes: [], completedSessions: [], journal: [], readingDays: [] });
export const refKey = (r: Reference) => `${r.bookId}.${r.chapter}.${r.verse}`;
export const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
const aliases: Record<string, string[]> = { GEN: ['gen', 'genesis', '1 mose', '1. mose', 'genesi'], EXO: ['ex', 'exodus', '2 mose'], PSA: ['ps', 'psalm', 'psalms', 'psalmen'], PRO: ['prov', 'proverbs', 'spruche'], MAT: ['matt', 'matthew', 'matthaus'], MRK: ['mark', 'markus'], LUK: ['luke', 'lukas'], JHN: ['john', 'joh', 'johannes', 'johannu'], ROM: ['romans', 'romer'], PHP: ['phil', 'philippians', 'philipper'], REV: ['rev', 'revelation', 'offenbarung'] };
export function isReference(value: unknown): value is Reference {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return typeof r.bookId === 'string' && /^[1-3]?[A-Z]{2,3}$/.test(r.bookId) && Number.isInteger(r.chapter) && Number(r.chapter) > 0 && Number(r.chapter) <= 150 && Number.isInteger(r.verse) && Number(r.verse) > 0 && Number(r.verse) <= 176 && (r.endVerse === undefined || (Number.isInteger(r.endVerse) && Number(r.endVerse) >= Number(r.verse) && Number(r.endVerse) <= 176));
}
export function validateReference(r: Reference, books: BookInfo[]) {
  const b = books.find(b => b.id === r.bookId);
  return !!b && r.chapter >= 1 && r.chapter <= b.chapters && r.verse >= 1 && r.verse <= b.verseCounts[r.chapter - 1] && (!r.endVerse || (r.endVerse >= r.verse && r.endVerse <= b.verseCounts[r.chapter - 1]));
}
export function parseReference(query: string, books: BookInfo[]): Reference | null {
  const m = query.trim().match(/^(.+?)\s+(\d+)(?::(\d+)(?:\s*[-–]\s*(\d+))?)?$/);
  if (!m) return null;
  const name = fold(m[1]);
  const book = books.find(b => [b.id, b.name, ...(aliases[b.id] || [])].some(a => fold(a) === name));
  if (!book) return null;
  const r: Reference = { bookId: book.id, chapter: Number(m[2]), verse: Number(m[3] || 1), ...(m[4] ? { endVerse: Number(m[4]) } : {}) };
  return validateReference(r, books) ? r : null;
}
export function validateStudy(value: unknown): StudyState {
  if (!value || typeof value !== 'object') throw new Error('The backup must contain a study object.');
  const s = value as Record<string, unknown>;
  if (s.schemaVersion !== 1) throw new Error('Unsupported backup version.');
  for (const k of ['bookmarks', 'highlights', 'notes', 'completedSessions', 'journal', 'readingDays']) if (!Array.isArray(s[k]) || (s[k] as unknown[]).length > 10000) throw new Error(`Invalid ${k} in backup.`);
  if (!(s.bookmarks as unknown[]).every(isReference)) throw new Error('Invalid bookmark reference.');
  if (!(s.highlights as unknown[]).every(x => typeof x === 'string' && /^[1-3]?[A-Z]{2,3}\.\d+\.\d+$/.test(x))) throw new Error('Invalid highlights.');
  if (!(s.completedSessions as unknown[]).every(x => typeof x === 'string' && x.length < 100) || !(s.readingDays as unknown[]).every(x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x))) throw new Error('Invalid plan progress.');
  const textRecord = (x: unknown) => { if (!x || typeof x !== 'object') return false; const r = x as Record<string, unknown>; return typeof r.id === 'string' && r.id.length < 150 && typeof r.text === 'string' && r.text.length <= 20000; };
  if (!(s.notes as unknown[]).every(x => textRecord(x) && isReference((x as Record<string, unknown>).ref) && typeof (x as Record<string, unknown>).updatedAt === 'string')) throw new Error('Invalid study notes.');
  if (!(s.journal as unknown[]).every(x => textRecord(x) && typeof (x as Record<string, unknown>).createdAt === 'string')) throw new Error('Invalid journal.');
  const result = s as unknown as StudyState;
  return { ...result, bookmarks: [...new Map(result.bookmarks.map(r => [refKey(r), r])).values()], notes: [...new Map(result.notes.map(n => [n.id, n])).values()], completedSessions: [...new Set(result.completedSessions)] };
}
export function mergeStudy(a: StudyState, b: StudyState): StudyState {
  return validateStudy({ schemaVersion: 1, bookmarks: [...a.bookmarks, ...b.bookmarks], highlights: [...new Set([...a.highlights, ...b.highlights])], notes: [...a.notes, ...b.notes].sort((x, y) => x.updatedAt.localeCompare(y.updatedAt)), completedSessions: [...new Set([...a.completedSessions, ...b.completedSessions])], journal: [...new Map([...a.journal, ...b.journal].map(j => [j.id, j])).values()], readingDays: [...new Set([...a.readingDays, ...b.readingDays])] });
}
export function localDate(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
export type CoverageState = 'unreviewed' | 'in_review' | 'reviewed_with_links' | 'reviewed_no_match' | 'disputed';
export function coverageLabel(state: CoverageState) {
  return ({ unreviewed: 'Comparison not yet reviewed for this passage.', in_review: 'Comparison review in progress.', reviewed_with_links: 'Reviewed comparison available.', reviewed_no_match: 'No direct parallel recorded in the sources reviewed.', disputed: 'This comparison has disputed interpretations.' })[state];
}

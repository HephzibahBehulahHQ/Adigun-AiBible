import { validateReference } from '../domain.ts';
import { hashSourceText, stableStringify } from '../editorial.ts';
import { assertCompletePassage } from '../print.ts';
import type { EditionOperation } from '../edition-rights';
import type { Book, Edition, Manifest, QuranSource, Reference } from '../types';
import { validateDraft, validateSnapshot } from './model.ts';
import type { EditorialDraft, SourceSnapshot, WorkbenchState } from './model';

export interface WorkbenchSources {
  getManifest: (id: string) => Promise<Manifest>;
  getBook: (book: string, edition: string) => Promise<Book>;
  getQuran: () => Promise<QuranSource>;
  getNotice: (edition: Edition) => Promise<string>;
  requirePermission: (edition: Edition, operation: EditionOperation) => Promise<void>;
}
const system = (edition: Edition) => (edition as Edition & { referenceSystemId?: string }).referenceSystemId || `${edition.id}:publisher-numbering`;
async function snapshot(edition: Edition, corpus: SourceSnapshot['corpus'], workId: string, workName: string, chapter: number, start: number, end: number, units: { number: number; text: string }[], sources: WorkbenchSources): Promise<SourceSnapshot> {
  const notice = edition.noticePath ? await sources.getNotice(edition) : '';
  if (edition.noticePath && !notice.trim()) throw new Error('The complete publisher notice is unavailable. Source snapshots cannot omit it.');
  return validateSnapshot({ corpus, editionId: edition.id, editionSha256: edition.sha256, referenceSystemId: system(edition), workId, workName, chapter, start, end, editionName: edition.name, sourceUrl: edition.sourceUrl, licenseUrl: edition.licenseUrl,
    attribution: [edition.attribution || edition.name, edition.license, edition.licenseUrl, edition.sourceUrl].join('\n'), conditions: edition.conditions || [], notice,
    units: await Promise.all(units.map(async unit => ({ number: unit.number, text: unit.text, sha256: await hashSourceText(unit.text) }))) });
}
export async function bibleSnapshot(reference: Reference, sources: WorkbenchSources, operation: EditionOperation = 'display'): Promise<SourceSnapshot> {
  const editionId = reference.editionId || 'eng-web', normalized = { ...reference, editionId, endVerse: reference.endVerse ?? reference.verse };
  if (normalized.endVerse - normalized.verse >= 40) throw new Error('Select at most 40 verses for one source passage.');
  const manifest = await sources.getManifest(editionId);
  if (manifest.edition.id !== editionId || !validateReference(normalized, manifest.books, editionId)) throw new Error('The Bible reference is absent from its installed edition.');
  await sources.requirePermission(manifest.edition, operation);
  const book = await sources.getBook(reference.bookId, editionId), chapter = book.chapters.find(row => row.number === reference.chapter);
  if (book.id !== reference.bookId || !chapter) throw new Error('The original Bible source chapter is unavailable.');
  const units = chapter.verses.filter(row => row.number >= normalized.verse && row.number <= normalized.endVerse);
  assertCompletePassage(units, normalized);
  return snapshot(manifest.edition, 'bible', book.id, book.name, reference.chapter, normalized.verse, normalized.endVerse, units, sources);
}
export async function quranSnapshot(chapter: number, start: number, end: number, sources: WorkbenchSources, operation: EditionOperation = 'display'): Promise<SourceSnapshot> {
  if (![chapter,start,end].every(Number.isSafeInteger) || chapter < 1 || chapter > 114 || start < 1 || end < start || end - start >= 40) throw new Error('Choose an installed Quran passage of 1–40 ayat.');
  const source = await sources.getQuran(); await sources.requirePermission(source.edition, operation);
  const surah = source.surahs.find(row => row.number === chapter);
  if (!surah) throw new Error('The Quran surah is absent from the installed source.');
  const units = surah.verses.filter(row => row.number >= start && row.number <= end);
  assertCompletePassage(units, { verse: start, endVerse: end });
  return snapshot(source.edition, 'quran', 'QUR', surah.name || `Surah ${chapter}`, chapter, start, end, units, sources);
}
/** Re-resolve every byte, label and dependency from installed content; imported hashes are not trusted. */
export async function verifyDraftSources(value: EditorialDraft, sources: WorkbenchSources, exporting = false): Promise<void> {
  const draft = validateDraft(value);
  for (const saved of draft.sources) {
    const operation = exporting ? 'documentExport' : 'display';
    const actual = saved.corpus === 'bible'
      ? await bibleSnapshot({ editionId: saved.editionId, bookId: saved.workId, chapter: saved.chapter, verse: saved.start, endVerse: saved.end }, sources, operation)
      : await quranSnapshot(saved.chapter, saved.start, saved.end, sources, operation);
    if (stableStringify(actual) !== stableStringify(saved)) throw new Error('A draft source snapshot differs from the installed text, labels, reference or immutable edition revision. It has not been accepted.');
    if (draft.kind === 'paraphrase') { const manifest = await sources.getManifest(saved.editionId); await sources.requirePermission(manifest.edition, 'studyParaphrase'); }
  }
}
export async function verifyWorkbenchSources(value: WorkbenchState, sources: WorkbenchSources, exporting = false): Promise<void> {
  for (const draft of value.drafts) await verifyDraftSources(draft, sources, exporting);
}
export const sourceLabel = (source: SourceSnapshot) => `${source.workName} ${source.chapter}:${source.start}${source.end === source.start ? '' : `–${source.end}`} · ${source.editionName}`;
export function sourceReference(source: SourceSnapshot): Reference { return { bookId: source.workId, chapter: source.chapter, verse: source.start, endVerse: source.end, editionId: source.editionId }; }

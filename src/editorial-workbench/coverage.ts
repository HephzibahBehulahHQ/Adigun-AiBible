import { coverageCounts } from '../editorial.ts';
import type { PublishedEditorial } from '../publication';
import type { Manifest } from '../types';

/** Coverage remains scoped to one exact edition and one review dimension. */
export function bookCoverage(manifest: Manifest, publication: PublishedEditorial | null) {
  return manifest.books.map(book => {
    const sourceUnits = (book.verseRecordCounts || book.verseCounts).reduce((sum, count) => sum + count, 0);
    const rows = publication?.coverage.filter(row => row.bibleRef.editionId === manifest.edition.id && row.bibleRef.workId === book.id) || [];
    const counts = coverageCounts(rows), reviewed = counts.reviewed_with_links + counts.reviewed_no_match + counts.disputed;
    const paraphrases = publication?.approvedParaphrases.filter(row => row.basePassageIds.some(id => id.startsWith(`${manifest.edition.id}:${book.id}:`))).length || 0;
    return { id: book.id, name: book.name, chapters: book.chapters, sourceUnits, counts: { ...counts, unreviewed: counts.unreviewed + Math.max(0, sourceUnits - rows.length) }, reviewed, paraphrases, publicationAvailable: publication !== null };
  });
}
export interface AcquisitionRecord { provider: string; providerId: string; title: string; languageName: string; revision: string | null; sourceUrl: string; availability: string; coverage: string; permissions: string; installedEditionId: string | null }
export interface AcquisitionInventory { observedOn: string; source: { url: string; limitations: string[] }; records: AcquisitionRecord[] }
export function validateAcquisition(value: unknown): AcquisitionInventory {
  const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
  if (!object(value) || value.schemaVersion !== 1 || typeof value.observedOn !== 'string' || !object(value.source) || !Array.isArray(value.source.limitations) || value.source.limitations.some(row => typeof row !== 'string') || typeof value.source.url !== 'string' || !value.source.url.startsWith('https://') || !Array.isArray(value.records) || value.records.length > 10000) throw new Error('The acquisition inventory is malformed.');
  const records = value.records.map(item => {
    if (!object(item) || ['provider','providerId','title','languageName','sourceUrl','availability','coverage','permissions'].some(key => typeof item[key] !== 'string' || !String(item[key]).trim()) || !(item.revision === null || typeof item.revision === 'string') || !(item.installedEditionId === null || typeof item.installedEditionId === 'string')) throw new Error('The acquisition record is malformed.');
    try { if (new URL(String(item.sourceUrl)).protocol !== 'https:') throw new Error(); } catch { throw new Error('The acquisition source URL is unsafe.'); }
    return { provider: String(item.provider), providerId: String(item.providerId), title: String(item.title), languageName: String(item.languageName), revision: item.revision as string | null, sourceUrl: String(item.sourceUrl), availability: String(item.availability), coverage: String(item.coverage), permissions: String(item.permissions), installedEditionId: item.installedEditionId as string | null };
  });
  return { observedOn: value.observedOn, source: { url: value.source.url, limitations: value.source.limitations as string[] }, records };
}
export function filterAcquisition(inventory: AcquisitionInventory, query: string): AcquisitionRecord[] {
  const fold = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const wanted = fold(query.trim());
  return inventory.records.filter(row => fold(`${row.title} ${row.languageName} ${row.provider} ${row.providerId} ${row.revision || ''}`).includes(wanted));
}

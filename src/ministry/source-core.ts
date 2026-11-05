import { validateReference } from '../domain.ts';
import { assertCompletePassage } from '../print.ts';
import { passageLabel, validateSavedPassage } from '../reading-session/model.ts';
import type { SavedPassage } from '../reading-session/model';
import type { Book, Edition, Manifest, Reference, Verse } from '../types';
import { validateMinistryOutline } from './model.ts';
import type { MinistryOutline, MinistryState } from './model';

export interface MinistrySources {
  getManifest: (editionId: string) => Promise<Manifest>;
  getBook: (bookId: string, editionId: string) => Promise<Book>;
  requirePermission: (edition: Edition, operation: 'display' | 'documentExport') => Promise<void>;
}
export interface MinistrySourcePassage { passage: SavedPassage; edition: Edition; verses: Verse[]; attribution: string }
export async function resolveMinistrySource(reference: Reference, sources: MinistrySources, expectedSha256?: string, operation: 'display' | 'documentExport' = 'display'): Promise<MinistrySourcePassage> {
  const editionId = reference.editionId || 'eng-web', manifest = await sources.getManifest(editionId);
  const normalized = { ...reference, editionId, endVerse: reference.endVerse ?? reference.verse };
  if (manifest.edition.id !== editionId || !validateReference(normalized, manifest.books, editionId)) throw new Error('This passage is absent from its saved edition. No different translation has been substituted.');
  if (!manifest.edition.sha256 || (expectedSha256 && manifest.edition.sha256 !== expectedSha256)) throw new Error('This source revision has changed. The saved quotation is unavailable until you deliberately replace its reference.');
  await sources.requirePermission(manifest.edition, operation);
  const book = await sources.getBook(reference.bookId, editionId), chapter = book.chapters.find(item => item.number === reference.chapter);
  if (book.id !== reference.bookId || !chapter) throw new Error('The saved source chapter is unavailable.');
  const verses = chapter.verses.filter(item => item.number >= normalized.verse && item.number <= normalized.endVerse);
  assertCompletePassage(verses, normalized);
  return { passage: validateSavedPassage({ reference: normalized, sourceSha256: manifest.edition.sha256, editionName: manifest.edition.name, bookName: book.name }), edition: manifest.edition, verses,
    attribution: [manifest.edition.attribution || manifest.edition.name, manifest.edition.license, manifest.edition.licenseUrl, manifest.edition.sourceUrl].filter(Boolean).join('\n') };
}
export async function checkMinistryImportSources(state: MinistryState, sources: MinistrySources): Promise<void> {
  const checked = new Set<string>();
  for (const outline of [...state.outlines, ...state.templates]) for (const quote of outline.quotes) {
    const key = JSON.stringify(quote.passage);
    if (!checked.has(key)) {
      const resolved = await resolveMinistrySource(quote.passage.reference, sources, quote.passage.sourceSha256);
      if (resolved.passage.editionName !== quote.passage.editionName || resolved.passage.bookName !== quote.passage.bookName) throw new Error('A saved source label does not match its original edition and book. Correct the backup before importing it.');
      checked.add(key);
    }
  }
}
const markdownText = (text: string) => text.replace(/([\\`*_{}\[\]<>()#+.!|~-])/g, '\\$1');
/** Participant output is constructed from an allow-list. Private writing is never traversed. */
export async function ministryMarkdown(value: MinistryOutline, audience: 'participant' | 'facilitator', sources: MinistrySources): Promise<string> {
  const outline = validateMinistryOutline(value), resolved = new Map<string, MinistrySourcePassage>();
  for (const quote of outline.quotes) resolved.set(quote.id, await resolveMinistrySource(quote.passage.reference, sources, quote.passage.sourceSha256, 'documentExport'));
  const lines = [`# ${markdownText(outline.title)}`, '', audience === 'participant' ? 'Participant handout · user-authored study material' : 'PRIVATE FACILITATOR EDITION · includes private notes', ''];
  if (outline.series) lines.push(`Series: ${markdownText(outline.series)}`, '');
  if (outline.scheduledDate) lines.push(`Planned date: ${outline.scheduledDate} (${outline.timeZone})`, '');
  if (outline.tradition) lines.push(`Author-selected tradition: ${markdownText(outline.tradition)}`, '');
  lines.push(`Writing language: ${outline.contentLanguage}`, '', markdownText(outline.summary), '');
  const displayed = new Set<string>();
  const quoteLines = (quoteId: string) => {
    const source = resolved.get(quoteId)!; displayed.add(quoteId);
    return [`### ${markdownText(passageLabel(source.passage))} · ${markdownText(source.edition.name)}`, '', ...source.verses.map(verse => `> ${verse.number}. ${markdownText(verse.text)}`), '', markdownText(source.attribution), '', `Source revision: ${source.passage.sourceSha256}`, ''];
  };
  for (const section of outline.sections) {
    lines.push(`## ${markdownText(section.heading)}`, '', markdownText(section.writing), '');
    for (const quoteId of section.quoteIds) lines.push(...quoteLines(quoteId));
  }
  const unassigned = outline.quotes.filter(quote => !displayed.has(quote.id));
  if (unassigned.length) { lines.push('## Additional source readings', ''); for (const quote of unassigned) lines.push(...quoteLines(quote.id)); }
  if (audience === 'facilitator') lines.push('## PRIVATE: Context and preparation notes', '', markdownText(outline.contextNotes), '', '## PRIVATE: Facilitator notes and answers', '', markdownText(outline.facilitatorNotes), '');
  lines.push('Prepared locally in Adigun-AiBible. Source quotations retain their named editions. The outline is the author’s writing, not an approved interpretation or a published church calendar.', '');
  return lines.join('\n');
}

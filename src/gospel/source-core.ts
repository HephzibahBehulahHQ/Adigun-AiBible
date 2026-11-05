import { resolveMinistrySource } from '../ministry/source-core.ts';
import type { MinistrySources, MinistrySourcePassage } from '../ministry/source-core';
import { passageLabel } from '../reading-session/model.ts';
import type { SavedPassage } from '../reading-session/model';
import type { Reference, Verse } from '../types';
import { validateGospel, validateGospelReference, validateGospelRow } from './model.ts';
import type { GospelRow, GospelState } from './model';

export type GospelSources = MinistrySources;
export interface GospelSource extends MinistrySourcePassage { context: Verse[] }
export async function resolveGospelSource(reference: Reference, sources: GospelSources, saved?: SavedPassage, operation: 'display' | 'documentExport' = 'display'): Promise<GospelSource> {
  const ref = validateGospelReference(reference);
  const resolved = await resolveMinistrySource(ref, sources, saved?.sourceSha256, operation);
  if (saved) {
    const a = saved.reference, b = resolved.passage.reference;
    if (a.bookId !== b.bookId || a.editionId !== b.editionId || a.chapter !== b.chapter || a.verse !== b.verse || a.endVerse !== b.endVerse
      || saved.editionName !== resolved.passage.editionName || saved.bookName !== resolved.passage.bookName) throw new Error('A saved Gospel source label or reference does not match its exact edition.');
  }
  const book = await sources.getBook(ref.bookId, ref.editionId!);
  const chapter = book.chapters.find(item => item.number === ref.chapter)!;
  return { ...resolved, context: chapter.verses.filter(verse => verse.number >= Math.max(1, ref.verse - 2) && verse.number <= ref.endVerse! + 2) };
}
export async function checkGospelImportSources(value: GospelState, sources: GospelSources): Promise<GospelState> {
  const state = validateGospel(value), checked = new Set<string>();
  for (const row of state.rows) for (const passage of row.passages) {
    const key = JSON.stringify(passage);
    if (!checked.has(key)) { await resolveGospelSource(passage.reference, sources, passage); checked.add(key); }
  }
  return state;
}
const markdown = (value: string) => value.replace(/([\\`*_{}\[\]<>()#+.!|~-])/g, '\\$1');
export async function gospelRowMarkdown(value: GospelRow, sources: GospelSources): Promise<string> {
  const row = validateGospelRow(value);
  const passages = await Promise.all(row.passages.map(passage => resolveGospelSource(passage.reference, sources, passage, 'documentExport')));
  const lines = [`# ${markdown(row.title)}`, '', 'PRIVATE GOSPEL STUDY · user-arranged reading ranges · not independently reviewed', '', 'These passages are displayed together by the reader. Their placement does not establish equivalent events, chronology, wording or doctrine.', ''];
  for (const source of passages) {
    lines.push(`## ${markdown(passageLabel(source.passage))} · ${markdown(source.edition.name)}`, '',
      ...source.verses.map(verse => `> ${source.passage.reference.chapter}:${verse.number} ${markdown(verse.text)}`), '',
      markdown(source.attribution), '', `Source SHA-256: ${source.passage.sourceSha256}`, '');
  }
  lines.push('## Private notes · user writing', '', markdown(row.note), '', 'Prepared locally in Adigun-AiBible. Scripture wording remains tied to its named source revision.', '');
  return lines.join('\n');
}

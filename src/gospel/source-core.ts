import { resolveMinistrySource } from '../ministry/source-core.ts';
import type { MinistrySources, MinistrySourcePassage } from '../ministry/source-core';
import { passageLabel } from '../reading-session/model.ts';
import type { SavedPassage } from '../reading-session/model';
import type { Edition, Reference, Verse } from '../types';
import { validateGospel, validateGospelReference, validateGospelRow } from './model.ts';
import type { GospelRow, GospelState } from './model';

export interface GospelNotice { path: string; text: string; bytes: number; sha256: string }
export interface GospelSources extends MinistrySources { getNotice?: (edition: Edition) => Promise<GospelNotice> }
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
  const edition = resolved.edition;
  return { ...resolved, attribution: [edition.attribution || edition.name, edition.license, edition.licenseUrl, edition.licenseDeedUrl, edition.sourceUrl, ...(edition.conditions || [])].filter(Boolean).join('\n'),
    context: chapter.verses.filter(verse => verse.number >= Math.max(1, ref.verse - 2) && verse.number <= ref.endVerse! + 2) };
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
  const notices = new Map<string, GospelNotice>();
  for (const source of passages) {
    const edition = source.edition;
    if (!edition.noticePath || notices.has(edition.id)) continue;
    if (!sources.getNotice) throw new Error('A complete verified publisher notice is required before this edition can be exported.');
    const notice = await sources.getNotice(edition), bytes = new TextEncoder().encode(notice.text);
    if (notice.path !== `data/editions/${edition.noticePath}` || !notice.text.trim() || bytes.byteLength !== notice.bytes || bytes.byteLength > 256_000 || !/^[a-f0-9]{64}$/.test(notice.sha256)) throw new Error('The complete publisher notice failed validation. Nothing was exported.');
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('');
    if (digest !== notice.sha256) throw new Error('The publisher notice checksum differs from the verified source inventory. Nothing was exported.');
    notices.set(edition.id, notice);
  }
  const lines = [`# ${markdown(row.title)}`, '', 'PRIVATE GOSPEL STUDY · user-arranged reading ranges · not independently reviewed', '', 'These passages are displayed together by the reader. Their placement does not establish equivalent events, chronology, wording or doctrine.', ''];
  for (const source of passages) {
    lines.push(`## ${markdown(passageLabel(source.passage))} · ${markdown(source.edition.name)}`, '',
      ...source.verses.map(verse => `> ${source.passage.reference.chapter}:${verse.number} ${markdown(verse.text)}`), '',
      markdown(source.attribution), '', `Source SHA-256: ${source.passage.sourceSha256}`, '');
  }
  lines.push('## Private notes · user writing', '', markdown(row.note), '', 'Prepared locally in Adigun-AiBible. Scripture wording remains tied to its named source revision.', '');
  for (const [editionId, notice] of notices) {
    const fence = '`'.repeat(Math.max(3, ...(notice.text.match(/`+/g) || []).map(run => run.length + 1)));
    lines.push(`## Complete publisher notice · ${editionId}`, '', `${fence}text`, notice.text, fence, '', `Notice SHA-256: ${notice.sha256}`, '');
  }
  return lines.join('\n');
}

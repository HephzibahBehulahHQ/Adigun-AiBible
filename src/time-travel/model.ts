import raw from '../../data/time-travel/athens.json' with { type: 'json' };
import type { Book, Edition, Manifest, Reference, Verse } from '../types';
import type { EditionOperation } from '../edition-rights';
import { hashSourceText } from '../editorial.ts';

export type Perspective = 'paul' | 'listener' | 'archaeologist';
export interface TourSource { id: string; title: string; url: string; kind: string; accessedOn: string }
export interface TourStop { id: string; title: string; place: string; verse: number; endVerse: number; position: [number, number]; textNote: string; evidenceNote: string; sourceIds: string[]; uncertainty: string; perspectives: Record<Perspective, string> }
export interface Tour { schemaVersion: 1; id: string; title: string; ancientName: string; modernName: string; reviewStatus: string; geometryNotice: string; periods: { id: string; label: string; note: string; sourceIds?: string[] }[]; sources: TourSource[]; stops: TourStop[] }
export interface TourNotice { path: string; text: string; sha256: string; bytes: number }
export interface TourPassage { reference: Reference & { editionId: string }; edition: Edition; verses: Verse[]; notice?: Readonly<TourNotice> }
export interface TourDependencies { getManifest: (id: string) => Promise<Manifest>; getBook: (bookId: string, editionId: string) => Promise<Book>; requirePermission: (edition: Edition, operation: EditionOperation) => Promise<void>; getNotice?: (edition: Edition, signal?: AbortSignal) => Promise<TourNotice> }
const verifiedNotices = new WeakSet<Readonly<TourNotice>>();

export function tourNoticePath(edition: Edition): string {
  if (!edition.noticePath || !/^[A-Za-z0-9][A-Za-z0-9._-]*\/NOTICE\.txt$/.test(edition.noticePath) || !edition.noticePath.startsWith(`${edition.id}/`)) throw new Error('The complete publisher notice has no valid edition-specific source path.');
  return `data/editions/${edition.noticePath}`;
}

/** The runtime adapter supplies the expected bytes and checksum from this build's source inventory. */
export async function verifyTourNotice(edition: Edition, value: TourNotice): Promise<Readonly<TourNotice>> {
  if (value.path !== tourNoticePath(edition) || !/^[a-f0-9]{64}$/.test(value.sha256) || typeof value.text !== 'string' || !value.text.trim() || !Number.isSafeInteger(value.bytes) || value.bytes < 1 || value.bytes > 256_000 || new TextEncoder().encode(value.text).byteLength !== value.bytes || await hashSourceText(value.text) !== value.sha256) throw new Error('The complete publisher notice does not match this build’s verified source. Nothing was exported.');
  const verified = Object.freeze({ path: value.path, text: value.text, sha256: value.sha256, bytes: value.bytes });
  verifiedNotices.add(verified);
  return verified;
}

export function validateTour(value: Tour): Tour {
  const ids = new Set(value.sources.map(source => source.id));
  if (value.schemaVersion !== 1 || value.id !== 'athens-acts-17' || value.stops.length !== 4 || new Set(value.stops.map(stop => stop.id)).size !== 4 || ids.size !== value.sources.length || value.sources.some(source => { try { const url = new URL(source.url); return url.protocol !== 'https:' || !!url.username || !!url.password; } catch { return true; } })) throw new Error('The Athens experience registry is invalid.');
  for (const stop of value.stops) if (!Number.isSafeInteger(stop.verse) || !Number.isSafeInteger(stop.endVerse) || stop.verse < 16 || stop.endVerse < stop.verse || stop.endVerse > 34 || stop.position.length !== 2 || stop.position.some(number => !Number.isFinite(number) || Math.abs(number) > 15) || !stop.sourceIds.length || stop.sourceIds.some(id => !ids.has(id)) || !stop.textNote || !stop.evidenceNote || !stop.uncertainty || !Object.values(stop.perspectives).every(Boolean)) throw new Error('A tour stop is missing its source, uncertainty or valid passage.');
  return value;
}
export const athens = validateTour(raw as Tour);
export const tourReference = (stop: TourStop, editionId: string): Reference & { editionId: string } => ({ bookId: 'ACT', chapter: 17, verse: stop.verse, ...(stop.endVerse !== stop.verse ? { endVerse: stop.endVerse } : {}), editionId });

export async function loadTourPassage(stop: TourStop, editionId: string, dependencies: TourDependencies, signal?: AbortSignal): Promise<TourPassage> {
  if (!athens.stops.some(value => value.id === stop.id && value.verse === stop.verse && value.endVerse === stop.endVerse)) throw new Error('This stop is outside the researched experience.');
  const check = () => { if (signal?.aborted) throw new Error('Passage loading cancelled.'); };
  check(); const manifest = await dependencies.getManifest(editionId); check();
  if (manifest.edition.id !== editionId || !/^[a-f0-9]{64}$/.test(manifest.edition.sha256 || '')) throw new Error('The selected edition has no matching verified source revision.');
  await dependencies.requirePermission(manifest.edition, 'display'); check();
  const book = await dependencies.getBook('ACT', editionId); check();
  const chapter = book.chapters.find(value => value.number === 17);
  const verses = chapter?.verses.filter(verse => verse.number >= stop.verse && verse.number <= stop.endVerse) || [];
  if (book.id !== 'ACT' || verses.length !== stop.endVerse - stop.verse + 1 || verses.some((verse, index) => verse.number !== stop.verse + index || !verse.text.trim())) throw new Error('The complete stop passage is unavailable in this edition. No other edition was substituted.');
  return { reference: tourReference(stop, editionId), edition: manifest.edition, verses };
}

export async function loadExperiencePack(editionId: string, dependencies: TourDependencies, signal?: AbortSignal): Promise<TourPassage[]> {
  const passages: TourPassage[] = [];
  let notice: Readonly<TourNotice> | undefined;
  for (const stop of athens.stops) {
    const passage = await loadTourPassage(stop, editionId, dependencies, signal);
    for (const operation of ['documentExport', 'redistribution', 'offline'] as const) { await dependencies.requirePermission(passage.edition, operation); if (signal?.aborted) throw new Error('Pack preparation cancelled.'); }
    if (passages.length && (passages[0].edition.sha256 !== passage.edition.sha256 || passages[0].edition.noticePath !== passage.edition.noticePath)) throw new Error('The source changed during pack preparation. Download again from one verified revision.');
    if (passage.edition.noticePath && !notice) {
      if (!dependencies.getNotice) throw new Error('The complete publisher notice is required before exporting this edition. Reconnect and retry.');
      notice = await verifyTourNotice(passage.edition, await dependencies.getNotice(passage.edition, signal));
      if (signal?.aborted) throw new Error('Pack preparation cancelled.');
    }
    if (notice) passage.notice = notice;
    passages.push(passage);
  }
  return passages;
}

export const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
export function experiencePack(passages: TourPassage[]): string {
  if (passages.length !== athens.stops.length || passages.some((passage, index) => passage.reference.bookId !== 'ACT' || passage.reference.chapter !== 17 || passage.reference.verse !== athens.stops[index].verse || (passage.reference.endVerse ?? passage.reference.verse) !== athens.stops[index].endVerse || passage.reference.editionId !== passage.edition.id || passage.edition.id !== passages[0].edition.id || passage.edition.sha256 !== passages[0].edition.sha256 || passage.verses.length !== athens.stops[index].endVerse - athens.stops[index].verse + 1 || passage.verses.some((verse, verseIndex) => verse.number !== athens.stops[index].verse + verseIndex || !verse.text.trim()))) throw new Error('A complete, consistent source is required for this pack.');
  const e = escapeHtml, edition = passages[0].edition;
  const notice = passages[0].notice;
  if (edition.noticePath && (!notice || !verifiedNotices.has(notice) || notice.path !== tourNoticePath(edition) || passages.some(passage => passage.notice !== notice))) throw new Error('The complete verified publisher notice is required in every part of this export.');
  for (const address of [edition.licenseUrl, edition.sourceUrl]) { const url = new URL(address); if (url.protocol !== 'https:' || url.username || url.password) throw new Error('The source attribution needs safe publisher links.'); }
  if (edition.licenseDeedUrl) { const url = new URL(edition.licenseDeedUrl); if (url.protocol !== 'https:' || url.username || url.password) throw new Error('The source license needs a safe publisher link.'); }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Athens · Adigun–AiBible study pack</title><style>body{max-width:65rem;margin:auto;padding:2rem 1rem;background:#f7f0df;color:#222a35;font:1.1rem/1.65 system-ui}a{color:#244e75}section{border-top:1px solid #aaa;padding-block:1rem}blockquote{margin:1rem 0;padding:1rem;border-left:4px solid #876621;background:#fff}li{margin-block:.5rem}h1,h2{line-height:1.25}code{overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}.note{border:1px solid #876621;padding:1rem}nav a{display:inline-block;margin:.4rem}</style></head><body><header><h1>${e(athens.title)}</h1><p>${e(athens.ancientName)} · ${e(athens.modernName)}</p><p class="note">Offline 2D study pack · ${e(athens.reviewStatus)}. Optional 3D and device narration remain in the app; this document needs no network to read.</p><p>${e(athens.geometryNotice)}</p><nav aria-label="Tour stops">${athens.stops.map((stop, index) => `<a href="#${stop.id}">${index + 1}. ${e(stop.title)}</a>`).join('')}</nav></header>${athens.periods.map(period => `<p><strong>${e(period.label)}</strong> — ${e(period.note)}</p>`).join('')}${athens.stops.map((stop, index) => `<section id="${stop.id}"><h2>${index + 1}. ${e(stop.title)}</h2><p>${e(stop.place)} · Acts 17:${stop.verse}${stop.endVerse === stop.verse ? '' : `–${stop.endVerse}`}</p><h3>Biblical narrative</h3><p>${e(stop.textNote)}</p><blockquote lang="${e(edition.language)}">${passages[index].verses.map(verse => `<p><sup>${verse.number}</sup> ${e(verse.text)}</p>`).join('')}</blockquote><h3>Evidence and interpretation</h3><p>${e(stop.evidenceNote)}</p><p>${stop.sourceIds.map(id => { const source = athens.sources.find(source => source.id === id)!; return `<a href="${e(source.url)}" rel="noreferrer">${e(source.title)}</a>`; }).join(' · ')}</p><p><strong>Uncertainty:</strong> ${e(stop.uncertainty)}</p><h3>Perspective prompts · questions, not dialogue</h3><ul>${Object.entries(stop.perspectives).map(([perspective, prompt]) => `<li><strong>${e(perspective)}:</strong> ${e(prompt)}</li>`).join('')}</ul></section>`).join('')}<section><h2>Source edition and citations</h2><p>${e(edition.attribution || edition.name)}</p><p>${e(edition.license)}</p><p><a href="${e(edition.licenseUrl)}" rel="noreferrer">Edition license</a> · <a href="${e(edition.sourceUrl)}" rel="noreferrer">Publisher source</a></p><p>${e((edition.conditions || []).join(' '))}</p>${edition.licenseDeedUrl ? `<p><a href="${e(edition.licenseDeedUrl)}" rel="noreferrer">Source text license</a></p>` : ''}${notice ? `<h3>Complete publisher copyright and source notice</h3><pre>${e(notice.text)}</pre><p>Notice SHA-256: <code>${e(notice.sha256)}</code></p>` : ''}<p>Exact source revision: <code>${e(edition.sha256 || '')}</code></p><ul>${athens.sources.map(source => `<li><a href="${e(source.url)}" rel="noreferrer">${e(source.title)}</a> · ${e(source.kind)} · checked ${e(source.accessedOn)}</li>`).join('')}</ul><p>Research notes and schematic scenery are AI-assisted drafts. Scripture remains the unchanged selected-edition text. External sources are linked; their pages, images and models are not bundled.</p></section></body></html>`;
}

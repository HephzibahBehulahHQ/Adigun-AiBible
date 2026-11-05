import type { Edition } from '../types';
import { gospelReferenceKey, resolvePaneReference, validateGospelSelection } from './model.ts';
import type { GospelSelection } from './model';
import { loadGospelExcerpt } from './source.ts';
import type { GospelExcerpt, GospelSources } from './source';
import { validateGospelStudy, validateGospelStudyPassage, validateGospelStudyRow } from './study-model.ts';
import type { GospelStudyPassage, GospelStudyRow, GospelStudyState } from './study-model';

export interface GospelStudyNotice { path: string; text: string; bytes: number; sha256: string }
export interface GospelStudySources extends GospelSources {
  requirePermission: (edition: Edition, operation: 'display' | 'documentExport') => Promise<void>;
  getNotice?: (edition: Edition) => Promise<GospelStudyNotice>;
}

/** A saved label and revision are evidence, not hints for choosing replacement text. */
export async function loadSavedGospelPassage(value: GospelStudyPassage, sources: GospelSources): Promise<GospelExcerpt> {
  const saved = validateGospelStudyPassage(value);
  const excerpt = await loadGospelExcerpt(saved.reference, sources, saved.sourceSha256);
  if (gospelReferenceKey(saved.reference) !== gospelReferenceKey(excerpt.reference)
    || saved.sourceSha256 !== excerpt.sourceSha256 || saved.editionName !== excerpt.edition.name || saved.bookName !== excerpt.bookName) {
    throw new Error('A saved Gospel source label or reference does not match its exact edition. No replacement text was loaded.');
  }
  return excerpt;
}

export async function captureGospelStudyPassages(value: GospelSelection, sources: GospelSources, pins: GospelStudyPassage[] = []): Promise<GospelStudyPassage[]> {
  const selection = validateGospelSelection(value);
  if (!Array.isArray(pins) || pins.length > 4) throw new Error('The saved Gospel source pins are invalid.');
  const saved = pins.map(validateGospelStudyPassage);
  const byReference = new Map(saved.map(passage => [gospelReferenceKey(passage.reference), passage]));
  if (byReference.size !== saved.length) throw new Error('The saved Gospel source pins are ambiguous.');
  return Promise.all(selection.panes.map(async pane => {
    const reference = resolvePaneReference(selection, pane), pin = byReference.get(gospelReferenceKey(reference));
    const excerpt = pin ? await loadSavedGospelPassage(pin, sources) : await loadGospelExcerpt(reference, sources);
    return validateGospelStudyPassage({ reference: excerpt.reference, sourceSha256: excerpt.sourceSha256, editionName: excerpt.edition.name, bookName: excerpt.bookName });
  }));
}

export async function checkGospelStudySources(value: GospelStudyState, sources: GospelSources): Promise<GospelStudyState> {
  const state = validateGospelStudy(value), checked = new Set<string>();
  for (const row of state.rows) for (const passage of row.passages) {
    const key = JSON.stringify(passage);
    if (!checked.has(key)) { await loadSavedGospelPassage(passage, sources); checked.add(key); }
  }
  return state;
}

const markdown = (value: string) => value.replace(/&/g, '&amp;').replace(/([\\`*_{}\[\]<>()#+.!|~-])/g, '\\$1');
const label = (passage: GospelStudyPassage) => {
  const reference = passage.reference;
  return `${passage.bookName} ${reference.chapter}:${reference.verse}${reference.endVerse === reference.verse ? '' : `–${reference.endVerse}`}`;
};

async function publisherNotices(passages: GospelExcerpt[], sources: GospelStudySources): Promise<Map<string, GospelStudyNotice>> {
  const notices = new Map<string, GospelStudyNotice>();
  for (const source of passages) {
    const edition = source.edition;
    if (notices.has(edition.id)) continue;
    if (!edition.noticePath) {
      if (edition.id !== 'eng-web') throw new Error('The complete publisher notice is unavailable for this edition. Nothing was exported.');
      continue;
    }
    if (!sources.getNotice) throw new Error('A complete verified publisher notice is required before this edition can be exported.');
    const notice = await sources.getNotice(edition);
    if (!notice || notice.path !== `data/editions/${edition.noticePath}` || typeof notice.text !== 'string' || !notice.text.trim()
      || !Number.isSafeInteger(notice.bytes) || notice.bytes < 1 || notice.bytes > 256_000
      || typeof notice.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(notice.sha256)) {
      throw new Error('The complete publisher notice failed validation. Nothing was exported.');
    }
    const bytes = new TextEncoder().encode(notice.text);
    if (bytes.byteLength !== notice.bytes) throw new Error('The publisher notice byte count differs from the verified source inventory. Nothing was exported.');
    if (!globalThis.crypto?.subtle) throw new Error('This browser cannot verify publisher notices. Use a current browser over HTTPS.');
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
    if (digest !== notice.sha256) throw new Error('The publisher notice checksum differs from the verified source inventory. Nothing was exported.');
    notices.set(edition.id, { ...notice });
  }
  return notices;
}

/** Source quotations and private writing remain separate; absent wording is never invented. */
export async function gospelStudyMarkdown(value: GospelStudyRow, sources: GospelStudySources): Promise<string> {
  const row = validateGospelStudyRow(value);
  const passages = await Promise.all(row.passages.map(passage => loadSavedGospelPassage(passage, sources)));
  const sourceIdentities = passages.map(source => JSON.stringify(source.edition));
  const permitted = new Set<string>();
  for (const source of passages) {
    if (!permitted.has(source.edition.id)) {
      await sources.requirePermission(source.edition, 'documentExport');
      permitted.add(source.edition.id);
    }
  }
  const notices = await publisherNotices(passages, sources);
  const lines = [`# ${markdown(row.title)}`, '', 'PRIVATE GOSPEL STUDY · user-arranged reading ranges · not independently reviewed', '',
    'These passages are displayed together by the reader. Their placement does not establish equivalent events, chronology, wording or doctrine.', ''];
  for (let index = 0; index < passages.length; index++) {
    const source = passages[index], saved = row.passages[index];
    if (source.edition.id !== saved.reference.editionId || source.edition.sha256 !== saved.sourceSha256
      || source.edition.name !== saved.editionName || source.bookName !== saved.bookName || JSON.stringify(source.edition) !== sourceIdentities[index]) {
      throw new Error('The Gospel source identity changed while the notebook was being prepared. Nothing was exported.');
    }
    lines.push(`## ${markdown(label(saved))} · ${markdown(source.edition.name)}`, '', `Pane: ${row.selection.panes[index].linked ? 'linked Sower reading' : 'independent reading'}.`, '');
    for (const verse of source.verses) {
      lines.push(`> ${source.reference.chapter}:${verse.number} ${markdown(verse.text).replace(/\r?\n/g, '\n> ')}`, '');
    }
    if (source.gaps.length) {
      lines.push('Source numbering and gaps:', '');
      for (const gap of source.gaps) lines.push(`- ${source.reference.chapter}:${gap.number} — ${gap.reason === 'absent' ? 'No verse record in this edition.' : 'The numbered source record has no wording.'}`);
      lines.push('');
    }
    lines.push(markdown(source.attribution), '', `Source SHA-256: ${saved.sourceSha256}`, '');
  }
  lines.push('## Private notes · user writing', '', markdown(row.note), '', 'Prepared locally in Adigun-AiBible. Scripture wording remains tied to its named source revision.', '');
  for (const [editionId, notice] of notices) {
    const fenceLength = (notice.text.match(/`+/g) || []).reduce((maximum, run) => Math.max(maximum, run.length + 1), 3);
    const fence = '`'.repeat(fenceLength);
    lines.push(`## Complete publisher notice · ${markdown(editionId)}`, '', `${fence}text`, notice.text, fence, '', `Notice SHA-256: ${notice.sha256}`, '');
  }
  return lines.join('\n');
}

import { DEFAULT_EDITION_ID, validateReference } from './domain.ts';
import type { BookInfo, Preferences, Reference } from './types';

export const READING_POSITION_KEY = 'adigun-bible-reading-position';
export interface ReadingPosition {
  schemaVersion: 1;
  ref: Reference;
  preset?: Preferences['preset'];
  scrollY?: number;
}
export interface ReadingSelection {
  source: 'link' | 'saved' | 'default' | 'invalid-link';
  position: ReadingPosition | null;
}
const presets: readonly string[] = ['genz', 'en', 'de', 'yo', 'pcm'];
const views = new Set(['home', 'read', 'compare', 'discover', 'plans', 'saved', 'questions', 'library', 'sources', 'settings', 'share', 'atlas', 'study', 'evidence', 'editions', 'projection', 'tools', 'family', 'audio', 'drop', 'support', 'widget', 'ministry', 'speakers', 'editorial-workbench']);

function validatePosition(value: unknown, books: BookInfo[], editionId: string): ReadingPosition | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const p = value as Record<string, unknown>;
  if (p.schemaVersion !== 1 || !validateReference(p.ref, books, editionId)) return null;
  if (p.preset !== undefined && (typeof p.preset !== 'string' || !presets.includes(p.preset))) return null;
  if (p.scrollY !== undefined && (typeof p.scrollY !== 'number' || !Number.isFinite(p.scrollY) || p.scrollY < 0 || p.scrollY > 10_000_000)) return null;
  const r = p.ref;
  return {
    schemaVersion: 1,
    ref: { bookId: r.bookId, chapter: r.chapter, verse: r.verse, ...(r.endVerse !== undefined ? { endVerse: r.endVerse } : {}), ...(r.editionId !== undefined ? { editionId: r.editionId } : {}) },
    ...(p.preset !== undefined ? { preset: p.preset as Preferences['preset'] } : {}),
    ...(p.scrollY !== undefined ? { scrollY: p.scrollY as number } : {})
  };
}

// These helpers never read browser storage or change navigation; callers handle denied storage.
export function readReadingPosition(raw: string | null | undefined, books: BookInfo[], editionId = DEFAULT_EDITION_ID): ReadingPosition | null {
  if (typeof raw !== 'string' || raw.length > 4096) return null;
  try { return validatePosition(JSON.parse(raw), books, editionId); } catch { return null; }
}

export function serializeReadingPosition(position: ReadingPosition, books: BookInfo[], editionId = DEFAULT_EDITION_ID): string | null {
  const valid = validatePosition(position, books, editionId);
  return valid ? JSON.stringify(valid) : null;
}

function integer(value: string): number {
  return /^\d+$/.test(value) ? Number(value) : NaN;
}

/** Resolve startup only: an explicit passage never silently falls back to another passage. */
export function resolveReadingPosition(hash: string, saved: ReadingPosition | null, books: BookInfo[], editionId = DEFAULT_EDITION_ID): ReadingSelection {
  // Section and library links may preserve the Bible location in query fields.
  if (/^#?\/law-diary(?:\/|\?|$)/.test(hash) || /^#?\/library(?:\?|$)/.test(hash)) {
    const q = new URLSearchParams(hash.split('?')[1]);
    if (q.has('book') || q.has('chapter')) {
      return resolveReadingPosition(`#/read/${q.get('book') || 'GEN'}/${q.get('chapter') || '1'}?${q}`, saved, books, editionId);
    }
  }
  const validSaved = validatePosition(saved, books, editionId);
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const question = raw.indexOf('?');
  const path = question < 0 ? raw : raw.slice(0, question);
  const pieces = path.split('/').filter(Boolean);
  if (views.has(pieces[0]) && pieces.length > 1) {
    const query = new URLSearchParams(question < 0 ? '' : raw.slice(question + 1));
    let bookId: string;
    try { bookId = decodeURIComponent(pieces[1]); } catch { return { source: 'invalid-link', position: null }; }
    const ref: Reference = {
      bookId,
      chapter: integer(pieces[2] ?? '1'),
      verse: integer(query.get('verse') ?? '1'),
      ...(query.has('end') ? { endVerse: integer(query.get('end')!) } : {}),
      editionId: query.get('edition') ?? editionId
    };
    if (pieces.length > 3 || !validateReference(ref, books, editionId)) return { source: 'invalid-link', position: null };
    // A linked passage must not inherit the saved passage's scroll offset.
    return { source: 'link', position: { schemaVersion: 1, ref, ...(validSaved?.preset ? { preset: validSaved.preset } : {}) } };
  }
  if (validSaved) return { source: 'saved', position: validSaved };
  const first = books[0];
  const ref: Reference = { bookId: first?.id ?? 'GEN', chapter: 1, verse: 1, editionId };
  return { source: 'default', position: validateReference(ref, books, editionId) ? { schemaVersion: 1, ref } : null };
}

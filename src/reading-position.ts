import { DEFAULT_EDITION_ID, validateReference } from './domain.ts';
import { parseRoute } from './routes.ts';
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

/** Resolve startup only: an explicit passage never silently falls back to another passage. */
export function resolveReadingPosition(hash: string, saved: ReadingPosition | null, books: BookInfo[], editionId = DEFAULT_EDITION_ID): ReadingSelection {
  const validSaved = validatePosition(saved, books, editionId);
  const route = parseRoute(hash);
  if (route.explicitPassage) {
    const ref: Reference = { ...route.ref, editionId: route.ref.editionId ?? editionId };
    if (!validateReference(ref, books, editionId)) return { source: 'invalid-link', position: null };
    // A linked passage must not inherit the saved passage's scroll offset.
    return { source: 'link', position: { schemaVersion: 1, ref, ...(validSaved?.preset ? { preset: validSaved.preset } : {}) } };
  }
  if (validSaved) return { source: 'saved', position: validSaved };
  const first = books[0];
  const ref: Reference = { bookId: first?.id ?? 'GEN', chapter: 1, verse: 1, editionId };
  return { source: 'default', position: validateReference(ref, books, editionId) ? { schemaVersion: 1, ref } : null };
}

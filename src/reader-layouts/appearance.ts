import type { SourceAppearance } from './model';

export const SOURCE_APPEARANCE_KEY = 'adigun-bible-source-appearance';
export function initialSourceAppearance(): SourceAppearance {
  try {
    const saved = JSON.parse(localStorage.getItem(SOURCE_APPEARANCE_KEY) || '{}');
    return { layout: saved?.layout === 'paragraphs' ? 'paragraphs' : 'verses', headings: saved?.headings !== false, notes: saved?.notes !== false, redLetters: saved?.redLetters === true };
  } catch { return { layout: 'verses', headings: true, notes: true, redLetters: false }; }
}

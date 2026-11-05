import type { Reference } from '../types';

export const gospelBooks = ['MAT', 'MRK', 'LUK', 'JHN'] as const;
export type GospelBookId = typeof gospelBooks[number];
export type GospelGroupId = 'sower';
export const gospelNames: Record<GospelBookId, string> = { MAT: 'Matthew', MRK: 'Mark', LUK: 'Luke', JHN: 'John' };
export interface GospelRange { chapter: number; verse: number; endVerse: number }
export interface GospelPane { bookId: GospelBookId; linked: boolean; independent: GospelRange & { editionId: string } }
export interface GospelSelection { groupId: GospelGroupId; editionId: string; panes: GospelPane[] }
export interface GospelReference extends Reference { bookId: GospelBookId; editionId: string; endVerse: number }

/** Reading ranges supplied in the project specification; no finer alignment is inferred. */
export const SOWER_RANGES: Readonly<Partial<Record<GospelBookId, Readonly<GospelRange>>>> = Object.freeze({
  MAT: Object.freeze({ chapter: 13, verse: 1, endVerse: 23 }),
  MRK: Object.freeze({ chapter: 4, verse: 1, endVerse: 20 }),
  LUK: Object.freeze({ chapter: 8, verse: 4, endVerse: 15 }),
});

const editionPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const ownQueryKey = (key: string) => key.startsWith('gospel');
const queryFields = ['Linked', 'Chapter', 'Verse', 'End', 'Edition'] as const;
const allowedKeys = new Set(['gospelGroup', 'gospelEdition', 'gospelBooks', ...gospelBooks.flatMap(book => queryFields.map(field => `gospel${book}${field}`))]);
function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${label}.`);
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[], label: string): void {
  if (Object.keys(value).some(key => !allowed.includes(key)) || allowed.some(key => !Object.hasOwn(value, key))) throw new Error(`Incomplete or unknown ${label} fields.`);
}
function edition(value: unknown): string {
  if (typeof value !== 'string' || !editionPattern.test(value)) throw new Error('Choose a valid Gospel source edition.');
  return value;
}
function bookId(value: unknown): GospelBookId {
  if (!(gospelBooks as readonly unknown[]).includes(value)) throw new Error('Gospel panes must name Matthew, Mark, Luke or John.');
  return value as GospelBookId;
}
function range(value: Record<string, unknown>): GospelRange {
  const { chapter, verse, endVerse } = value;
  if (!Number.isSafeInteger(chapter) || Number(chapter) < 1 || Number(chapter) > 150
    || !Number.isSafeInteger(verse) || Number(verse) < 1 || Number(verse) > 176
    || !Number.isSafeInteger(endVerse) || Number(endVerse) < Number(verse) || Number(endVerse) > 176) {
    throw new Error('Choose a valid, bounded Gospel chapter and complete verse range.');
  }
  return { chapter: Number(chapter), verse: Number(verse), endVerse: Number(endVerse) };
}
function pane(value: unknown): GospelPane {
  const row = record(value, 'Gospel pane'); keys(row, ['bookId', 'linked', 'independent'], 'Gospel pane');
  const id = bookId(row.bookId);
  if (typeof row.linked !== 'boolean') throw new Error('A Gospel pane must explicitly be linked or independent.');
  if (row.linked && !SOWER_RANGES[id]) throw new Error('The supplied Sower group has no John passage. Choose an independent John range.');
  const independent = record(row.independent, 'independent Gospel range');
  keys(independent, ['chapter', 'verse', 'endVerse', 'editionId'], 'independent Gospel range');
  return { bookId: id, linked: row.linked, independent: { ...range(independent), editionId: edition(independent.editionId) } };
}

export function validateGospelReference(value: unknown): GospelReference {
  const row = record(value, 'Gospel reference'); keys(row, ['bookId', 'chapter', 'verse', 'endVerse', 'editionId'], 'Gospel reference');
  return { bookId: bookId(row.bookId), ...range(row), editionId: edition(row.editionId) };
}
export function validateGospelSelection(value: unknown): GospelSelection {
  const row = record(value, 'Gospel selection'); keys(row, ['groupId', 'editionId', 'panes'], 'Gospel selection');
  if (row.groupId !== 'sower') throw new Error('This Gospel reading group is unavailable.');
  if (!Array.isArray(row.panes) || row.panes.length < 2 || row.panes.length > 4) throw new Error('Choose two to four Gospel panes.');
  const panes = row.panes.map(pane);
  if (new Set(panes.map(value => value.bookId)).size !== panes.length) throw new Error('A Gospel book can appear in only one pane.');
  return { groupId: 'sower', editionId: edition(row.editionId), panes };
}
export function defaultGospelSelection(editionId: string): GospelSelection {
  return validateGospelSelection({ groupId: 'sower', editionId, panes: (['MAT', 'MRK', 'LUK'] as const).map(bookId => ({ bookId, linked: true, independent: { ...SOWER_RANGES[bookId], editionId } })) });
}
export function resolvePaneReference(selection: GospelSelection, selectedPane: GospelPane): GospelReference {
  const clean = validateGospelSelection(selection), selected = pane(selectedPane);
  if (!clean.panes.some(value => value.bookId === selected.bookId)) throw new Error('This Gospel pane is not in the current workspace.');
  const selectedRange = selected.linked ? { ...SOWER_RANGES[selected.bookId], editionId: clean.editionId } : selected.independent;
  return validateGospelReference({ bookId: selected.bookId, ...selectedRange });
}
export function setPaneLinked(selection: GospelSelection, id: GospelBookId, linked: boolean): GospelSelection {
  const clean = validateGospelSelection(selection), selected = clean.panes.find(value => value.bookId === id);
  if (!selected || typeof linked !== 'boolean') throw new Error('Choose an existing Gospel pane and link state.');
  if (linked && !SOWER_RANGES[id]) throw new Error('The supplied Sower group has no John passage. John remains independent.');
  if (selected.linked === linked) return clean;
  const effective = resolvePaneReference(clean, selected);
  return validateGospelSelection({ ...clean, panes: clean.panes.map(value => value.bookId !== id ? value : {
    ...value, linked, independent: linked ? value.independent : { chapter: effective.chapter, verse: effective.verse, endVerse: effective.endVerse, editionId: effective.editionId },
  }) });
}
export function gospelReferenceKey(reference: GospelReference): string {
  const ref = validateGospelReference(reference);
  return JSON.stringify([ref.editionId, ref.bookId, ref.chapter, ref.verse, ref.endVerse]);
}

function integer(value: string | null): number {
  if (value === null || !/^[1-9]\d{0,2}$/.test(value)) throw new Error('The Gospel link contains an invalid chapter or verse number.');
  return Number(value);
}
export function readGospelSelection(hash: string, defaultEditionId: string): GospelSelection {
  if (hash.length > 16_384) throw new Error('This Gospel link is too long.');
  const separator = hash.indexOf('?'), params = new URLSearchParams(separator < 0 ? '' : hash.slice(separator + 1));
  const owned = [...params.keys()].filter(ownQueryKey);
  if (!owned.length) return defaultGospelSelection(defaultEditionId);
  for (const key of owned) {
    if (!allowedKeys.has(key)) throw new Error('The Gospel link contains an unknown selection field.');
    if (params.getAll(key).length !== 1) throw new Error('The Gospel link repeats a selection field.');
  }
  if (!params.has('gospelGroup') || !params.has('gospelEdition') || !params.has('gospelBooks')) throw new Error('The Gospel link has incomplete group, edition or pane information.');
  if (params.get('gospelGroup') !== 'sower') throw new Error('This Gospel reading group is unavailable.');
  const editionId = edition(params.get('gospelEdition')), books = params.get('gospelBooks')!.split(',').map(bookId);
  if (books.length < 2 || books.length > 4 || new Set(books).size !== books.length) throw new Error('The Gospel link must select two to four distinct books.');
  for (const id of gospelBooks) if (!books.includes(id) && queryFields.some(field => params.has(`gospel${id}${field}`))) throw new Error('The Gospel link has fields for a pane that is not selected.');
  const panes = books.map(id => {
    const prefix = `gospel${id}`, hasFields = queryFields.some(field => params.has(`${prefix}${field}`));
    if (!hasFields) {
      if (!SOWER_RANGES[id]) throw new Error('A John pane needs an explicit independent passage.');
      return { bookId: id, linked: true, independent: { ...SOWER_RANGES[id]!, editionId } };
    }
    const linkedValue = params.get(`${prefix}Linked`);
    if (linkedValue !== '0' && linkedValue !== '1') throw new Error('The Gospel link must explicitly identify linked and independent panes.');
    const fields = ['Chapter', 'Verse', 'End', 'Edition'];
    const provided = fields.filter(field => params.has(`${prefix}${field}`)).length;
    if ((provided > 0 && provided !== fields.length) || (linkedValue === '0' && provided !== fields.length)) throw new Error('The Gospel link contains an incomplete independent passage.');
    if (!provided && !SOWER_RANGES[id]) throw new Error('The supplied Sower group has no John passage.');
    return { bookId: id, linked: linkedValue === '1', independent: provided ? {
      chapter: integer(params.get(`${prefix}Chapter`)), verse: integer(params.get(`${prefix}Verse`)), endVerse: integer(params.get(`${prefix}End`)), editionId: edition(params.get(`${prefix}Edition`)),
    } : { ...SOWER_RANGES[id]!, editionId } };
  });
  return validateGospelSelection({ groupId: 'sower', editionId, panes });
}
export function withGospelSelection(hash: string, selection: GospelSelection): string {
  const clean = validateGospelSelection(selection), separator = hash.indexOf('?');
  const path = separator < 0 ? hash : hash.slice(0, separator), query = separator < 0 ? '' : hash.slice(separator + 1);
  const untouched = query ? query.split('&').filter(part => !ownQueryKey(new URLSearchParams(part).keys().next().value || '')) : [];
  const params = new URLSearchParams({ gospelGroup: clean.groupId, gospelEdition: clean.editionId, gospelBooks: clean.panes.map(value => value.bookId).join(',') });
  for (const value of clean.panes) {
    const prefix = `gospel${value.bookId}`;
    params.set(`${prefix}Linked`, value.linked ? '1' : '0'); params.set(`${prefix}Chapter`, String(value.independent.chapter));
    params.set(`${prefix}Verse`, String(value.independent.verse)); params.set(`${prefix}End`, String(value.independent.endVerse)); params.set(`${prefix}Edition`, value.independent.editionId);
  }
  return `${path}?${[...untouched, params.toString()].join('&')}`;
}

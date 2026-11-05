export interface HistoricalUnit { number: number; text: string }
export interface HistoricalChapter { number: number; units: HistoricalUnit[] }
export interface HistoricalWork { schemaVersion: 1; id: string; title: string; editionId: string; language: string; sourceRevision: string; chapters: HistoricalChapter[] }
export interface HistoricalEdition {
  id: string; workId: string; title: string; translator: string; language: string;
  classification: string; canonScope: string; authorship: string; dating: string; survival: string;
  sourceUrl: string; sourceRevision: string; attribution: string; license: string; licenseUrl: string;
  rightsEvidence: { label: string; url: string; note: string }[];
  rights: { display: boolean; search: boolean; offline: boolean; export: boolean };
  path: string; sha256: string; bytes: number; chapters: number; units: number; noticePath: string;
  transcriptionStatus: string;
}
export interface HistoricalManifest { schemaVersion: 1; editions: HistoricalEdition[] }
export interface HistoricalLocator { workId: string; editionId: string; sourceRevision: string; chapter: number; unit: number }
export interface HistoricalNote { id: string; locator: HistoricalLocator; text: string; updatedAt: string }
export interface HistoricalStudy { kind: 'adigun-historical-notebook'; schemaVersion: 1; revision: number; notes: HistoricalNote[]; bookmarks: HistoricalLocator[] }
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{1,79}$/.test(value);
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const https = (value: unknown): value is string => { try { const url = new URL(String(value)); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; } };
const string = (value: unknown, limit = 5000): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= limit;
export function validateHistoricalManifest(value: unknown): HistoricalManifest {
  if (!object(value) || value.schemaVersion !== 1 || !Array.isArray(value.editions) || value.editions.length > 100) throw new Error('Historical edition inventory is invalid.');
  const ids = new Set<string>();
  for (const entry of value.editions) {
    if (!object(entry) || !identifier(entry.id) || !identifier(entry.workId) || ids.has(entry.id)) throw new Error('Historical edition identity is invalid.');
    ids.add(entry.id);
    for (const key of ['title','translator','language','classification','canonScope','authorship','dating','survival','sourceRevision','attribution','license','transcriptionStatus']) if (!string(entry[key])) throw new Error(`Missing historical metadata: ${key}`);
    if (!https(entry.sourceUrl) || !https(entry.licenseUrl) || !/^[a-f0-9]{64}$/.test(String(entry.sha256)) || !integer(entry.bytes) || entry.bytes > 5_000_000 || !integer(entry.chapters) || entry.chapters > 1000 || !integer(entry.units) || entry.units > 100_000) throw new Error('Historical source verification metadata is invalid.');
    for (const key of ['path','noticePath']) if (typeof entry[key] !== 'string' || !/^data\/historical\/[a-z0-9][a-z0-9-]*\.(?:json|txt)$/.test(entry[key] as string)) throw new Error('Historical file path is outside this application.');
    if (!object(entry.rights) || ['display','search','offline','export'].some(key => typeof (entry.rights as Record<string, unknown>)[key] !== 'boolean')) throw new Error('Historical permissions are not specified.');
    if (!Array.isArray(entry.rightsEvidence) || !entry.rightsEvidence.length || entry.rightsEvidence.some(evidence => !object(evidence) || !string(evidence.label) || !https(evidence.url) || !string(evidence.note))) throw new Error('Historical rights evidence is missing.');
  }
  return value as unknown as HistoricalManifest;
}
export function validateHistoricalWork(value: unknown, edition: HistoricalEdition): HistoricalWork {
  if (!edition.rights.display) throw new Error('Display permission for this historical edition is unavailable.');
  if (!object(value) || value.schemaVersion !== 1 || value.id !== edition.workId || value.editionId !== edition.id || value.language !== edition.language || value.sourceRevision !== edition.sourceRevision || !string(value.title) || !Array.isArray(value.chapters) || value.chapters.length !== edition.chapters) throw new Error('The historical text does not match its edition.');
  let total = 0;
  for (const [index, chapter] of value.chapters.entries()) {
    if (!object(chapter) || chapter.number !== index + 1 || !Array.isArray(chapter.units) || !chapter.units.length) throw new Error('Historical chapter inventory is invalid.');
    for (const [unitIndex, unit] of chapter.units.entries()) if (!object(unit) || unit.number !== unitIndex + 1 || !string(unit.text, 100_000)) throw new Error('Historical source units are missing or duplicated.');
    total += chapter.units.length;
  }
  if (total !== edition.units) throw new Error('Historical source coverage does not match the manifest.');
  return value as unknown as HistoricalWork;
}
export async function verifyHistoricalBytes(bytes: ArrayBuffer, edition: HistoricalEdition): Promise<HistoricalWork> {
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('');
  if (bytes.byteLength !== edition.bytes || hash !== edition.sha256) throw new Error('The historical text failed its edition checksum. Update and retry; no substitute text was shown.');
  return validateHistoricalWork(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), edition);
}
export function locatorKey(locator: HistoricalLocator): string { return `${locator.workId}:${locator.editionId}:${locator.sourceRevision}:${locator.chapter}:${locator.unit}`; }
export function validateHistoricalLocator(value: unknown): HistoricalLocator {
  if (!object(value) || !identifier(value.workId) || !identifier(value.editionId) || !string(value.sourceRevision, 100) || !/^[a-z0-9-]+$/.test(value.sourceRevision) || !integer(value.chapter) || value.chapter > 1000 || !integer(value.unit) || value.unit > 10000) throw new Error('Historical note reference is invalid.');
  return { workId: value.workId, editionId: value.editionId, sourceRevision: value.sourceRevision, chapter: value.chapter, unit: value.unit };
}
export function emptyHistoricalStudy(): HistoricalStudy { return { kind: 'adigun-historical-notebook', schemaVersion: 1, revision: 0, notes: [], bookmarks: [] }; }
export function validateHistoricalStudy(value: unknown): HistoricalStudy {
  if (!object(value) || value.kind !== 'adigun-historical-notebook' || value.schemaVersion !== 1 || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0 || !Array.isArray(value.notes) || value.notes.length > 2000 || !Array.isArray(value.bookmarks) || value.bookmarks.length > 5000) throw new Error('Historical study backup is invalid. Existing records were not changed.');
  const ids = new Set<string>();
  const notes = value.notes.map(item => {
    if (!object(item) || !string(item.id, 100) || !/^[a-zA-Z0-9-]+$/.test(item.id) || ids.has(item.id) || !string(item.text, 10000) || !string(item.updatedAt, 40) || !Number.isFinite(Date.parse(item.updatedAt))) throw new Error('Historical note is invalid or duplicated.');
    ids.add(item.id);
    return { id: item.id, locator: validateHistoricalLocator(item.locator), text: item.text, updatedAt: item.updatedAt };
  });
  const bookmarks = value.bookmarks.map(validateHistoricalLocator);
  if (new Set(bookmarks.map(locatorKey)).size !== bookmarks.length) throw new Error('Historical bookmarks contain duplicates.');
  return { kind: 'adigun-historical-notebook', schemaVersion: 1, revision: value.revision as number, notes, bookmarks };
}
export function searchHistorical(work: HistoricalWork, query: string): { chapter: number; unit: number; text: string }[] {
  const normalize = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase().replace(/\s+/g, ' ');
  const needle = normalize(query).trim();
  if (!needle || needle.length > 200) return [];
  return work.chapters.flatMap(chapter => chapter.units.filter(unit => normalize(unit.text).includes(needle)).map(unit => ({ chapter: chapter.number, unit: unit.number, text: unit.text })));
}
export function historicalPlainText(work: HistoricalWork, edition: HistoricalEdition): string {
  if (!edition.rights.export) throw new Error('Export permission for this historical edition is unavailable.');
  return `${work.title}\n${edition.translator}\n${edition.classification}\n${edition.canonScope}\n\n${work.chapters.map(chapter => `CHAPTER ${chapter.number}\n\n${chapter.units.map(unit => `${chapter.number}:${unit.number} ${unit.text}`).join('\n\n')}`).join('\n\n')}\n\n${edition.attribution}\nSource: ${edition.sourceUrl}\nRevision: ${edition.sourceRevision}\nLicense: ${edition.license}\n${edition.licenseUrl}\n\n${edition.transcriptionStatus}\n`;
}

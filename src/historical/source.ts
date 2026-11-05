import rawManifest from '../../data/historical/manifest.json';
import { validateHistoricalManifest, validateHistoricalWork } from './model.ts';
import type { HistoricalWork } from './model';
export const historicalManifest = validateHistoricalManifest(rawManifest);
const base = import.meta.env?.BASE_URL || '/Adigun-AiBible/';
const cache = new Map<string, Promise<HistoricalWork>>();
export async function loadHistoricalWork(editionId: string): Promise<HistoricalWork> {
  const edition = historicalManifest.editions.find(item => item.id === editionId);
  if (!edition || !edition.rights.display) throw new Error('This historical edition is not available for reading.');
  if (!cache.has(editionId)) cache.set(editionId, (async () => {
    const response = await fetch(`${base}${edition.path}`);
    if (!response.ok) throw new Error('This historical text is not cached. Reconnect to open or download it.');
    const bytes = await response.arrayBuffer();
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('');
    if (bytes.byteLength !== edition.bytes || hash !== edition.sha256) throw new Error('The historical text failed its edition checksum. Update and retry; no substitute text was shown.');
    return validateHistoricalWork(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), edition);
  })().catch(error => { cache.delete(editionId); throw error; }));
  return cache.get(editionId)!;
}
export function historicalDownloadPaths(editionId: string): string[] {
  const edition = historicalManifest.editions.find(item => item.id === editionId);
  if (!edition || !edition.rights.offline) throw new Error('Offline permission is unavailable for this historical edition.');
  return ['data/historical/manifest.json', edition.path, edition.noticePath];
}

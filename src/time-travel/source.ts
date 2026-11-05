import { assetUrl, getBook, getManifest } from '../data';
import { getOfflineManifest } from '../offline';
import { requirePermission } from '../permissions';
import type { Edition } from '../types';
import { tourNoticePath } from './model';
import type { TourDependencies, TourNotice } from './model';

async function getNotice(edition: Edition, signal?: AbortSignal): Promise<TourNotice> {
  const path = tourNoticePath(edition), inventory = await getOfflineManifest(assetUrl(''));
  if (signal?.aborted) throw new Error('Pack preparation cancelled.');
  const expected = inventory.files[path];
  if (!expected || expected.bytes < 1 || expected.bytes > 256_000) throw new Error('The complete publisher notice is unavailable in this build. Nothing was exported.');
  const response = await fetch(assetUrl(path), { signal });
  if (!response.ok || response.headers.get('content-type')?.includes('text/html')) throw new Error('The complete publisher notice is not downloaded. Reconnect and retry before exporting.');
  const bytes = await response.arrayBuffer();
  if (signal?.aborted) throw new Error('Pack preparation cancelled.');
  if (bytes.byteLength !== expected.bytes) throw new Error('The publisher notice size differs from the verified source inventory. Nothing was exported.');
  // Keep BOMs and source whitespace intact so the model can verify the exact UTF-8 bytes.
  return { path, text: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes), sha256: expected.sha256, bytes: expected.bytes };
}

export const tourDependencies: TourDependencies = { getBook, getManifest, requirePermission, getNotice };

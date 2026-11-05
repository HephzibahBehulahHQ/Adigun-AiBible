import { assetUrl, getBook, getManifest } from '../data';
import { getOfflineManifest } from '../offline';
import { requirePermission } from '../permissions';
import { readSourceBytes } from '../source-codec';
import type { Edition } from '../types';
import type { GospelStudyNotice, GospelStudySources } from './study-source';

async function getNotice(edition: Edition): Promise<GospelStudyNotice> {
  if (!edition.noticePath || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(edition.noticePath)
    || edition.noticePath.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('The complete publisher notice is unavailable in this release. Nothing was exported.');
  }
  const path = `data/editions/${edition.noticePath}`, inventory = await getOfflineManifest(assetUrl(''));
  const expected = inventory.files[path];
  if (!expected || expected.bytes < 1 || expected.bytes > 256_000) throw new Error('The complete publisher notice is unavailable in this release. Nothing was exported.');
  const response = await fetch(assetUrl(path));
  if (!response.ok || response.headers.get('content-type')?.toLowerCase().includes('text/html')) {
    throw new Error('The publisher notice is not downloaded. Reconnect before exporting this source.');
  }
  const bytes = await readSourceBytes(response, expected.bytes);
  return { path, text: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes), bytes: expected.bytes, sha256: expected.sha256 };
}

export const gospelStudySources: GospelStudySources = { getBook, getManifest, requirePermission, getNotice };

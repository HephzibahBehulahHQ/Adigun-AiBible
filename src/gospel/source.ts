import { assetUrl, editionDataPath, getBook, getManifest } from '../data';
import { getOfflineManifest } from '../offline';
import { requirePermission } from '../permissions';
import { readSourceBytes } from '../source-codec';
import type { Edition } from '../types';
import type { SavedPassage } from '../reading-session/model';
import type { GospelSources } from './source-core';
import { resolveGospelSource } from './source-core';

async function getNotice(edition: Edition) {
  const path = `data/editions/${edition.noticePath}`, inventory = await getOfflineManifest(assetUrl(''));
  const expected = inventory.files[path];
  if (!edition.noticePath || !expected || expected.bytes < 1 || expected.bytes > 256_000) throw new Error('The complete publisher notice is unavailable in this release. Nothing was exported.');
  const response = await fetch(assetUrl(path));
  if (!response.ok || response.headers.get('content-type')?.includes('text/html')) throw new Error('The publisher notice is not downloaded. Reconnect before exporting this source.');
  const bytes = await readSourceBytes(response, expected.bytes);
  return { path, text: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes), bytes: expected.bytes, sha256: expected.sha256 };
}
export const gospelSources: GospelSources = { getBook, getManifest, requirePermission, getNotice };
export async function gospelDownloadPlan(passages: SavedPassage[]) {
  const paths = new Set(['data/manifest.json', 'data/editions/catalog.json', 'data/editions/rights-register.json']);
  for (const passage of passages) {
    const source = await resolveGospelSource(passage.reference, gospelSources, passage);
    await requirePermission(source.edition, 'offline');
    paths.add(editionDataPath(source.edition.id, 'manifest.json'));
    paths.add(editionDataPath(source.edition.id, `books/${passage.reference.bookId}.json`));
    // A complete notice accompanies every non-baseline source pack.
    if (source.edition.noticePath) paths.add(`data/editions/${source.edition.noticePath}`);
    else if (source.edition.id !== 'eng-web') throw new Error('The complete source notice is unavailable. This edition cannot be downloaded here.');
  }
  const inventory = await getOfflineManifest(assetUrl(''));
  let bytes = 0;
  for (const path of paths) {
    if (!inventory.files[path]) throw new Error('A required Gospel source or rights file is absent from the verified download inventory.');
    bytes += inventory.files[path].bytes;
  }
  return { paths: [...paths], bytes };
}

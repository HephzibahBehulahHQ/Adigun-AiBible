import { assetUrl, editionDataPath, getBook, getManifest } from '../data';
import { getOfflineManifest } from '../offline';
import { requirePermission } from '../permissions';
import type { SavedPassage } from '../reading-session/model';
import type { GospelSources } from './source-core';
import { resolveGospelSource } from './source-core';

export const gospelSources: GospelSources = { getBook, getManifest, requirePermission };
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

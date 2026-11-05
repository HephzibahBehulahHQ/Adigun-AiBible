import { assetUrl, getBook, getManifest, getQuran } from '../data';
import { requirePermission } from '../permissions';
import { bibleSnapshot } from '../editorial-workbench/source-core';
import type { Edition, Reference } from '../types';
import { createPassagePackage as createPackage, verifyPassagePackage as verifyPackage } from './source-core';
export { passagePackageText } from './source-core';

async function getNotice(edition: Edition): Promise<string> {
  const path = edition.noticePath;
  if (!path || !path.startsWith(`${edition.id}/`) || !/^[A-Za-z0-9][A-Za-z0-9._-]*\/NOTICE\.txt$/.test(path)) throw new Error('This source notice path is invalid.');
  const response = await fetch(assetUrl(`data/editions/${path}`));
  if (!response.ok || response.headers.get('content-type')?.includes('text/html')) throw new Error('Download the complete publisher notice before sharing this edition.');
  return response.text();
}
const sources = { getManifest, getBook, getQuran, getNotice, requirePermission };
export const resolveRoomPassage = (ref: Reference) => bibleSnapshot(ref, sources);
export const createPassagePackage = (ref: Reference) => createPackage(ref, sources);
export const verifyPassagePackage = (bytes: Uint8Array) => verifyPackage(bytes, sources);

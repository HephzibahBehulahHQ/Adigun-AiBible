import { assetUrl, getBook, getManifest, getQuran } from '../data';
import { requirePermission } from '../permissions';
import { stableStringify } from '../editorial';
import { bibleSnapshot, sourceLabel, sourceReference } from '../editorial-workbench/source-core';
import { validateSnapshot } from '../editorial-workbench/model';
import type { SourceSnapshot } from '../editorial-workbench/model';
import type { Edition, Reference } from '../types';
import { MAX_PACK_BYTES } from './protocol';
async function getNotice(edition:Edition):Promise<string>{
  const path=edition.noticePath;if(!path||!path.startsWith(`${edition.id}/`)||!/^[A-Za-z0-9][A-Za-z0-9._-]*\/NOTICE\.txt$/.test(path))throw new Error('This source notice path is invalid.');
  const response=await fetch(assetUrl(`data/editions/${path}`));if(!response.ok||response.headers.get('content-type')?.includes('text/html'))throw new Error('Download the complete publisher notice before sharing this edition.');return response.text();
}
const sources={getManifest,getBook,getQuran,getNotice,requirePermission};
export const resolveRoomPassage=(ref:Reference)=>bibleSnapshot(ref,sources);
export async function createPassagePackage(ref:Reference):Promise<{title:string;bytes:Uint8Array}>{
  const snapshot=await bibleSnapshot(ref,sources,'peerSharing'),edition=(await getManifest(snapshot.editionId)).edition;
  await requirePermission(edition,'documentExport');await requirePermission(edition,'offline');
  const bytes=new TextEncoder().encode(JSON.stringify({kind:'adigun-nearby-passage',schemaVersion:1,source:snapshot}));
  if(bytes.byteLength>MAX_PACK_BYTES)throw new Error('Select a shorter passage; this package exceeds 250 KB.');return {title:sourceLabel(snapshot),bytes};
}
/** A remote peer cannot make its own hashes authoritative. Re-resolve against installed source. */
export async function verifyPassagePackage(bytes:Uint8Array):Promise<SourceSnapshot>{
  if(bytes.byteLength>MAX_PACK_BYTES)throw new Error('This passage package exceeds 250 KB.');
  const value:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid passage package.');
  const row=value as Record<string,unknown>;
  if(row.kind!=='adigun-nearby-passage'||row.schemaVersion!==1||Object.keys(row).sort().join(',')!=='kind,schemaVersion,source')throw new Error('Only attributed source passage packages are supported.');
  const source=validateSnapshot(row.source);if(source.corpus!=='bible')throw new Error('This pilot transfers installed Bible passages only.');
  const actual=await bibleSnapshot(sourceReference(source),sources,'peerSharing'),edition=(await getManifest(source.editionId)).edition;
  await requirePermission(edition,'offline');await requirePermission(edition,'documentExport');
  if(stableStringify(actual)!==stableStringify(source))throw new Error('The remote passage differs from this app’s verified edition, rights notice or source revision. It was rejected.');
  return actual;
}
export function passagePackageText(source:SourceSnapshot):string{return [sourceLabel(source),'',...source.units.map(u=>`${u.number}. ${u.text}`),'',source.attribution,...source.conditions,source.notice,`Edition source SHA-256: ${source.editionSha256}`].filter(Boolean).join('\n');}

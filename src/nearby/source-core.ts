import { stableStringify } from '../editorial.ts';
import { bibleSnapshot, sourceLabel, sourceReference } from '../editorial-workbench/source-core.ts';
import type { WorkbenchSources } from '../editorial-workbench/source-core';
import { validateSnapshot } from '../editorial-workbench/model.ts';
import type { SourceSnapshot } from '../editorial-workbench/model';
import type { Reference } from '../types';
import { MAX_PACK_BYTES } from './protocol.ts';

async function checkPackageRights(source: SourceSnapshot, sources: WorkbenchSources): Promise<void> {
  const edition = (await sources.getManifest(source.editionId)).edition;
  if (edition.id !== source.editionId || edition.sha256 !== source.editionSha256) throw new Error('The source revision changed while preparing this passage package. Try again from one verified revision.');
  for (const operation of ['display', 'peerSharing', 'redistribution', 'documentExport', 'offline'] as const) await sources.requirePermission(edition, operation);
}

export async function createPassagePackage(ref: Reference, sources: WorkbenchSources): Promise<{ title: string; bytes: Uint8Array }> {
  const snapshot = await bibleSnapshot(ref, sources, 'peerSharing');
  await checkPackageRights(snapshot, sources);
  const bytes = new TextEncoder().encode(JSON.stringify({ kind: 'adigun-nearby-passage', schemaVersion: 1, source: snapshot }));
  if (bytes.byteLength > MAX_PACK_BYTES) throw new Error('Select a shorter passage; this package exceeds 250 KB.');
  return { title: sourceLabel(snapshot), bytes };
}

/** A remote peer cannot make its own hashes or permission claims authoritative. */
export async function verifyPassagePackage(bytes: Uint8Array, sources: WorkbenchSources): Promise<SourceSnapshot> {
  if (bytes.byteLength > MAX_PACK_BYTES) throw new Error('This passage package exceeds 250 KB.');
  const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid passage package.');
  const row = value as Record<string, unknown>;
  if (row.kind !== 'adigun-nearby-passage' || row.schemaVersion !== 1 || Object.keys(row).sort().join(',') !== 'kind,schemaVersion,source') throw new Error('Only attributed source passage packages are supported.');
  const source = validateSnapshot(row.source);
  if (source.corpus !== 'bible') throw new Error('This pilot transfers installed Bible passages only.');
  const actual = await bibleSnapshot(sourceReference(source), sources, 'peerSharing');
  await checkPackageRights(actual, sources);
  if (stableStringify(actual) !== stableStringify(source)) throw new Error('The remote passage differs from this app’s verified edition, rights notice or source revision. It was rejected.');
  return actual;
}

export function passagePackageText(source: SourceSnapshot): string {
  return [sourceLabel(source), '', ...source.units.map(unit => `${unit.number}. ${unit.text}`), '', source.attribution, ...source.conditions, source.notice, `Edition source SHA-256: ${source.editionSha256}`].filter(Boolean).join('\n');
}

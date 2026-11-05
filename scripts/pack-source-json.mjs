import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { SOURCE_ENVELOPE_KIND, SOURCE_JSON_MAX_BYTES, SOURCE_GZIP_MAX_BYTES, SOURCE_MAX_EXPANSION_RATIO } from '../src/source-codec.ts';

export function sourceTransportEnabled(value = process.env.ADIGUN_SOURCE_TRANSPORT) {
  if (value === undefined || value === '' || value === 'off') return false;
  if (value === 'gzip-base64-v1') return true;
  throw new Error('ADIGUN_SOURCE_TRANSPORT must be off or gzip-base64-v1.');
}

export function packSourceJsonBytes(input) {
  const bytes = Buffer.from(input);
  if (!bytes.length || bytes.length > SOURCE_JSON_MAX_BYTES) throw new Error('Canonical source JSON exceeds the transport byte limit.');
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (!value || typeof value !== 'object' || value.kind === SOURCE_ENVELOPE_KIND) throw new Error('Only raw source objects or arrays can be packaged.');
  const compressed = gzipSync(bytes, { level: 6 });
  if (compressed.length > SOURCE_GZIP_MAX_BYTES || bytes.length > Math.max(1024, compressed.length * SOURCE_MAX_EXPANSION_RATIO)) throw new Error('Canonical source JSON exceeds the transport compression limits.');
  if (!gunzipSync(compressed, { maxOutputLength: SOURCE_JSON_MAX_BYTES }).equals(bytes)) throw new Error('Source compression changed canonical bytes.');
  const envelope = { kind: SOURCE_ENVELOPE_KIND, version: 1, encoding: 'gzip-base64', decodedBytes: bytes.length, decodedSha256: createHash('sha256').update(bytes).digest('hex'), payload: compressed.toString('base64') };
  return Buffer.from(JSON.stringify(envelope) + '\n');
}

/** Operates only on the disposable public build copy; never on canonical repository sources. */
export async function packSourceJson({ directory, enabled = sourceTransportEnabled() }) {
  const root = resolve(directory), summary = { enabled, files: 0, canonicalBytes: 0, transferredBytes: 0 };
  if (!enabled) return summary;
  async function walk(path) {
    for (const entry of (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = resolve(path, entry.name);
      if (entry.isDirectory()) { await walk(file); continue; }
      if (!entry.isFile()) throw new Error('Source packaging does not follow links or special files.');
      const name = relative(root, file).replaceAll('\\', '/');
      if (!/(^|\/)books\/[1-3]?[A-Z]{2,3}\.json$/.test(name) && !/(^|\/)search-index\.json$/.test(name)) continue;
      const canonical = await readFile(file), packed = packSourceJsonBytes(canonical);
      await writeFile(file, packed);
      summary.files++; summary.canonicalBytes += canonical.length; summary.transferredBytes += packed.length;
    }
  }
  await walk(root);
  return summary;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  console.log(await packSourceJson({ directory: resolve(import.meta.dirname, '../public/data') }));
}

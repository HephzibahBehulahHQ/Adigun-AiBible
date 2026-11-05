import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile, realpath, stat, rename, rm, mkdir, mkdtemp } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { SOURCE_ENVELOPE_KIND, SOURCE_JSON_MAX_BYTES, SOURCE_GZIP_MAX_BYTES, SOURCE_MAX_EXPANSION_RATIO, decodeSourceJsonBytes } from '../src/source-codec.ts';

const isSourcePayload = name => /(^|\/)books\/[1-3]?[A-Z]{2,3}\.json$/.test(name) || /(^|\/)search-index\.json$/.test(name);

/** A cancelled or failed preparation must never become a publicly copied asset. */
export async function assertNoSourceStaging(directory) {
  const leaked = (await readdir(directory)).filter(name => name.startsWith('.source-data-'));
  if (leaked.length) throw new Error('Unpublished source staging exists in the served asset directory. Stop the build and remove only confirmed inactive staging before retrying.');
}

export async function createSourceStagingDirectory(publicDirectory) {
  const publicRoot = await realpath(publicDirectory);
  await assertNoSourceStaging(publicRoot);
  // Keep incomplete data outside public even if the process ends before cleanup.
  return mkdtemp(resolve(publicRoot, '../.source-data-'));
}

export function sourceTransportEnabled(value = process.env.ADIGUN_SOURCE_TRANSPORT) {
  if (value === undefined || value === '' || value === 'off') return false;
  if (value === 'gzip-base64-v1') return true;
  throw new Error('ADIGUN_SOURCE_TRANSPORT must be off or gzip-base64-v1.');
}

export function packSourceJsonBytes(input) {
  if (!(input instanceof Uint8Array) || !input.byteLength || input.byteLength > SOURCE_JSON_MAX_BYTES) throw new Error('Canonical source JSON exceeds the transport byte limit.');
  const bytes = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (!value || typeof value !== 'object' || value.kind === SOURCE_ENVELOPE_KIND) throw new Error('Only raw source objects or arrays can be packaged.');
  const compressed = gzipSync(bytes, { level: 6 });
  if (compressed.length > SOURCE_GZIP_MAX_BYTES || bytes.length > Math.max(1024, compressed.length * SOURCE_MAX_EXPANSION_RATIO)) throw new Error('Canonical source JSON exceeds the transport compression limits.');
  if (!gunzipSync(compressed, { maxOutputLength: SOURCE_JSON_MAX_BYTES }).equals(bytes)) throw new Error('Source compression changed canonical bytes.');
  const envelope = { kind: SOURCE_ENVELOPE_KIND, version: 1, encoding: 'gzip-base64', decodedBytes: bytes.length, decodedSha256: createHash('sha256').update(bytes).digest('hex'), payload: compressed.toString('base64') };
  return Buffer.from(JSON.stringify(envelope) + '\n');
}

/** Create each disposable file once, directly from immutable canonical bytes. */
export async function copySourceContent({ sourceDirectory, directory, enabled = sourceTransportEnabled() }) {
  const sourceRoot = await realpath(sourceDirectory), targetRoot = await realpath(directory);
  if (targetRoot === sourceRoot || targetRoot.startsWith(sourceRoot + sep) || sourceRoot.startsWith(targetRoot + sep)) throw new Error('Source staging must be separate from canonical source files.');
  const summary = { enabled, files: 0, canonicalBytes: 0, transferredBytes: 0 };
  async function walk(source, target) {
    for (const entry of (await readdir(source, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const from = resolve(source, entry.name), to = resolve(target, entry.name);
      if (entry.isDirectory()) { await mkdir(to); await walk(from, to); continue; }
      if (!entry.isFile()) throw new Error('Source staging does not follow links or special files.');
      const name = relative(sourceRoot, from).replaceAll('\\', '/');
      if (/\.(zip|usfm|usx|xml)$/i.test(name) || name === 'editorial-published.json') continue;
      const bytes = await readFile(from), packed = enabled && isSourcePayload(name) ? packSourceJsonBytes(bytes) : bytes;
      await writeFile(to, packed, { flag: 'wx' });
      if (!(await readFile(to)).equals(packed)) throw new Error(`The staged source write did not persist: ${name}`);
      if (enabled && isSourcePayload(name)) { summary.files++; summary.canonicalBytes += bytes.length; summary.transferredBytes += packed.length; }
    }
  }
  await walk(sourceRoot, targetRoot);
  return summary;
}

/** Operates only on the disposable public build copy; never on canonical repository sources. */
export async function packSourceJson({ directory, enabled = sourceTransportEnabled() }) {
  const root = resolve(directory), summary = { enabled, files: 0, canonicalBytes: 0, transferredBytes: 0 };
  if (!enabled) return summary;
  const actual = await realpath(root), canonical = resolve(import.meta.dirname, '../data');
  if (actual === canonical || actual.startsWith(canonical + sep) || canonical.startsWith(actual + sep)) throw new Error('Refusing to package canonical repository sources. Use the disposable public build copy.');
  async function walk(path) {
    for (const entry of (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = resolve(path, entry.name);
      if (entry.isDirectory()) { await walk(file); continue; }
      if (!entry.isFile()) throw new Error('Source packaging does not follow links or special files.');
      const name = relative(root, file).replaceAll('\\', '/');
      if (!isSourcePayload(name)) continue;
      if ((await stat(file)).size > SOURCE_JSON_MAX_BYTES) throw new Error('Canonical source JSON exceeds the transport byte limit.');
      const canonical = await readFile(file), packed = packSourceJsonBytes(canonical);
      const staged = `${file}.transport-${process.pid}.tmp`;
      try {
        await writeFile(staged, packed, { flag: 'wx' });
        await rename(staged, file);
        if (!(await readFile(file)).equals(packed)) throw new Error(`The packaged source write did not persist: ${name}`);
      } finally { await rm(staged, { force: true }); }
      summary.files++; summary.canonicalBytes += canonical.length; summary.transferredBytes += packed.length;
    }
  }
  await walk(root);
  return summary;
}

/** Verify the final served artifact, including every source path and canonical decoded hash. */
export async function verifySourceJsonTransport({ directory, canonicalDirectory, enabled = sourceTransportEnabled() }) {
  const summary = { enabled, files: 0, canonicalBytes: 0, transferredBytes: 0 };
  if (!enabled) return summary;
  const sourceRoot = await realpath(canonicalDirectory), targetRoot = await realpath(directory);
  async function walk(path) {
    for (const entry of (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = resolve(path, entry.name);
      if (entry.isDirectory()) { await walk(file); continue; }
      if (!entry.isFile()) throw new Error('Source verification does not follow links or special files.');
      const name = relative(sourceRoot, file).replaceAll('\\', '/');
      if (!isSourcePayload(name)) continue;
      const [canonical, transferred] = await Promise.all([readFile(file), readFile(resolve(targetRoot, name))]);
      if (canonical.length > SOURCE_JSON_MAX_BYTES || transferred.length > SOURCE_JSON_MAX_BYTES) throw new Error(`Final source exceeds the byte limit: ${name}`);
      const envelope = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(transferred));
      if (envelope?.kind !== SOURCE_ENVELOPE_KIND) throw new Error(`Final source is not packaged: ${name}`);
      await decodeSourceJsonBytes(transferred);
      const expected = createHash('sha256').update(canonical).digest('hex');
      if (envelope.decodedBytes !== canonical.length || envelope.decodedSha256 !== expected) throw new Error(`Final source differs from the canonical bytes: ${name}`);
      summary.files++; summary.canonicalBytes += canonical.length; summary.transferredBytes += transferred.length;
    }
  }
  await walk(sourceRoot);
  if (!summary.files) throw new Error('No canonical source payloads were verified.');
  return summary;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  console.log(await packSourceJson({ directory: resolve(import.meta.dirname, '../public/data') }));
}

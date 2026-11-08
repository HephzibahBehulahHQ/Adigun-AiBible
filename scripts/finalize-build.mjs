import { readdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { verifySourceJsonTransport, assertNoSourceStaging } from './pack-source-json.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function inventory(directory, root = directory) {
  const files = {};
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) Object.assign(files, await inventory(path, root));
    else if (entry.isFile()) {
      const bytes = await readFile(path);
      files[relative(root, path).replaceAll('\\', '/')] = { sha256: digest(bytes), bytes: bytes.length };
    } else throw new Error(`Unsupported offline file: ${path}`);
  }
  return files;
}

// Kept self-contained so the generated worker has no network-loaded dependencies.
function serviceWorkerRuntime(config) {
  const { manifest, shellFiles } = config;
  const BASE = manifest.basePath, PREFIX = manifest.cachePrefix;
  const SHELL = `${PREFIX}shell-${manifest.buildVersion}`;
  const CONTENT = `${PREFIX}content-${manifest.contentVersion}`;
  const PACKS = `${PREFIX}pack-${manifest.contentVersion}-`;
  const MARKER = '__adigun_offline_pack__.json';
  const MAX_FILE_BYTES = 64 * 1024 * 1024;
  const absolute = path => new URL(BASE + path, self.location.origin).href;
  const essential = path => path.endsWith('/manifest.json') || path === 'data/editions/catalog.json' || path === 'data/editions/rights-register.json';
  const pathOf = request => {
    const url = new URL(typeof request === 'string' ? request : request.url);
    return url.origin === self.location.origin && url.pathname.startsWith(BASE) && !url.search ? url.pathname.slice(BASE.length) : null;
  };
  function abortIfNeeded(signal) {
    if (signal?.aborted) { const error = new Error('Source loading cancelled.'); error.name = 'AbortError'; throw error; }
  }
  async function sourceBytes(response, limit, signal) {
    if (!Number.isSafeInteger(limit) || limit < 0 || limit > MAX_FILE_BYTES) {
      if (response.body) void response.body.cancel().catch(() => undefined);
      throw new Error('Invalid source byte limit.');
    }
    abortIfNeeded(signal);
    if (!response.body) return new Uint8Array();
    const reader = response.body.getReader(), blocks = [];
    const blockSize = Math.max(1, Math.min(64 * 1024, limit));
    let block = new Uint8Array(blockSize), used = 0, total = 0;
    const cancel = () => { void reader.cancel().catch(() => undefined); };
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      while (true) {
        const { done, value } = await reader.read(); abortIfNeeded(signal);
        if (done) break;
        if (!(value instanceof Uint8Array) || total + value.byteLength > limit) throw new Error('Source response exceeds its pinned byte limit.');
        total += value.byteLength; let offset = 0;
        while (offset < value.byteLength) {
          const take = Math.min(blockSize - used, value.byteLength - offset);
          block.set(value.subarray(offset, offset + take), used); used += take; offset += take;
          if (used === blockSize) { blocks.push(block); block = new Uint8Array(blockSize); used = 0; }
        }
      }
    } catch (error) { void reader.cancel().catch(() => undefined); throw error; }
    finally { signal?.removeEventListener('abort', cancel); reader.releaseLock(); }
    const bytes = new Uint8Array(total); let offset = 0;
    for (const part of blocks) { bytes.set(part, offset); offset += part.byteLength; }
    bytes.set(block.subarray(0, used), offset); return bytes;
  }
  async function valid(response, file, path, signal) {
    if (signal?.aborted && response?.body) void response.body.cancel().catch(() => undefined);
    abortIfNeeded(signal);
    if (!response?.ok || response.type === 'opaque') throw new Error(`Unavailable source file: ${path}`);
    const bytes = await sourceBytes(response, file.bytes, signal);
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
    if (bytes.byteLength !== file.bytes || hash !== file.sha256) throw new Error(`Changed source file: ${path}`);
    abortIfNeeded(signal);
    if (/\.(json|webmanifest)$/.test(path)) {
      const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      if (!value || typeof value !== 'object') throw new Error(`Invalid source file: ${path}`);
    }
    return new Response(bytes.byteLength ? bytes : null, { status: response.status, statusText: response.statusText, headers: response.headers });
  }
  async function fresh(path, file, signal) {
    return valid(await fetch(absolute(path), { cache: 'no-store', signal }), file, path, signal);
  }
  async function packRecord(cache) {
    const response = await cache.match(absolute(MARKER));
    if (!response) return null;
    try {
      const record = await response.json();
      return record?.schemaVersion === 1 && record.appId === 'adigun-aibible' && record.basePath === BASE && Array.isArray(record.paths) ? record : null;
    } catch { return null; }
  }
  async function installedResponse(path) {
    for (const name of await caches.keys()) {
      if (!name.startsWith(PACKS)) continue;
      const cache = await caches.open(name), record = await packRecord(cache);
      if (record?.contentVersion !== manifest.contentVersion || !record.paths.includes(path)) continue;
      const response = await cache.match(absolute(path));
      if (response) return response;
    }
    return (await caches.open(CONTENT)).match(absolute(path));
  }
  async function install() {
    const names = await caches.keys(), hadShell = names.includes(SHELL);
    const stagedName = `${PACKS}install-${crypto.randomUUID()}`;
    const staged = await caches.open(stagedName), shell = await caches.open(SHELL);
    try {
      for (const [path, file] of Object.entries(shellFiles)) {
        const response = await fresh(path, file);
        await shell.put(absolute(path), response);
      }
      const targets = new Set(Object.keys(manifest.files).filter(essential));
      const candidates = new Map();
      for (const name of names) {
        const isPack = name.startsWith(`${PREFIX}pack-`);
        if (!isPack && !name.startsWith(`${PREFIX}content-`) && name !== 'adigun-bible-content-v1') continue;
        const cache = await caches.open(name), record = isPack ? await packRecord(cache) : null;
        if (isPack && !record) continue;
        for (const request of await cache.keys()) {
          const path = pathOf(request);
          if (!path || !Object.hasOwn(manifest.files, path) || (isPack && !record.paths.includes(path))) continue;
          targets.add(path);
          if (!candidates.has(path)) candidates.set(path, []);
          candidates.get(path).push(cache);
        }
      }
      // Every previously available file is staged before this worker may enter its waiting state.
      for (const path of [...targets].sort()) {
        let response;
        for (const cache of candidates.get(path) ?? []) {
          try { response = await valid(await cache.match(absolute(path)), manifest.files[path], path); break; }
          catch { /* An old edition may need a new verified copy. */ }
        }
        response ??= await fresh(path, manifest.files[path]);
        await staged.put(absolute(path), response);
      }
      const record = { schemaVersion: 1, appId: 'adigun-aibible', basePath: BASE, contentVersion: manifest.contentVersion, packId: 'installation', paths: [...targets].sort(), createdAt: new Date().toISOString() };
      await staged.put(absolute(MARKER), new Response(JSON.stringify(record), { headers: { 'Content-Type': 'application/json' } }));
    } catch (error) {
      await caches.delete(stagedName).catch(() => false);
      if (!hadShell) await caches.delete(SHELL).catch(() => false);
      throw error; // The old worker and all of its downloaded scripture remain usable.
    }
  }
  async function activate() {
    for (const name of await caches.keys()) {
      const oldScopedShell = name.startsWith(`${PREFIX}shell-`) && name !== SHELL;
      const oldScopedData = name.startsWith(`${PREFIX}content-`) && name !== CONTENT;
      const oldScopedPack = name.startsWith(`${PREFIX}pack-`) && !name.startsWith(PACKS);
      if (oldScopedShell || oldScopedData || oldScopedPack) await caches.delete(name);
      else if (name === 'adigun-bible-content-v1' || /^adigun-bible-shell-[a-f0-9]{12}$/.test(name)) {
        // Migrate the original release without clearing another project sharing this origin.
        const cache = await caches.open(name), requests = await cache.keys();
        if (requests.every(request => pathOf(request) !== null)) await caches.delete(name);
        else if (name === 'adigun-bible-content-v1') {
          for (const request of requests) if (pathOf(request) !== null) await cache.delete(request);
        }
      }
    }
    await self.clients.claim();
  }
  async function shellResponse(path) {
    const cache = await caches.open(SHELL), stored = await cache.match(absolute(path));
    if (stored) return stored;
    try {
      const response = await fresh(path, shellFiles[path]);
      await cache.put(absolute(path), response.clone()).catch(() => undefined);
      return response;
    } catch { return new Response('Reconnect and update the application to restore this file.', { status: 503 }); }
  }
  async function contentResponse(path, request) {
    // Explicit downloads manage their own staging transaction and must not write through to the active cache.
    const staging = request.cache === 'no-store';
    if (!staging) {
      const stored = await installedResponse(path);
      if (stored) return stored;
    }
    try {
      const response = await fresh(path, manifest.files[path], request.signal);
      if (!staging) await (await caches.open(CONTENT)).put(absolute(path), response.clone()).catch(() => undefined);
      return response;
    } catch {
      return new Response('This source is not available for the installed edition. Reconnect, save and update the application, then retry.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    }
  }
  self.addEventListener('install', event => event.waitUntil(install()));
  self.addEventListener('activate', event => event.waitUntil(activate()));
  self.addEventListener('message', event => { if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting(); });
  self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    const path = pathOf(event.request);
    if (path === null) return;
    if (Object.hasOwn(manifest.files, path)) event.respondWith(contentResponse(path, event.request));
    else if (path === '' || path === 'index.html') event.respondWith(shellResponse('index.html'));
    else if (Object.hasOwn(shellFiles, path)) event.respondWith(shellResponse(path));
    // Unlisted URLs (including private APIs, query-string requests and other projects) are never cached.
  });
}

export function createServiceWorkerSource(manifest, shellFiles) {
  return `(${serviceWorkerRuntime.toString()})(${JSON.stringify({ manifest, shellFiles })});\n`;
}

export async function finalizeBuild({ root = resolve(import.meta.dirname, '..'), base = '/', sourceCommit } = {}) {
  if (!/^\/[A-Za-z0-9_/-]*\/$/.test(base) || base.includes('..')) throw new Error('Invalid deployment base path.');
  const dist = resolve(root, 'dist');
  await assertNoSourceStaging(dist);
  const data = await inventory(resolve(dist, 'data'), dist);
  const shell = await inventory(resolve(dist, 'assets'), dist);
  try { Object.assign(shell, await inventory(resolve(dist, 'fonts'), dist)); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (Object.keys(shell).some(path => /Noto(?:NaskhArabic|SansMyanmar).*\.ttf$/.test(path))) {
    for (const path of ['fonts/NotoNaskhArabic-OFL.txt', 'fonts/NotoSansMyanmar-OFL.txt', 'fonts/sources.json']) {
      if (!shell[path]) throw new Error(`Bundled source fonts require their complete offline notice: ${path}`);
    }
  }
  for (const path of ['index.html', 'manifest.webmanifest']) {
    const bytes = await readFile(resolve(dist, path));
    shell[path] = { sha256: digest(bytes), bytes: bytes.length };
  }
  const files = Object.fromEntries(Object.entries(data).sort(([a], [b]) => a.localeCompare(b)));
  const contentVersion = digest(JSON.stringify({ base, files })).slice(0, 24);
  const buildVersion = digest(JSON.stringify({ shell, contentVersion })).slice(0, 24);
  const manifest = { schemaVersion: 1, appId: 'adigun-aibible', basePath: base, cachePrefix: `adigun-bible-${digest(base).slice(0, 12)}-`, contentVersion, buildVersion, files };
  const offlineMetadata = JSON.stringify(manifest, null, 2) + '\n';
  await writeFile(resolve(dist, 'offline-manifest.json'), offlineMetadata);
  shell['offline-manifest.json'] = { sha256: digest(offlineMetadata), bytes: Buffer.byteLength(offlineMetadata) };
  await writeFile(resolve(dist, 'sw.js'), createServiceWorkerSource(manifest, shell));
  let commit = sourceCommit ?? process.env.GITHUB_SHA ?? 'working-tree';
  if (commit === 'working-tree') {
    try {
      if (!execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()) {
        commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
      }
    } catch { /* Local previews may not have repository metadata. */ }
  }
  await writeFile(resolve(dist, 'build-info.json'), JSON.stringify({ sourceCommit: commit, buildVersion, contentVersion, builtAt: new Date().toISOString(), stage: 'core-development', policyVersion: '2.0' }, null, 2));
  await writeFile(resolve(dist, '.nojekyll'), '');
  return { manifest, sourceCommit: commit };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const root = resolve(import.meta.dirname, '..');
  const transport = await verifySourceJsonTransport({ directory: resolve(root, 'dist/data'), canonicalDirectory: resolve(root, 'data') });
  if (transport.enabled) console.log(`Final source artifact verified: ${transport.files} envelopes, ${transport.canonicalBytes} exact canonical bytes, ${transport.transferredBytes} transferred bytes.`);
  const result = await finalizeBuild();
  console.log(`Release metadata and verified offline inventory generated (${result.manifest.buildVersion}; content ${result.manifest.contentVersion}).`);
}

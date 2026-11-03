import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';

export const SOURCE_URL = 'https://ebible.org/Scriptures/engwebp_vpl.zip';
export const SOURCE_SHA256 = '37a8ccecfbc765a2305ae64f3b5e88d1d01bafceb9a33e8d191f6ee551a437b9';
const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
if (args.length && !(args.length === 2 && args[0] === '--source')) throw new Error('Usage: npm run content:import -- [--source /path/to/engwebp_vpl.zip]');
const temporary = await mkdtemp(join(tmpdir(), 'adigun-source-'));
try {
  let archive = args.length ? resolve(args[1]) : join(temporary, 'engwebp_vpl.zip');
  let bytes;
  if (args.length) bytes = await readFile(archive);
  else {
    const response = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(45000), redirect: 'error' });
    if (!response.ok) throw new Error(`Source download failed: HTTP ${response.status}`);
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 20_000_000) throw new Error('Source archive exceeds the 20 MB import limit.');
      chunks.push(chunk);
    }
    bytes = Buffer.concat(chunks);
  }
  if (bytes.length > 20_000_000) throw new Error('Source archive exceeds the 20 MB import limit.');
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== SOURCE_SHA256) throw new Error(`Source checksum changed (${actual}). Review the new edition and update the explicit pin before importing; no content was overwritten.`);
  if (!args.length) await writeFile(archive, bytes);
  execFileSync('python3', [resolve(root, 'scripts/import-corpus.py'), archive], { cwd: root, stdio: 'inherit', timeout: 60000 });
} finally { await rm(temporary, { recursive: true, force: true }); }

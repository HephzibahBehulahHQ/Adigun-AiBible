import { mkdir, readFile, writeFile, rm, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { publishEditorial } from './publish-editorial.mjs';
import { copySourceContent, verifySourceJsonTransport, createSourceStagingDirectory } from './pack-source-json.mjs';
const root = resolve(import.meta.dirname, '..');
const python = process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
execFileSync(python, [resolve(root,'scripts/import-editions.py'), '--rebuild-indexes'], {cwd:root,stdio:'inherit'});
execFileSync(python, [resolve(root,'scripts/import-editions.py'), '--verify'], {cwd:root,stdio:'inherit'});
const editorial = await publishEditorial({root});
const manifest = JSON.parse(await readFile(resolve(root, 'data/manifest.json'), 'utf8'));
if (!manifest.books?.length || !manifest.edition?.name) throw new Error('A validated source corpus is required before building.');
const {totalSourceUnits,remainingSourceUnits,candidateCount} = editorial.backlog;
await mkdir(resolve(root, 'public'), { recursive: true });
const staged = await createSourceStagingDirectory(resolve(root, 'public'));
try {
  const transport = await copySourceContent({ sourceDirectory: resolve(root, 'data'), directory: staged });
  await writeFile(resolve(staged, 'editorial.json'),JSON.stringify({schemaVersion:1,editionId:editorial.editionId,approvedComparisons:editorial.approvedComparisons,approvedParaphrases:editorial.approvedParaphrases,approvedContent:editorial.approvedContent,coverage:editorial.coverage.filter(row=>row.status!=='unreviewed'),coverageCounts:editorial.coverageCounts,backlog:{totalSourceUnits,remainingSourceUnits,candidateCount}})+'\n');
  const verified = await verifySourceJsonTransport({ directory: staged, canonicalDirectory: resolve(root, 'data') });
  if (transport.files !== verified.files) throw new Error('The staged source payload inventory changed.');
  await rm(resolve(root, 'public/data'), { recursive: true, force: true });
  await rename(staged, resolve(root, 'public/data'));
  console.log(`Source JSON transport: ${transport.enabled ? `${transport.files} envelopes, ${transport.canonicalBytes} canonical bytes, ${transport.transferredBytes} transferred bytes` : 'off (raw JSON)'}.`);
} finally { await rm(staged, { recursive: true, force: true }); }
await mkdir(resolve(root, 'public/docs'), { recursive:true });
const spec = await readFile(resolve(root, 'docs/specs/Adigun-AiBible_Codex_Master_Prompt.md'), 'utf8');
await writeFile(resolve(root, 'public/docs/Adigun-AiBible_Codex_Master_Prompt.txt'), spec);
console.log(`Prepared ${manifest.books.length} source books and the complete specification for the static build.`);

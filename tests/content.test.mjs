import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateCorpus } from '../scripts/validate-corpus.mjs';

const root = resolve(import.meta.dirname, '..');

test('the complete published edition and all curated selections validate', async () => {
  const result = await validateCorpus();
  assert.equal(result.books, 66);
  assert.equal(result.chapters, 1189);
  assert.equal(result.numberedRecords, 31103);
  assert.equal(result.recordsWithText, 31098);
  assert.equal(result.sourceEmptyRecords, 5);
  assert.ok(result.curatedReferences >= 50);
});

test('modified scripture is rejected even when the JSON remains valid', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'adigun-content-test-'));
  try {
    await cp(resolve(root, 'data'), temporary, { recursive: true });
    const path = join(temporary, 'books/GEN.json');
    const genesis = JSON.parse(await readFile(path, 'utf8'));
    genesis.chapters[0].verses[0].text += ' Unapproved change.';
    await writeFile(path, JSON.stringify(genesis));
    await assert.rejects(validateCorpus({ dataDir: temporary }), /Source integrity failed: books\/GEN.json/);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test('a curated range beyond the source chapter is rejected', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'adigun-reference-test-'));
  try {
    const path = join(temporary, 'curation.ts');
    await writeFile(path, "const invalid = reference('GEN', 1, 31, 32);");
    await assert.rejects(validateCorpus({ curationPath: path }), /Curated reference has no source text: GEN.1.32/);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test('an unreviewed archive fails before overwriting the existing corpus', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'adigun-import-test-'));
  try {
    const before = await readFile(resolve(root, 'data/manifest.json'));
    const path = join(temporary, 'invalid.zip');
    await writeFile(path, 'This is deliberately invalid test input.');
    const result = spawnSync(process.execPath, ['scripts/import-corpus.mjs', '--source', path], { cwd: root, encoding: 'utf8', timeout: 10000 });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Source checksum changed/);
    assert.deepEqual(await readFile(resolve(root, 'data/manifest.json')), before);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

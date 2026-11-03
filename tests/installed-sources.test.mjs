import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installedEditorialSources } from '../scripts/installed-editorial-sources.mjs';
import { hashSourceText } from '../src/editorial.ts';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'bible-installed-sources-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const edition = (id, corpus, adapt) => ({ id, corpus, sha256: 'a'.repeat(64), referenceSystemId: `${id}:publisher-numbering`, rights: { redistribute: true, adapt }, licenseUrl: 'https://example.com/test-only-rights' });
  const editions = [edition('test-bible', 'bible', true), edition('test-quran', 'quran', false)];
  const write = async (path, data) => { const target = join(root, path); await mkdir(join(target, '..'), { recursive: true }); await writeFile(target, JSON.stringify(data)); };
  await write('data/editions/catalog.json', { schemaVersion: 1, editions });
  await write('data/editions/test-bible/manifest.json', { edition: editions[0], books: [{ id: 'GEN' }] });
  await write('data/editions/test-bible/books/GEN.json', { id: 'GEN', chapters: [{ number: 1, verses: [{ number: 1, text: 'Àkọ́kọ́ — exact fixture wording.' }, { number: 3, text: 'No invented second numbered record.' }] }] });
  await write('data/editions/test-quran/quran.json', { editionId: 'test-quran', surahs: [{ number: 1, verses: [{ number: 1, text: 'Unchanged Quran test fixture.' }] }] });
  return { root, editions, write };
}

test('installed evidence preserves source spelling, numbering gaps and no-derivatives rights', async t => {
  const { root } = await fixture(t);
  const result = await installedEditorialSources(root, new Set(['test-bible:GEN:1:1', 'test-bible:GEN:1:2', 'test-quran:QUR:1:1']));
  assert.deepEqual(result.inventory[0].works[0].chapters[0].units, ['1', '3']);
  assert.equal(result.inventory[1].rights.adapt, false);
  assert.deepEqual(result.sources.map(s => s.id), ['test-bible:GEN:1:1', 'test-quran:QUR:1:1']);
  assert.equal(result.sources[0].text, 'Àkọ́kọ́ — exact fixture wording.');
  assert.equal(result.sources[0].sourceContentHash, await hashSourceText('Àkọ́kọ́ — exact fixture wording.'));
  assert.equal(result.sources[1].ref.corpus, 'quran');
  assert.equal(result.sources[1].ref.workId, 'QUR');
});

test('installed evidence rejects catalog substitution and path traversal', async t => {
  const { root, editions, write } = await fixture(t);
  await write('data/editions/test-bible/manifest.json', { edition: { ...editions[0], sha256: 'b'.repeat(64) }, books: [] });
  await assert.rejects(installedEditorialSources(root), /identity does not match/);
  await write('data/editions/catalog.json', { schemaVersion: 1, editions: [{ ...editions[0], id: '../outside' }] });
  await assert.rejects(installedEditorialSources(root), /Invalid or duplicate/);
});

test('source-only editorial fixtures remain usable without an optional installed catalog', async t => {
  const root = await mkdtemp(join(tmpdir(), 'bible-no-extra-editions-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.deepEqual(await installedEditorialSources(root), { inventory: [], sources: [] });
});

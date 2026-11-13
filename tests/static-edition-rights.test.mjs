import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { assertPublicStaticEditionRights, finalizeBuild } from '../scripts/finalize-build.mjs';

const hash = 'a'.repeat(64);
const edition = { id: 'example', sha256: hash };
function rights(overrides = {}) {
  return {
    editionId: edition.id,
    sourceSha256: hash,
    territory: { scope: 'worldwide', countries: [] },
    withdrawn: false,
    expiresOn: null,
    operations: { display: { state: 'allowed' } },
    ...overrides,
  };
}

test('the current installed catalog has exact, active worldwide display grants for static delivery', () => {
  const catalog = JSON.parse(readFileSync(new URL('../data/editions/catalog.json', import.meta.url), 'utf8'));
  const register = JSON.parse(readFileSync(new URL('../data/editions/rights-register.json', import.meta.url), 'utf8'));
  assert.equal(assertPublicStaticEditionRights(catalog, register), catalog.editions.length);
});

test('static delivery rejects unknown or territory-limited display rights', () => {
  const catalog = { editions: [edition] };
  assert.equal(assertPublicStaticEditionRights(catalog, { editions: [rights()] }, '2026-11-13'), 1);
  for (const scope of ['unknown', 'specified']) {
    assert.throws(
      () => assertPublicStaticEditionRights(catalog, { editions: [rights({ territory: { scope, countries: scope === 'specified' ? ['US'] : [] } })] }, '2026-11-13'),
      /worldwide territorial delivery grant/,
    );
  }
});

test('static delivery rejects missing, changed, withdrawn, expired, or denied grants', () => {
  const catalog = { editions: [edition] };
  assert.throws(() => assertPublicStaticEditionRights(catalog, { editions: [] }, '2026-11-13'), /no rights record/);
  assert.throws(() => assertPublicStaticEditionRights(catalog, { editions: [rights({ sourceSha256: 'b'.repeat(64) })] }, '2026-11-13'), /do not match its source revision/);
  assert.throws(() => assertPublicStaticEditionRights(catalog, { editions: [rights({ withdrawn: true })] }, '2026-11-13'), /withdrawn or unknown/);
  assert.throws(() => assertPublicStaticEditionRights(catalog, { editions: [rights({ expiresOn: '2026-11-12' })] }, '2026-11-13'), /expired or has an invalid expiry/);
  assert.throws(() => assertPublicStaticEditionRights(catalog, { editions: [rights({ operations: { display: { state: 'unknown' } } })] }, '2026-11-13'), /display permission is not allowed/);
});

test('finalizeBuild refuses to publish restricted edition files', async t => {
  const root = mkdtempSync(join(tmpdir(), 'adigun-rights-build-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dist = resolve(root, 'dist');
  mkdirSync(resolve(dist, 'assets'), { recursive: true });
  mkdirSync(resolve(dist, 'data/editions'), { recursive: true });
  writeFileSync(resolve(dist, 'index.html'), '<!doctype html>');
  writeFileSync(resolve(dist, 'manifest.webmanifest'), '{}');
  writeFileSync(resolve(dist, 'data/editions/catalog.json'), JSON.stringify({ editions: [edition] }));
  writeFileSync(resolve(dist, 'data/editions/rights-register.json'), JSON.stringify({ editions: [rights({ territory: { scope: 'specified', countries: ['US'] } })] }));
  await assert.rejects(finalizeBuild({ root }), /worldwide territorial delivery grant/);
});

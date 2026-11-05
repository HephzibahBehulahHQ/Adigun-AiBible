import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { hashSourceText } from '../src/editorial.ts';
import { createPassagePackage, passagePackageText, verifyPassagePackage } from '../src/nearby/source-core.ts';

const read = async path => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));
const manifest = await read('data/manifest.json'), book = await read('data/books/GEN.json');
const reference = { bookId: 'GEN', chapter: 1, verse: 1, endVerse: 2, editionId: 'eng-web' };
const access = { getManifest: async () => manifest, getBook: async () => book, getQuran: async () => { throw new Error('Quran access is outside this pilot'); }, getNotice: async () => '', requirePermission: async () => {} };
const encoded = value => new TextEncoder().encode(JSON.stringify(value));

test('permitted packages preserve original wording, source identities and attribution', async () => {
  const checked = [], sources = { ...access, requirePermission: async (_edition, operation) => { checked.push(operation); } };
  const pack = await createPassagePackage(reference, sources), source = await verifyPassagePackage(pack.bytes, sources);
  assert.equal(source.units[0].text, book.chapters[0].verses[0].text); assert.equal(source.editionSha256, manifest.edition.sha256);
  const readable = passagePackageText(source); assert.ok(readable.includes(manifest.edition.licenseUrl)); assert.ok(readable.includes(manifest.edition.sourceUrl));
  for (const operation of ['display', 'peerSharing', 'redistribution', 'documentExport', 'offline']) assert.ok(checked.includes(operation));
});

test('both sender and recipient deny any withdrawn or unknown package operation', async () => {
  const pack = await createPassagePackage(reference, access);
  for (const operation of ['display', 'peerSharing', 'redistribution', 'documentExport', 'offline']) {
    const denied = { ...access, requirePermission: async (_edition, candidate) => { if (candidate === operation) throw new Error(`Permission unavailable: ${operation}`); } };
    await assert.rejects(createPassagePackage(reference, denied), new RegExp(operation));
    await assert.rejects(verifyPassagePackage(pack.bytes, denied), new RegExp(operation));
  }
});

test('recipient resolves its own source rather than trusting peer hashes or permission claims', async () => {
  const pack = await createPassagePackage(reference, access), changed = JSON.parse(new TextDecoder().decode(pack.bytes));
  changed.source.units[0].text = 'Forged source wording'; changed.source.units[0].sha256 = await hashSourceText(changed.source.units[0].text);
  await assert.rejects(verifyPassagePackage(encoded(changed), access), /differs from this app/);
  const extra = JSON.parse(new TextDecoder().decode(pack.bytes)); extra.permissionGranted = true;
  await assert.rejects(verifyPassagePackage(encoded(extra), access), /Only attributed/);
  await assert.rejects(verifyPassagePackage(pack.bytes, { ...access, getBook: async () => { throw new Error('Source not downloaded'); } }), /not downloaded/);
  await assert.rejects(verifyPassagePackage(new Uint8Array([0xff, 0xfe]), access));
});

test('changed source revision during packaging is rejected before transmission', async () => {
  let reads = 0;
  await assert.rejects(createPassagePackage(reference, { ...access, getManifest: async () => ++reads === 1 ? manifest : { ...manifest, edition: { ...manifest.edition, sha256: 'a'.repeat(64) } } }), /revision changed/);
});

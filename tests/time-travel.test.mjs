import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { athens, experiencePack, loadExperiencePack, loadTourPassage, validateTour } from '../src/time-travel/model.ts';
import { clipNear, initialCamera, moveCamera, project, sceneGeometry, viewPoint } from '../src/time-travel/geometry.ts';

const read = async path => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));
const manifest = await read('data/manifest.json'), acts = await read('data/books/ACT.json');
const dependencies = { getManifest: async () => manifest, getBook: async () => acts, requirePermission: async () => {} };

test('all researched stops resolve exact selected-edition passages and retain evidence limitations', async () => {
  for (const stop of athens.stops) {
    const result = await loadTourPassage(stop, manifest.edition.id, dependencies);
    assert.equal(result.reference.editionId, manifest.edition.id);
    assert.deepEqual(result.verses, acts.chapters.find(chapter => chapter.number === 17).verses.filter(verse => verse.number >= stop.verse && verse.number <= stop.endVerse));
    assert.ok(stop.uncertainty && stop.sourceIds.length);
  }
  assert.match(athens.reviewStatus, /human editorial review pending/);
  assert.match(athens.geometryNotice, /not to scale/);
  const bad = structuredClone(athens); bad.stops[0].sourceIds = ['unavailable-evidence'];
  assert.throws(() => validateTour(bad), /source/);
});

test('missing passages, mismatched editions and revoked display permission never substitute another source', async () => {
  const missing = structuredClone(acts); missing.chapters.find(chapter => chapter.number === 17).verses = [];
  await assert.rejects(loadTourPassage(athens.stops[0], 'eng-web', { ...dependencies, getBook: async () => missing }), /unavailable/);
  await assert.rejects(loadTourPassage(athens.stops[0], 'yor', dependencies), /matching verified/);
  await assert.rejects(loadTourPassage(athens.stops[0], 'eng-web', { ...dependencies, requirePermission: async () => { throw new Error('Permission withdrawn'); } }), /Permission withdrawn/);
});

test('cancellation during source loading prevents a late passage or pack', async () => {
  const controller = new AbortController();
  await assert.rejects(loadTourPassage(athens.stops[0], 'eng-web', { ...dependencies, getBook: async () => { controller.abort(); return acts; } }, controller.signal), /cancelled/);
  const pack = new AbortController();
  await assert.rejects(loadExperiencePack('eng-web', { ...dependencies, requirePermission: async (_edition, operation) => { if (operation === 'offline') pack.abort(); } }, pack.signal), /cancelled/);
});

test('complete offline packs require export, redistribution and offline permission from one source revision', async () => {
  const operations = [];
  const passages = await loadExperiencePack('eng-web', { ...dependencies, requirePermission: async (_edition, operation) => { operations.push(operation); } });
  assert.equal(passages.length, 4);
  for (const operation of ['display', 'documentExport', 'redistribution', 'offline']) assert.equal(operations.filter(value => value === operation).length, 4);
  for (const denied of ['documentExport', 'redistribution', 'offline']) {
    await assert.rejects(loadExperiencePack('eng-web', { ...dependencies, requirePermission: async (_edition, operation) => { if (operation === denied) throw new Error(`Denied ${denied}`); } }), new RegExp(denied));
  }
  let calls = 0;
  await assert.rejects(loadExperiencePack('eng-web', { ...dependencies, getManifest: async () => ({ ...manifest, edition: { ...manifest.edition, sha256: ++calls === 1 ? manifest.edition.sha256 : 'a'.repeat(64) } }) }), /source changed/);
});

test('offline HTML preserves all passages, attribution and uncertainty while escaping source data', async () => {
  const passages = await loadExperiencePack('eng-web', dependencies), html = experiencePack(passages);
  for (const passage of passages) for (const verse of passage.verses) assert.ok(html.includes(verse.text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')));
  assert.ok(html.includes(manifest.edition.sha256));
  assert.match(html, /human editorial review pending/);
  assert.ok(!/<script\b|<iframe\b|<img\b/i.test(html));
  const escaped = structuredClone(passages); escaped[0].verses[0].text = '<script>alert("not executable")</script>';
  assert.match(experiencePack(escaped), /&lt;script&gt;/);
  escaped[0].edition.sourceUrl = 'javascript:alert(1)';
  assert.throws(() => experiencePack(escaped), /safe publisher links/);
  assert.throws(() => experiencePack(passages.slice(1)), /complete, consistent/);
});

test('walkthrough movement stays bounded and near-plane clipping produces finite visible polygons', () => {
  let camera = initialCamera();
  for (let i = 0; i < 1000; i++) camera = moveCamera(moveCamera(moveCamera(camera, 'forward'), 'left'), 'lookDown');
  assert.ok(camera.x >= -18 && camera.z >= -16 && camera.pitch >= -.65);
  const face = clipNear([[-1, 0, -.5], [1, 0, 1], [0, 1, 1]]);
  assert.equal(face.length, 4);
  for (const point of face) assert.ok(project(point, 320, 400)?.every(Number.isFinite));
  assert.equal(project([0, 0, -1], 320, 400), null);
  assert.ok(viewPoint([0, 0, 0], initialCamera()).every(Number.isFinite));
  assert.ok(sceneGeometry(true).length < sceneGeometry(false).length);
});

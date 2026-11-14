import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { editionOperations, validateEditionRightsRegister, decideEditionOperation } from '../src/edition-rights.ts';

const raw = JSON.parse(readFileSync(new URL('../data/editions/rights-register.json', import.meta.url), 'utf8'));
const register = validateEditionRightsRegister(raw);
const web = register.editions.find(record => record.editionId === 'eng-web');
const context = { today: '2026-11-04', sourceSha256: web.sourceSha256 };
const thaiDraft = register.editions.find(record => record.editionId === 'thafb');

test('rights registry requires evidence for every allowed operation and binds source revisions', () => {
  for (const record of register.editions) assert.equal(Object.keys(record.operations).length, editionOperations.length);
  assert.equal(decideEditionOperation(web, 'display', context).allowed, true);
  assert.equal(decideEditionOperation(web, 'display', { ...context, sourceSha256: '0'.repeat(64) }).allowed, false);
  assert.equal(decideEditionOperation(undefined, 'display', context).allowed, false);
  const unknown = structuredClone(web); unknown.operations.display.state = 'unknown';
  assert.equal(decideEditionOperation(unknown, 'display', context).allowed, false);
  const missing = structuredClone(raw); delete missing.editions[0].operations.display;
  assert.throws(() => validateEditionRightsRegister(missing), /Invalid rights entry/);
  const invented = structuredClone(raw); invented.editions[0].operations.display.evidenceIds = ['not-evidence'];
  assert.throws(() => validateEditionRightsRegister(invented), /Invalid rights entry/);
});

test('Thai Freedom draft rights are source-bound and keep unverified media rights unknown', () => {
  assert.equal(thaiDraft.sourceSha256, 'c5b68af1e8909640435d4ed66e02bc75ef00061ef755a20b8b3fb44cb8f5b769');
  assert.equal(decideEditionOperation(thaiDraft, 'aiRetrieval', { today: '2026-11-14', sourceSha256: thaiDraft.sourceSha256 }).allowed, true);
  assert.equal(decideEditionOperation(thaiDraft, 'recordedAudio', { today: '2026-11-14', sourceSha256: thaiDraft.sourceSha256 }).allowed, false);
  assert.equal(decideEditionOperation(thaiDraft, 'modelTraining', { today: '2026-11-14', sourceSha256: thaiDraft.sourceSha256 }).allowed, false);
});

test('licensing expiry, withdrawals, territorial restrictions and provider reporting fail closed', () => {
  const row = structuredClone(web);
  row.expiresOn = '2026-11-03'; assert.equal(decideEditionOperation(row, 'offline', context).allowed, false);
  row.expiresOn = null; row.withdrawn = true; assert.equal(decideEditionOperation(row, 'offline', context).allowed, false);
  row.withdrawn = false; row.territory = { scope: 'specified', countries: ['DE'] };
  assert.equal(decideEditionOperation(row, 'offline', context).allowed, false);
  assert.equal(decideEditionOperation(row, 'offline', { ...context, territory: 'DE' }).allowed, true);
  row.providerReporting.requirement = 'required';
  assert.equal(decideEditionOperation(row, 'offline', { ...context, territory: 'DE' }).allowed, false);
  assert.equal(decideEditionOperation(row, 'offline', { ...context, territory: 'DE', providerReportingConfigured: true }).allowed, true);
});

test('stale provider caches and unverified operation territory cannot be used', () => {
  const row = structuredClone(web); row.cache = { mode: 'interval', maxAgeDays: 30 };
  assert.equal(decideEditionOperation(row, 'display', context).allowed, false);
  assert.equal(decideEditionOperation(row, 'display', { ...context, cacheVerifiedOn: '2026-10-01' }).allowed, false);
  assert.equal(decideEditionOperation(row, 'display', { ...context, cacheVerifiedOn: '2026-11-01' }).allowed, true);
  row.cache = { mode: 'none-required' }; row.operations.printExport.excludedTerritories = ['GB'];
  assert.equal(decideEditionOperation(row, 'printExport', context).allowed, false);
  assert.equal(decideEditionOperation(row, 'printExport', { ...context, territory: 'GB' }).allowed, false);
  assert.equal(decideEditionOperation(row, 'printExport', { ...context, territory: 'DE' }).allowed, true);
});

test('Biblica AI policy is a product-wide prerequisite, not an inferred CC permission', () => {
  const yoruba = register.editions.find(record => record.editionId === 'yor');
  const exact = { today: '2026-11-04', sourceSha256: yoruba.sourceSha256 };
  assert.equal(decideEditionOperation(yoruba, 'display', exact).allowed, true);
  assert.equal(decideEditionOperation(yoruba, 'aiRetrieval', exact).allowed, false);
  assert.equal(decideEditionOperation(yoruba, 'modelTraining', exact).allowed, false);
  assert.equal(decideEditionOperation(yoruba, 'display', { ...exact, aiProductEnabled: true }).allowed, false);
  assert.equal(decideEditionOperation(yoruba, 'tts', exact).allowed, false);
});

test('ClearQuran exact exports remain distinct from forbidden semantic adaptations', () => {
  const quran = register.editions.find(record => record.editionId === 'eng-clearquran');
  const exact = { today: '2026-11-04', sourceSha256: quran.sourceSha256 };
  assert.equal(decideEditionOperation(quran, 'documentExport', exact).allowed, true);
  assert.equal(decideEditionOperation(quran, 'studyParaphrase', exact).allowed, false);
  assert.equal(decideEditionOperation(quran, 'modelTraining', exact).allowed, false);
  assert.equal(decideEditionOperation(quran, 'recordedAudio', exact).allowed, false);
});

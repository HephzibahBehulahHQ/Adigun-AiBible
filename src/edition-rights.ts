/** Edition permissions are independent of whether an edition happens to load. */
export const editionOperations = [
  'display', 'redistribution', 'offline', 'searchIndex', 'adaptation', 'translation',
  'studyParaphrase', 'aiRetrieval', 'modelTraining', 'tts', 'recordedAudio',
  'publicPerformance', 'imageExport', 'videoExport', 'printExport', 'documentExport',
  'peerSharing', 'commercialUse',
] as const;
export type EditionOperation = typeof editionOperations[number];
export type PermissionState = 'allowed' | 'denied' | 'unknown';
export interface EditionPermission {
  state: PermissionState;
  evidenceIds: string[];
  reason: string;
  excludedTerritories?: string[];
}
export interface EditionRightsRecord {
  editionId: string;
  sourceSha256: string;
  verifiedOn: string;
  expiresOn: string | null;
  withdrawn: boolean;
  territory: { scope: 'worldwide' | 'specified' | 'unknown'; countries: string[] };
  aiProductUse: EditionPermission;
  operations: Record<EditionOperation, EditionPermission>;
  attribution: string;
  conditions: string[];
  cache: { mode: 'none-required' | 'interval' | 'unknown'; maxAgeDays?: number };
  providerReporting: { requirement: 'none' | 'required' | 'unknown'; description: string };
}
export interface EditionRightsRegister {
  schemaVersion: 1;
  evidence: { id: string; url: string; observedOn: string; summary: string }[];
  editions: EditionRightsRecord[];
}
export interface PermissionContext {
  sourceSha256?: string;
  today?: string;
  territory?: string;
  aiProductEnabled?: boolean;
  providerReportingConfigured?: boolean;
  cacheVerifiedOn?: string;
}
export interface PermissionDecision { allowed: boolean; reason: string; conditions: string[] }

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string');
const validDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const states = new Set(['allowed', 'denied', 'unknown']);
function permission(value: unknown, evidence: Set<string>): value is EditionPermission {
  return isObject(value) && typeof value.state === 'string' && states.has(value.state)
    && typeof value.reason === 'string' && value.reason.length > 0 && strings(value.evidenceIds)
    && value.evidenceIds.every(id => evidence.has(id)) && (value.state !== 'allowed' || value.evidenceIds.length > 0)
    && (value.excludedTerritories === undefined || (strings(value.excludedTerritories) && value.excludedTerritories.every(country => /^[A-Z]{2}$/.test(country))));
}

/** Reject incomplete grants; a missing operation must never inherit a broad true flag. */
export function validateEditionRightsRegister(value: unknown): EditionRightsRegister {
  if (!isObject(value) || value.schemaVersion !== 1 || !Array.isArray(value.evidence) || !Array.isArray(value.editions)) throw new Error('Invalid edition rights register.');
  const evidence = new Set<string>();
  for (const item of value.evidence) {
    if (!isObject(item) || typeof item.id !== 'string' || !item.id || evidence.has(item.id)
      || typeof item.url !== 'string' || !/^https:\/\/[^\s]+$/.test(item.url)
      || !validDate(item.observedOn) || typeof item.summary !== 'string' || !item.summary) throw new Error('Invalid rights evidence.');
    evidence.add(item.id);
  }
  const ids = new Set<string>();
  for (const row of value.editions) {
    if (!isObject(row) || typeof row.editionId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(row.editionId) || ids.has(row.editionId)
      || typeof row.sourceSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(row.sourceSha256)
      || !validDate(row.verifiedOn) || (row.expiresOn !== null && !validDate(row.expiresOn)) || typeof row.withdrawn !== 'boolean'
      || typeof row.attribution !== 'string' || !row.attribution || !strings(row.conditions)
      || !isObject(row.territory) || !['worldwide', 'specified', 'unknown'].includes(String(row.territory.scope))
      || !strings(row.territory.countries) || row.territory.countries.some(country => !/^[A-Z]{2}$/.test(country))
      || (row.territory.scope === 'specified' && !row.territory.countries.length)
      || !permission(row.aiProductUse, evidence) || !isObject(row.operations)
      || !editionOperations.every(operation => permission((row.operations as Record<string, unknown>)[operation], evidence))
      || Object.keys(row.operations).some(operation => !editionOperations.includes(operation as EditionOperation))
      || !isObject(row.cache) || !['none-required', 'interval', 'unknown'].includes(String(row.cache.mode))
      || (row.cache.mode === 'interval' && (!Number.isInteger(row.cache.maxAgeDays) || Number(row.cache.maxAgeDays) <= 0))
      || !isObject(row.providerReporting) || !['none', 'required', 'unknown'].includes(String(row.providerReporting.requirement))
      || typeof row.providerReporting.description !== 'string') throw new Error(`Invalid rights entry: ${String(row.editionId)}.`);
    ids.add(row.editionId);
  }
  return value as unknown as EditionRightsRegister;
}

/** The caller supplies deployment/service conditions; unknown territory or expiry never grants access. */
export function decideEditionOperation(record: EditionRightsRecord | undefined, operation: EditionOperation, context: PermissionContext = {}): PermissionDecision {
  const deny = (reason: string): PermissionDecision => ({ allowed: false, reason, conditions: record?.conditions || [] });
  if (!record) return deny('This edition has no verified permission record.');
  const today = context.today ?? new Date().toISOString().slice(0, 10);
  if (!validDate(today)) return deny('A valid permission-check date is required.');
  if (record.withdrawn) return deny('This edition has been withdrawn.');
  if (record.expiresOn && today > record.expiresOn) return deny('This edition permission has expired.');
  if (context.sourceSha256 && context.sourceSha256 !== record.sourceSha256) return deny('The source revision has changed; its permissions need verification.');
  if (record.territory.scope === 'unknown' || (record.territory.scope === 'specified' && (!context.territory || !record.territory.countries.includes(context.territory)))) return deny('Permission for this territory has not been verified.');
  if (context.aiProductEnabled && record.aiProductUse.state !== 'allowed') return deny(record.aiProductUse.reason);
  if (record.providerReporting.requirement === 'unknown' || (record.providerReporting.requirement === 'required' && !context.providerReportingConfigured)) return deny('Required provider reporting has not been resolved and configured.');
  if (record.cache.mode === 'unknown') return deny('Cache refresh requirements have not been verified.');
  if (record.cache.mode === 'interval' && (!validDate(context.cacheVerifiedOn) || (Date.parse(today) - Date.parse(context.cacheVerifiedOn)) / 86_400_000 > Number(record.cache.maxAgeDays))) return deny('The provider requires this source cache to be refreshed.');
  const grant = record.operations[operation];
  if (!grant || grant.state !== 'allowed') return deny(grant?.reason || 'Permission for this operation is unknown.');
  if (grant.excludedTerritories?.length && (!context.territory || grant.excludedTerritories.includes(context.territory))) return deny('This operation requires a verified permitted territory.');
  return { allowed: true, reason: grant.reason, conditions: record.conditions };
}

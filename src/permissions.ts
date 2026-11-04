import type { Edition } from './types';
import { decideEditionOperation, validateEditionRightsRegister } from './edition-rights';
import type { EditionOperation, EditionRightsRegister, PermissionDecision } from './edition-rights';

let register: Promise<EditionRightsRegister> | undefined;
export function getRightsRegister(): Promise<EditionRightsRegister> {
  if (!register) register = fetch(`${import.meta.env?.BASE_URL || '/Adigun-AiBible/'}data/editions/rights-register.json`).then(async response => {
    if (!response.ok) throw new Error('Edition permissions are not downloaded. Reconnect to verify this operation.');
    return validateEditionRightsRegister(await response.json());
  }).catch(error => { register = undefined; throw error; });
  return register;
}
export async function permissionFor(edition: Edition, operation: EditionOperation): Promise<PermissionDecision> {
  try {
    if (!edition.sha256) return {allowed:false,reason:'This source revision has no verified checksum.',conditions:[]};
    const record = (await getRightsRegister()).editions.find(row => row.editionId === edition.id);
    // No generative service is configured. Enabling one also requires the product-wide AI grant.
    return decideEditionOperation(record, operation, {sourceSha256:edition.sha256,aiProductEnabled:false});
  } catch (error) { return {allowed:false,reason:error instanceof Error ? error.message : 'Permission could not be verified.',conditions:[]}; }
}
export async function requirePermission(edition: Edition, operation: EditionOperation): Promise<void> {
  const decision = await permissionFor(edition,operation);
  if (!decision.allowed) throw new Error(decision.reason);
}

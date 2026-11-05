import { emptyWorkspace, validateWorkspace } from '../src/workspace/model.ts';
import { prepareRetellingDraft } from '../src/workspace/retelling-media.ts';
export const at = '2026-11-05T11:00:00.000Z';
export const ref = { bookId:'JHN', chapter:3, verse:16, editionId:'eng-web' };
export const card = { id:'card-1', createdAt:at, updatedAt:at, ref, timeZone:'UTC', dueDate:'2026-11-05', intervalDays:0, successfulReviews:0, lapses:0, contextNotes:'Retain my context.', history:[], retellings:[] };
// A container-signature fixture tests byte integrity; it is not a playable audio claim.
export async function audioFixture(id = 'retelling-1') {
  const blob = new Blob([new Uint8Array([0x1a,0x45,0xdf,0xa3,0x80,0,255,12])], { type:'audio/webm;codecs=opus' });
  const { blob: original, ...draft } = await prepareRetellingDraft(blob, 1200, { ref, editionSha256:'a'.repeat(64) }, new Date(at));
  const recording = { id, ...draft }; const media = { recording, blob:original };
  const state = validateWorkspace({ ...emptyWorkspace(), cards:[{ ...card, retellings:[{ id, at, text:'My manual transcript: àánú.', recording }] }] });
  return { state, media };
}


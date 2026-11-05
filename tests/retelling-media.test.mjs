import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyWorkspace, mergeWorkspace, previewImport, validateWorkspace, workspaceBackup, workspaceNotebook } from '../src/workspace/model.ts';
import { MAX_AUDIO_BACKUP_BYTES, MAX_RETELLING_AUDIO_BYTES, prepareRetellingDraft, verifyRetellingMedia } from '../src/workspace/retelling-media.ts';
import { completeWorkspaceBackup, readCompleteWorkspaceBackup, selectedImportedMedia } from '../src/workspace/retelling-backup.ts';
const at = '2026-11-05T11:00:00.000Z';
const ref = { bookId:'JHN', chapter:3, verse:16, editionId:'eng-web' };
const card = { id:'card-1', createdAt:at, updatedAt:at, ref, timeZone:'UTC', dueDate:'2026-11-05', intervalDays:0, successfulReviews:0, lapses:0, contextNotes:'Retain my context.', history:[], retellings:[] };
// A container-signature fixture tests byte integrity; it is not a playable audio claim.
export async function audioFixture(id = 'retelling-1') {
  const blob = new Blob([new Uint8Array([0x1a,0x45,0xdf,0xa3,0x80,0,255,12])], { type:'audio/webm;codecs=opus' });
  const { blob: original, ...draft } = await prepareRetellingDraft(blob, 1200, { ref, editionSha256:'a'.repeat(64) }, new Date(at));
  const recording = { id, ...draft }; const media = { recording, blob:original };
  const state = validateWorkspace({ ...emptyWorkspace(), cards:[{ ...card, retellings:[{ id, at, text:'My manual transcript: àánú.', recording }] }] });
  return { state, media };
}

test('legacy v1 writing migrates without new IDs, source hashes or text normalization', async () => {
  const old = { ...emptyWorkspace(), schemaVersion:1, revision:4, cards:[{ ...card, retellings:[{at,text:'  àánú\nMy exact writing.  '}] }] };
  const copy = structuredClone(old);
  const migrated = validateWorkspace(old);
  assert.equal(migrated.schemaVersion, 2); assert.deepEqual(migrated.cards, old.cards); assert.deepEqual(old, copy);
  const backup = new Blob([JSON.stringify({ format:'adigun-aibible-workspace', schemaVersion:1, state:old })]);
  const imported = await readCompleteWorkspaceBackup(backup);
  assert.deepEqual(imported.state, migrated); assert.deepEqual(imported.media, []);
});

test('new recording entries require exact passage binding, unique ID, bounded metadata and writing or audio', async () => {
  const { state } = await audioFixture(); const entry = state.cards[0].retellings[0];
  assert.equal(validateWorkspace({ ...state, cards:[{ ...card, retellings:[{ ...entry, text:'' }] }] }).cards[0].retellings[0].text, '');
  for (const bad of [
    { ...entry, id:'wrong' }, { ...entry, recording:{ ...entry.recording, source:{ ...entry.recording.source, ref:{ ...ref, verse:17 } } } },
    { ...entry, recording:{ ...entry.recording, source:{ ...entry.recording.source, editionSha256:'unknown' } } },
    { ...entry, recording:{ ...entry.recording, bytes:MAX_RETELLING_AUDIO_BYTES + 1 } },
    { ...entry, recording:{ ...entry.recording, captureMs:300001 } }, { at, text:'   ' }
  ]) assert.throws(() => validateWorkspace({ ...state, cards:[{ ...card, retellings:[bad] }] }));
  assert.throws(() => validateWorkspace({ ...state, cards:[{ ...card, retellings:[entry,entry] }] }), /Duplicate/);
  assert.throws(() => validateWorkspace({ ...state, schemaVersion:1 }), /Legacy/);
  const large = Array.from({length:5},(_,i)=>({ ...entry, id:`large-${i}`, recording:{ ...entry.recording, id:`large-${i}`, bytes:MAX_RETELLING_AUDIO_BYTES } }));
  assert.throws(() => validateWorkspace({ ...state, cards:[{ ...card, retellings:large }] }), /32 MiB/);
});

test('original MIME, bytes and digest remain exact; mismatches and non-audio signatures fail', async () => {
  const { media } = await audioFixture(); const verified = await verifyRetellingMedia(media);
  assert.equal(verified.blob.type, 'audio/webm;codecs=opus'); assert.deepEqual(await verified.blob.bytes(), await media.blob.bytes());
  await assert.rejects(verifyRetellingMedia({ ...media, blob:media.blob.slice(0,undefined,'audio/webm') }), /MIME/);
  await assert.rejects(verifyRetellingMedia({ ...media, recording:{ ...media.recording, sha256:'b'.repeat(64) } }), /integrity/);
  await assert.rejects(prepareRetellingDraft(new Blob(['<html>not audio</html>'],{type:'audio/webm'}),1,media.recording.source), /bytes do not match/);
});

test('complete v2 backup roundtrips every original byte, transcript and source revision', async () => {
  const { state, media } = await audioFixture();
  const backup = await completeWorkspaceBackup({ state, media:[media] }, new Date(at));
  const restored = await readCompleteWorkspaceBackup(backup);
  assert.deepEqual(restored.state, state); assert.equal(restored.media.length, 1);
  assert.equal(restored.media[0].blob.type, media.blob.type); assert.deepEqual(await restored.media[0].blob.bytes(), await media.blob.bytes());
  assert.deepEqual(restored.media[0].recording, media.recording);
  assert.throws(() => workspaceBackup(state), /complete/); assert.match(workspaceNotebook(state), /Audio bytes are excluded/);
  assert.match(workspaceNotebook(state), /àánú/); assert.match(workspaceNotebook(state), new RegExp('a'.repeat(64)));
});

test('missing, duplicate, orphan, truncated, tampered and malformed base64 media fail before restore', async () => {
  const { state, media } = await audioFixture(); const good = JSON.parse(await (await completeWorkspaceBackup({ state, media:[media] })).text());
  const variants = [
    { ...good, media:[] }, { ...good, media:[...good.media,...good.media] },
    { ...good, media:[{ ...good.media[0],id:'orphan' }] },
    { ...good, media:[{ ...good.media[0],dataBase64:good.media[0].dataBase64.slice(1) }] },
    { ...good, media:[{ ...good.media[0],dataBase64:'!!!!'.repeat(good.media[0].dataBase64.length/4) }] },
    { ...good, state:{ ...state, cards:[{ ...state.cards[0], retellings:[{ ...state.cards[0].retellings[0], recording:{ ...media.recording, sha256:'b'.repeat(64) } }] }] } }
  ];
  for (const value of variants) await assert.rejects(readCompleteWorkspaceBackup(new Blob([JSON.stringify(value)])));
  await assert.rejects(readCompleteWorkspaceBackup(new Blob(['{broken'])), /valid JSON/);
  const oversized = new Blob(['{}']); Object.defineProperty(oversized,'size',{value:MAX_AUDIO_BACKUP_BYTES+1});
  await assert.rejects(readCompleteWorkspaceBackup(oversized), /64 MiB/);
  await assert.rejects(completeWorkspaceBackup({ state, media:[] }), /inventory/);
});

test('restore conflict choice selects only bytes belonging to retained cards', async () => {
  const a = await audioFixture('a'); const b = await audioFixture('b');
  const keep = mergeWorkspace(a.state,b.state,'keep-device');
  assert.deepEqual(selectedImportedMedia(keep,[b.media]),[]);
  const replace = mergeWorkspace(a.state,b.state,'use-import');
  assert.deepEqual(selectedImportedMedia(replace,[b.media]),[b.media]);
  assert.equal(replace.cards[0].retellings[0].id,'b');
  const textOnly = emptyWorkspace(); assert.deepEqual(previewImport(textOnly,workspaceBackup(textOnly)).incoming,textOnly);
});

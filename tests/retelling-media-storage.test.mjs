import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyWorkspace, mergeWorkspace } from '../src/workspace/model.ts';
import { loadRetellingMedia, loadWorkspace, readWorkspaceSnapshot, saveWorkspace, saveWorkspaceWithMedia, WorkspaceConflictError } from '../src/workspace/storage.ts';
import { completeWorkspaceBackup, readCompleteWorkspaceBackup, selectedImportedMedia } from '../src/workspace/retelling-backup.ts';
import { fixture } from './retelling-media-idb-fixture.mjs';
import { at,card,audioFixture } from './retelling-media-fixtures.mjs';

test('additive database v2 migration preserves legacy writing and rejects reopening from a v1 client', async () => {
  const legacy={...emptyWorkspace(),schemaVersion:1,cards:[{...card,retellings:[{at,text:'Original legacy writing: à.'}]}]};const db=fixture(legacy);
  try {
    const loaded=await loadWorkspace();assert.equal(loaded.schemaVersion,2);assert.deepEqual(loaded.cards,legacy.cards);assert.deepEqual(db.stored(),legacy);
    assert.deepEqual(db.openedVersions,[2]);assert.equal(db.version(),2);
    await assert.rejects(new Promise((resolve,reject)=>{const r=indexedDB.open('adigun-aibible-workspace',1);r.onsuccess=resolve;r.onerror=()=>reject(r.error);}),{name:'VersionError'});
    await saveWorkspace(loaded,0);assert.equal(db.stored().schemaVersion,2);assert.deepEqual(db.stored().cards,legacy.cards);
  } finally {db.dispose();}
});

test('metadata and original audio become visible only when their shared transaction completes', async () => {
  const {state,media}=await audioFixture();const db=fixture();
  try {db.options.holdWrite=true;let resolved=false;const saving=saveWorkspaceWithMedia(state,0,[media]).then(value=>{resolved=true;return value;});await db.whenHeld();
    assert.equal(resolved,false);assert.equal(db.stored(),undefined);assert.deepEqual(db.media(),[]);
    db.finish();const saved=await saving;assert.equal(saved.state.revision,1);assert.equal(db.media().length,1);
    assert.deepEqual(await (await loadRetellingMedia(media.recording)).blob.bytes(),await media.blob.bytes());
  }finally{db.dispose();}
});

test('audio-store and metadata-store failures roll back deletes and additions together', async () => {
  const a=await audioFixture('old'),b=await audioFixture('new');
  for(const store of ['retelling-audio','workspace']){const previous={...a.state,revision:1};const db=fixture(previous,[a.media]);
    try{db.options.failWriteStore=store;await assert.rejects(saveWorkspaceWithMedia(b.state,1,[b.media]),/not saved/);assert.deepEqual(db.stored(),previous);assert.equal(db.media()[0].recording.id,'old');assert.equal(db.media().length,1);assert.deepEqual(await db.media()[0].blob.bytes(),await a.media.blob.bytes());}
    finally{db.dispose();}
  }
});

test('simultaneous stale writes cannot replace each other or leave an orphan audio file', async () => {
  const a=await audioFixture('a'),b=await audioFixture('b');const db=fixture();
  try{const results=await Promise.allSettled([saveWorkspaceWithMedia(a.state,0,[a.media]),saveWorkspaceWithMedia(b.state,0,[b.media])]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.ok(results.find(r=>r.status==='rejected').reason instanceof WorkspaceConflictError);
    const snapshot=await readWorkspaceSnapshot();assert.equal(snapshot.state.revision,1);assert.equal(snapshot.media.length,1);assert.equal(snapshot.media[0].recording.id,snapshot.state.cards[0].retellings[0].id);
    await assert.rejects(saveWorkspaceWithMedia(a.state,0,[a.media]),/Another tab/);assert.equal(db.media().length,1);
  }finally{db.dispose();}
});

test('individual recording, card and complete workspace deletion retain exact bytes for atomic Undo', async () => {
  const a=await audioFixture();
  for(const kind of ['audio','card','all']){const original={...a.state,revision:1};const db=fixture(original,[a.media]);
    try{
      const entry={...original.cards[0].retellings[0]};delete entry.recording;
      const removed=kind==='audio'?{...original,cards:[{...original.cards[0],retellings:[entry]}]}:kind==='card'?{...original,cards:[]}:emptyWorkspace();
      const deletion=await saveWorkspaceWithMedia(removed,1);assert.deepEqual(db.media(),[]);assert.equal(deletion.removedMedia.length,1);
      if(kind==='audio')assert.equal(deletion.state.cards[0].retellings[0].text,original.cards[0].retellings[0].text);
      const undo=await saveWorkspaceWithMedia(deletion.previous,2,deletion.removedMedia);assert.equal(undo.state.revision,3);assert.deepEqual(undo.state.cards,original.cards);assert.deepEqual(await db.media()[0].blob.bytes(),await a.media.blob.bytes());
    }finally{db.dispose();}
  }
});

test('missing, orphaned, mismatched and corrupt originals fail visibly without replacing saved writing', async () => {
  const a=await audioFixture();
  for(const originals of [[],[{...a.media,recording:{...a.media.recording,id:'orphan'}}],[{...a.media,blob:new Blob([new Uint8Array([0x1a,0x45,0xdf,0xa3,0,0,0,0])],{type:a.media.blob.type})}]]){
    const db=fixture(a.state,originals);try{await assert.rejects(loadWorkspace());await assert.rejects(saveWorkspace(emptyWorkspace(),0));assert.deepEqual(db.stored(),a.state);}finally{db.dispose();}
  }
  const db=fixture();try{await assert.rejects(saveWorkspaceWithMedia(a.state,0),/inventory/);await assert.rejects(saveWorkspaceWithMedia(emptyWorkspace(),0,[a.media]),/not referenced/);await assert.rejects(saveWorkspaceWithMedia(a.state,0,[a.media,a.media]),/Duplicate/);assert.equal(db.stored(),undefined);assert.deepEqual(db.media(),[]);}finally{db.dispose();}
});

test('complete backup restore honors card conflict selection and can Undo the byte replacement', async () => {
  const a=await audioFixture('a'),b=await audioFixture('b');const incoming=await readCompleteWorkspaceBackup(await completeWorkspaceBackup({state:b.state,media:[b.media]}));const db=fixture({...a.state,revision:1},[a.media]);
  try{
    let current=await loadWorkspace();let merged=mergeWorkspace(current,incoming.state,'keep-device');
    const kept=await saveWorkspaceWithMedia(merged,1,selectedImportedMedia(merged,incoming.media));assert.equal(db.media()[0].recording.id,'a');
    current=kept.state;merged=mergeWorkspace(current,incoming.state,'use-import');
    const replaced=await saveWorkspaceWithMedia(merged,2,selectedImportedMedia(merged,incoming.media));assert.equal(db.media()[0].recording.id,'b');
    await saveWorkspaceWithMedia(replaced.previous,3,replaced.removedMedia);assert.equal(db.media()[0].recording.id,'a');assert.deepEqual(await db.media()[0].blob.bytes(),await a.media.blob.bytes());
  }finally{db.dispose();}
});

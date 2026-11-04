import test from 'node:test';
import assert from 'node:assert/strict';

const session={schemaVersion:1,id:'session-storage-test',title:'TEST FIXTURE',transcript:'John 11:35',createdAt:'2026-11-04T07:00:00.000Z',updatedAt:'2026-11-04T07:00:00.000Z',reviews:{}};
const flush=()=>new Promise(resolve=>setImmediate(resolve));

// Offline transaction-contract fixture. Real browser IndexedDB remains a separate release gate.
function databaseFixture({failFirstOpen=false,records=[]}={}) {
  const transactions=[];let opens=0;
  const database={close(){},transaction(_store,mode){
    const transaction={mode,objectStore(){return{put(value){transaction.value=value;},delete(id){transaction.deletedId=id;},getAll(){const request={result:records};transaction.readRequest=request;return request;}};}};
    transactions.push(transaction);return transaction;
  }};
  const factory={open(){const request={result:database};opens++;queueMicrotask(()=>{if(failFirstOpen&&opens===1)request.onerror?.();else request.onsuccess?.();});return request;}};
  return{factory,transactions,get opens(){return opens;}};
}
async function withFixture(name,fixture,run){
  const prior=globalThis.indexedDB;globalThis.indexedDB=fixture.factory;
  try { const module=await import(`../src/evidence/storage.ts?test=${name}`);await run(module,fixture); }
  finally { if(prior===undefined)delete globalThis.indexedDB;else globalThis.indexedDB=prior; }
}

test('saved success waits for the IndexedDB transaction commit, and an abort rejects',async()=>{
  await withFixture('commit',databaseFixture(),async(storage,fixture)=>{
    let saved=false;const write=storage.saveEvidenceSession(session).then(()=>{saved=true;});await flush();
    assert.equal(saved,false);assert.deepEqual(fixture.transactions[0].value,session);
    fixture.transactions[0].oncomplete();await write;assert.equal(saved,true);
    const aborted=assert.rejects(storage.saveEvidenceSession(session),/not saved/);await flush();fixture.transactions[1].onabort();await aborted;
  });
});

test('opening failure can be retried without deleting existing data',async()=>{
  await withFixture('retry',databaseFixture({failFirstOpen:true,records:[session]}),async(storage,fixture)=>{
    await assert.rejects(storage.listEvidenceSessions(),/could not be opened/);
    const read=storage.listEvidenceSessions();await flush();fixture.transactions[0].oncomplete();
    assert.deepEqual(await read,[session]);assert.equal(fixture.opens,2);
  });
});

test('malformed stored records and failed deletion cannot be reported as success',async()=>{
  await withFixture('failure',databaseFixture({records:[{...session,schemaVersion:99}]}),async(storage,fixture)=>{
    const invalid=assert.rejects(storage.listEvidenceSessions(),/failed validation/);await flush();fixture.transactions[0].oncomplete();await invalid;
    const failedDelete=assert.rejects(storage.deleteEvidenceSession(session.id),/could not be deleted/);await flush();fixture.transactions[1].onabort();await failedDelete;
  });
});

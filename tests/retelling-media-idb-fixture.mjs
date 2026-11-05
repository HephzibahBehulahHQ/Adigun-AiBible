// Transaction-focused IndexedDB fixture: serialized requests, atomic commit/rollback and additive versions.
export function fixture(initial, originals = []) {
  const stores = new Map([['workspace',new Map(initial === undefined ? [] : [['personal',structuredClone(initial)]])]]);
  let version = 1; if (originals.length) { version = 2; stores.set('retelling-audio',new Map(originals.map(file=>[file.recording.id,structuredClone(file)]))); }
  const queue = []; let active; const held = [];
  const options = { holdWrite:false,failWrite:false,failWriteStore:'',failRead:false,failOpen:false,blocked:false };
  const openedNames = [], openedVersions = [];
  const db = {
    objectStoreNames:{ contains:name=>stores.has(name) }, close() {}, createObjectStore(name) { stores.set(name,new Map()); },
    transaction(names, mode) {
      const scope = Array.isArray(names) ? names : [names];
      for (const name of scope) if (!stores.has(name)) throw new Error(`Missing fixture store ${name}`);
      const tx = { mode,scope,ops:[],aborted:false,draft:null,
        objectStore(name) {
          if (!scope.includes(name)) throw new Error('Store outside transaction scope');
          function request(kind,key,value) { const req={}; tx.ops.push({kind,name,key,value,req}); return req; }
          return { get:key=>request('get',key),getAll:()=>request('all'),put:(value,key)=>request('put',key,structuredClone(value)),delete:key=>request('delete',key) };
        },
        abort() { if(tx.aborted)return;tx.aborted=true;queueMicrotask(()=>{tx.onabort?.();if(active===tx){active=undefined;pump();}}); }
      };
      queue.push(tx);queueMicrotask(pump);return tx;
    }
  };
  function finish() {
    const tx=active;if(!tx||tx.aborted||tx.ops.length)return;
    if(tx.mode==='readwrite')for(const name of tx.scope)stores.set(name,tx.draft.get(name));
    tx.oncomplete?.();active=undefined;pump();
  }
  function step(tx) {
    if(tx!==active||tx.aborted)return;
    const op=tx.ops.shift();
    if(!op){if(!(options.holdWrite&&tx.mode==='readwrite'))finish();else while(held.length)held.shift()();return;}
    const writing=['put','delete'].includes(op.kind);
    if((writing&&(options.failWrite||options.failWriteStore===op.name))||(!writing&&options.failRead)){tx.onerror?.();tx.abort();return;}
    const values=tx.draft.get(op.name);
    if(op.kind==='get')op.req.result=structuredClone(values.get(op.key));
    if(op.kind==='all')op.req.result=structuredClone([...values.values()]);
    if(op.kind==='put')values.set(op.key,op.value);
    if(op.kind==='delete')values.delete(op.key);
    op.req.onsuccess?.();queueMicrotask(()=>step(tx));
  }
  function pump(){if(active||!queue.length)return;active=queue.shift();active.draft=structuredClone(stores);const tx=active;queueMicrotask(()=>step(tx));}
  const api={open(name,requestedVersion){openedNames.push(name);openedVersions.push(requestedVersion);const request={};queueMicrotask(()=>{
    if(options.failOpen||requestedVersion<version){request.error=new DOMException('Older database version','VersionError');request.onerror?.();return;}
    if(options.blocked){request.onblocked?.();return;}
    request.result=db;if(requestedVersion>version){version=requestedVersion;request.onupgradeneeded?.();}request.onsuccess?.();
  });return request;}};
  Object.defineProperty(globalThis,'indexedDB',{value:api,configurable:true,writable:true});
  return {options,finish,openedNames,openedVersions,whenHeld:()=>active?.mode==='readwrite'&&!active.ops.length&&active.draft?Promise.resolve():new Promise(resolve=>held.push(resolve)),stored:()=>structuredClone(stores.get('workspace').get('personal')),media:()=>structuredClone([...(stores.get('retelling-audio')?.values()||[])]),
    corruptMedia:file=>stores.get('retelling-audio').set(file.recording.id,file),version:()=>version,
    dispose:()=>{db.onversionchange?.();delete globalThis.indexedDB;}};
}

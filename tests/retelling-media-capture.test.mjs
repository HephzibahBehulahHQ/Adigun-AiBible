import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as turn } from 'node:timers/promises';
import { RetellingCapture } from '../src/workspace/retelling-capture.ts';
import { MAX_RETELLING_AUDIO_BYTES } from '../src/workspace/retelling-media.ts';
import { ref } from './retelling-media-fixtures.mjs';
const source={ref,editionSha256:'a'.repeat(64)};
const bytes=new Uint8Array([0x1a,0x45,0xdf,0xa3,0x80,0,255,12]);
function setup({pending=false,denied=false,unsupported=false}={}) {
  const states=[],drafts=[],idle=[];let time=0,requests=0,recorder,resolveRequest;
  const timers=new Map(),intervals=new Map();let serial=0;
  class Track extends EventTarget { stopped=false;stop(){this.stopped=true;} }
  const track=new Track();const stream={getTracks:()=>[track]};
  class Recorder {
    state='inactive';mimeType='audio/webm;codecs=opus';
    start(){this.state='recording';}
    data(blob){this.ondataavailable?.({data:blob});}
    stop(){this.state='inactive';queueMicrotask(()=>{this.data(new Blob([bytes],{type:this.mimeType}));this.onstop?.();});}
  }
  const env={request:()=>{requests++;return denied?Promise.reject(new DOMException('Denied','NotAllowedError')):pending?new Promise(resolve=>resolveRequest=resolve):Promise.resolve(stream);},supports:()=>!unsupported,create:()=>recorder=new Recorder(),now:()=>time,
    later:(fn)=>{const id=++serial;timers.set(id,fn);return id;},cancelLater:id=>timers.delete(id),every:fn=>{const id=++serial;intervals.set(id,fn);return id;},cancelEvery:id=>intervals.delete(id)};
  const capture=new RetellingCapture(state=>{states.push(state);if(state.phase==='idle')while(idle.length)idle.shift()();},draft=>drafts.push(draft),env);
  return {capture,states,drafts,track,stream,timers,intervals,requests:()=>requests,recorder:()=>recorder,resolve:()=>resolveRequest(stream),time:ms=>{time=ms;},deadline:()=>[...timers.values()][0]?.(),idle:()=>new Promise(resolve=>idle.push(resolve))};
}

test('microphone access requires explicit fresh consent and a valid source revision', async()=>{
  const f=setup();await f.capture.start(false,source);assert.equal(f.requests(),0);
  await f.capture.start(true,{...source,editionSha256:''});assert.equal(f.requests(),0);assert.equal(f.states.at(-1).error,true);
  await f.capture.start(true,source);assert.equal(f.requests(),1);assert.equal(f.states.at(-1).phase,'recording');f.capture.dispose();assert.equal(f.track.stopped,true);assert.equal(f.timers.size,0);
});

test('canceling a pending permission request stops a late stream without retaining audio',async()=>{
  const f=setup({pending:true});const opening=f.capture.start(true,source);f.capture.stop(false);assert.equal(f.states.at(-1).phase,'idle');f.resolve();await opening;assert.equal(f.track.stopped,true);assert.equal(f.drafts.length,0);assert.equal(f.recorder(),undefined);
});

test('denied permission and unsupported recording formats preserve a usable idle writing flow',async()=>{
  for(const options of [{denied:true},{unsupported:true}]){const f=setup(options);await f.capture.start(true,source);assert.equal(f.states.at(-1).phase,'idle');assert.equal(f.states.at(-1).error,true);assert.equal(f.drafts.length,0);if(options.unsupported)assert.equal(f.track.stopped,true);}
});

test('explicit stop retains exact original bytes/MIME/source and releases every microphone resource',async()=>{
  const f=setup();await f.capture.start(true,source);f.time(1250);const done=f.idle();f.capture.stop(true);await done;
  assert.equal(f.drafts.length,1);assert.equal(f.drafts[0].mimeType,'audio/webm;codecs=opus');assert.equal(f.drafts[0].captureMs,1250);assert.deepEqual(f.drafts[0].source,source);assert.deepEqual(await f.drafts[0].blob.bytes(),bytes);
  assert.equal(f.track.stopped,true);assert.equal(f.timers.size,0);assert.equal(f.intervals.size,0);
});

test('discard during finishing invalidates delayed onstop/preparation callbacks',async()=>{
  const f=setup();await f.capture.start(true,source);f.time(1000);f.capture.stop(true);f.capture.stop(false);await turn();await turn();assert.equal(f.drafts.length,0);assert.equal(f.states.at(-1).phase,'idle');assert.equal(f.track.stopped,true);
});

test('observed byte overflow discards all chunks without a partial saved recording',async()=>{
  const f=setup();await f.capture.start(true,source);const done=f.idle();const huge=new Blob();Object.defineProperty(huge,'size',{value:MAX_RETELLING_AUDIO_BYTES+1});f.recorder().data(huge);await done;
  assert.equal(f.drafts.length,0);assert.equal(f.states.at(-1).error,true);assert.match(f.states.at(-1).status,/8 MiB/);assert.equal(f.track.stopped,true);
});

test('time deadline stops within the bound; a browser delayed beyond five minutes retains no misleading duration',async()=>{
  const f=setup();await f.capture.start(true,source);f.time(299000);const done=f.idle();f.deadline();await done;assert.equal(f.drafts.length,1);assert.equal(f.drafts[0].captureMs,299000);
  const delayed=setup();await delayed.capture.start(true,source);delayed.time(300100);const failed=delayed.idle();delayed.deadline();await failed;assert.equal(delayed.drafts.length,0);assert.match(delayed.states.at(-1).status,/exceeded five minutes/);
});

test('device interruption, recorder error and unmount all stop capture and discard pending results',async()=>{
  for(const interrupt of ['device','recorder']){const f=setup();await f.capture.start(true,source);const done=f.idle();if(interrupt==='device')f.track.dispatchEvent(new Event('ended'));else f.recorder().onerror();await done;assert.equal(f.drafts.length,0);assert.equal(f.track.stopped,true);assert.equal(f.states.at(-1).error,true);}
  const f=setup();await f.capture.start(true,source);const before=f.states.length;f.capture.dispose();await turn();assert.equal(f.states.length,before);assert.equal(f.track.stopped,true);assert.equal(f.drafts.length,0);
  const pending=setup({pending:true});const opening=pending.capture.start(true,source);pending.capture.dispose();pending.resolve();await opening;assert.equal(pending.track.stopped,true);assert.equal(pending.drafts.length,0);
});

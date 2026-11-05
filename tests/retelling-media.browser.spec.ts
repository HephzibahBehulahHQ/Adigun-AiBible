import { expect,test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const route='#/study/JHN/3?verse=16&edition=eng-web&tab=memory';
const consent='I consent to this private recording and have permission from everyone being recorded.';
// Controlled permission results; successful capture still uses a real browser AudioContext,
// MediaStream and MediaRecorder. No human voice, provider or fake production data is involved.
async function microphone(page:Page,mode:'working'|'pending'|'denied'='working') {
  await page.addInitScript(mode=>{
    const w=window as typeof window & {__retellingTest:{requests:number;stopped:number;chunks:number;resolve?:()=>Promise<void>;disconnect?:()=>void}};
    const state:typeof w.__retellingTest=w.__retellingTest={requests:0,stopped:0,chunks:0};
    const NativeRecorder=window.MediaRecorder;
    class ObservedRecorder extends NativeRecorder {
      constructor(stream:MediaStream,options?:MediaRecorderOptions){super(stream,options);this.addEventListener('dataavailable',event=>{if(event.data.size)state.chunks++;});}
    }
    Object.defineProperty(window,'MediaRecorder',{value:ObservedRecorder,configurable:true});
    async function stream(){
      const context=new AudioContext();const oscillator=context.createOscillator();const gain=context.createGain();gain.gain.value=0.05;
      const destination=context.createMediaStreamDestination();oscillator.connect(gain);gain.connect(destination);oscillator.start();await context.resume();
      let stopped=false;const track=destination.stream.getAudioTracks()[0];const stop=track.stop.bind(track);
      Object.defineProperty(track,'stop',{value:()=>{stop();if(!stopped){stopped=true;state.stopped++;oscillator.stop();void context.close();}}});
      state.disconnect=()=>track.dispatchEvent(new Event('ended'));
      return destination.stream;
    }
    Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>{
      state.requests++;
      if(mode==='denied')throw new DOMException('Controlled permission denial','NotAllowedError');
      if(mode==='pending')return new Promise<MediaStream>(resolve=>{state.resolve=async()=>resolve(await stream());});
      return stream();
    }});
  },mode);
}
async function openRetelling(page:Page,add=true){
  await page.goto(route);await expect(page.getByRole('heading',{name:'Personal workspace',exact:true})).toBeVisible();
  if(add)await page.getByRole('button',{name:'Add to memorization',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Practice this passage',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Write a retelling',exact:true}).click();
  await expect(page.getByLabel(consent,{exact:true})).toBeEnabled();
}
async function record(page:Page){
  const previous=await page.evaluate(()=>(window as unknown as {__retellingTest:{chunks:number}}).__retellingTest.chunks);
  await page.getByLabel(consent,{exact:true}).check();await page.getByRole('button',{name:'Start private recording',exact:true}).click();
  await expect(page.getByRole('button',{name:'Stop and keep recording',exact:true})).toBeVisible();
  await page.waitForFunction(previous=>(window as unknown as {__retellingTest:{chunks:number}}).__retellingTest.chunks>previous,previous);
  await page.getByRole('button',{name:'Stop and keep recording',exact:true}).click();
  await expect(page.getByRole('region',{name:'Unsaved recording',exact:true})).toBeVisible();
  await expect(page.getByLabel(consent,{exact:true})).not.toBeChecked();
}
async function originalBytes(page:Page){
  const downloading=page.waitForEvent('download');await page.getByRole('link',{name:'Download original recording',exact:true}).first().click();return readFile((await(await downloading).path())!);
}
async function deviceInventory(page:Page){
  return page.evaluate(async()=>{
    const snapshot=await new Promise<{state:any;media:any[]}>((resolve,reject)=>{
      const opening=indexedDB.open('adigun-aibible-workspace',2);opening.onerror=()=>reject(opening.error);
      opening.onsuccess=()=>{const db=opening.result;const tx=db.transaction(['workspace','retelling-audio'],'readonly');const state=tx.objectStore('workspace').get('personal');const media=tx.objectStore('retelling-audio').getAll();tx.oncomplete=()=>{db.close();resolve({state:state.result,media:media.result});};tx.onabort=()=>reject(tx.error);};
    });
    return {state:snapshot.state,media:await Promise.all(snapshot.media.map(async file=>({recording:file.recording,mime:file.blob.type,bytes:file.blob.size,hash:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.blob.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('')})))};
  });
}
async function save(page:Page){await page.getByRole('button',{name:'Save private retelling',exact:true}).click();await expect(page.getByRole('region',{name:'Unsaved recording',exact:true})).toHaveCount(0);await expect(page.getByLabel('My retelling',{exact:true})).toHaveValue('');}
async function history(page:Page,count=1){await page.getByText(`Saved retellings (${count})`,{exact:true}).click();await expect(page.getByRole('link',{name:'Download original recording',exact:true})).toBeVisible();}

test.describe('private capture controls',{tag:'@retelling-audio'},()=>{
  test.use({serviceWorkers:'block'});
  test('consent, real original bytes, manual transcript, individual delete and Undo remain private',async({page},testInfo)=>{
    await microphone(page);const writes:string[]=[];page.on('request',request=>{if(!['GET','HEAD'].includes(request.method()))writes.push(request.url());});await openRetelling(page);
    await expect(page.getByRole('button',{name:'Start private recording',exact:true})).toBeDisabled();expect(await page.evaluate(()=>(window as any).__retellingTest.requests)).toBe(0);
    await record(page);const original=await originalBytes(page);expect(original.length).toBeGreaterThan(16);
    await save(page);await history(page);await expect(page.getByText('No manual transcript added.',{exact:true})).toBeVisible();
    expect(await page.locator('audio[aria-label="Original retelling recording"]').evaluate(async(audio:HTMLAudioElement)=>{audio.muted=true;await audio.play();const played=!audio.paused;audio.pause();return played;})).toBe(true);
    await page.getByRole('button',{name:'Edit manual transcript',exact:true}).click();await page.getByLabel('Manual transcript',{exact:true}).fill('My manual transcript: àánú.');await page.getByRole('button',{name:'Save manual transcript',exact:true}).click();
    await expect(page.getByText('My manual transcript: àánú.',{exact:true})).toBeVisible();expect(await originalBytes(page)).toEqual(original);
    const inventory=await deviceInventory(page);expect(inventory.state.schemaVersion).toBe(2);expect(inventory.state.cards[0].history).toEqual([]);expect(inventory.media[0].hash).toBe(createHash('sha256').update(original).digest('hex'));expect(inventory.media[0].recording.source.ref.editionId).toBe('eng-web');expect(inventory.media[0].recording.source.editionSha256).toMatch(/^[a-f0-9]{64}$/);
    await page.screenshot({path:testInfo.outputPath('retelling-audio-workspace.png'),fullPage:true});await page.setViewportSize({width:320,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);await page.screenshot({path:testInfo.outputPath('retelling-audio-320.png'),fullPage:true});
    await page.getByRole('button',{name:'Delete recording, keep transcript',exact:true}).click();await expect(page.getByRole('link',{name:'Download original recording',exact:true})).toHaveCount(0);expect((await deviceInventory(page)).media).toEqual([]);await expect(page.getByText('My manual transcript: àánú.',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Undo last change',exact:true}).click();await expect(page.getByRole('link',{name:'Download original recording',exact:true})).toBeVisible();expect(await originalBytes(page)).toEqual(original);expect(writes).toEqual([]);
  });
  test('pending permission cancellation stops a late stream and denied permission preserves written retellings',async({page,context})=>{
    await microphone(page,'pending');await openRetelling(page);await page.getByLabel(consent,{exact:true}).check();await page.getByRole('button',{name:'Start private recording',exact:true}).click();await page.getByRole('button',{name:'Cancel microphone request',exact:true}).click();
    await page.evaluate(async()=>{await(window as any).__retellingTest.resolve();});await expect.poll(()=>page.evaluate(()=>(window as any).__retellingTest.stopped)).toBe(1);await expect(page.getByRole('region',{name:'Unsaved recording',exact:true})).toHaveCount(0);
    const denied=await context.newPage();await microphone(denied,'denied');await openRetelling(denied,false);await denied.getByLabel(consent,{exact:true}).check();await denied.getByRole('button',{name:'Start private recording',exact:true}).click();await expect(denied.getByRole('alert')).toContainText('permission was denied');await denied.getByLabel('My retelling',{exact:true}).fill('Writing survives microphone denial.');await save(denied);expect((await deviceInventory(denied)).media).toEqual([]);await denied.close();
  });
  test('active recording guards internal navigation and updates; deliberate leave stops the microphone',async({page})=>{
    await microphone(page);await openRetelling(page);await page.getByLabel(consent,{exact:true}).check();await page.getByRole('button',{name:'Start private recording',exact:true}).click();await expect(page.getByRole('button',{name:'Stop and keep recording',exact:true})).toBeVisible();
    expect(await page.evaluate(()=>window.dispatchEvent(new Event('adigun:before-update',{cancelable:true})))).toBe(false);
    page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'Prayer journal',exact:true}).click();await expect(page.getByRole('button',{name:'Stop and keep recording',exact:true})).toBeVisible();
    page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Hide and reveal',exact:true}).click();await expect(page.getByRole('heading',{name:'Retell in your own words',exact:true})).toHaveCount(0);await expect.poll(()=>page.evaluate(()=>(window as any).__retellingTest.stopped)).toBe(1);expect((await deviceInventory(page)).media).toEqual([]);
  });
  test('delayed Add preserves new writing and an original completed while its transaction is pending',async({page},testInfo)=>{
    await microphone(page);await openRetelling(page);
    let releaseSource!:()=>void,sourceRequested!:()=>void;
    const sourceGate=new Promise<void>(resolve=>{releaseSource=resolve;});
    const sourceStarted=new Promise<void>(resolve=>{sourceRequested=resolve;});
    const exodus=await readFile(new URL('../data/books/EXO.json',import.meta.url),'utf8');
    await page.route('**/data/books/EXO.json',async request=>{
      sourceRequested();await sourceGate;
      await request.fulfill({status:200,contentType:'application/json',body:exodus}).catch(()=>undefined);
    });
    try{
      await page.evaluate(()=>{location.hash='#/study/EXO/1?verse=1&edition=eng-web&tab=memory';});
      await sourceStarted;
      await page.getByRole('button',{name:'Add to memorization',exact:true}).click();
      await expect(page.getByRole('button',{name:'Checking source passage…',exact:true})).toBeDisabled();
      const writing=page.getByLabel('My retelling',{exact:true});
      await expect(writing).toBeEnabled();await writing.fill('Keep the draft begun while another passage was loading.');
      await page.getByLabel(consent,{exact:true}).check();
      await page.getByRole('button',{name:'Start private recording',exact:true}).click();
      await expect(page.getByRole('button',{name:'Stop and keep recording',exact:true})).toBeVisible();
      await page.waitForFunction(()=>(window as any).__retellingTest.chunks>0);
      // Keep the real shared IDB transaction active; no production storage seam or fake bytes.
      await page.evaluate(()=>{
        const original=IDBDatabase.prototype.transaction;
        const w=window as typeof window & {__pendingRetellingAdd:{held:boolean;release:()=>void;restore:()=>void}};
        let holding=true;
        const control:typeof w.__pendingRetellingAdd=w.__pendingRetellingAdd={held:false,release:()=>{holding=false;},restore:()=>{holding=false;IDBDatabase.prototype.transaction=original;}};
        IDBDatabase.prototype.transaction=function(...args:Parameters<IDBDatabase['transaction']>){
          const tx=original.apply(this,args),names=typeof args[0]==='string'?[args[0]]:Array.from(args[0]);
          if(this.name==='adigun-aibible-workspace'&&args[1]==='readwrite'&&names.includes('workspace')&&!control.held){
            control.held=true;
            const keepOpen=()=>{const read=tx.objectStore('workspace').get('personal');read.onsuccess=()=>{if(holding)keepOpen();};};
            keepOpen();
          }
          return tx;
        };
      });
      releaseSource();
      await page.waitForFunction(()=>(window as any).__pendingRetellingAdd.held);
      await expect(writing).toBeDisabled();
      await page.getByRole('button',{name:'Stop and keep recording',exact:true}).click();
      await expect(page.getByRole('region',{name:'Unsaved recording',exact:true})).toBeVisible();
      const original=await originalBytes(page);expect(original.length).toBeGreaterThan(16);
      const confirmation=page.waitForEvent('dialog').then(async dialog=>{expect(dialog.message()).toContain('Unsaved writing or recording');await dialog.dismiss();});
      await page.evaluate(()=>(window as any).__pendingRetellingAdd.release());
      await confirmation;
      await expect(writing).toBeEnabled();
      await expect(writing).toHaveValue('Keep the draft begun while another passage was loading.');
      await expect(page.getByRole('navigation',{name:'Memory cards'}).getByRole('button',{name:/^JHN 3:16/})).toHaveAttribute('aria-current','true');
      expect(await originalBytes(page)).toEqual(original);
      await page.screenshot({path:testInfo.outputPath('retelling-delayed-add-draft-preserved.png'),fullPage:true});
      const added=await deviceInventory(page);expect(added.state.cards).toHaveLength(2);expect(added.media).toEqual([]);
      expect(added.state.cards.find((card:any)=>card.ref.bookId==='EXO').retellings).toEqual([]);
      await save(page);
      const saved=await deviceInventory(page),retelling=saved.state.cards.find((card:any)=>card.ref.bookId==='JHN').retellings[0];
      expect(retelling.text).toBe('Keep the draft begun while another passage was loading.');
      expect(saved.media).toHaveLength(1);expect(saved.media[0].hash).toBe(createHash('sha256').update(original).digest('hex'));
      expect(saved.media[0].recording.source.ref.bookId).toBe('JHN');
    }finally{
      releaseSource();await page.evaluate(()=>(window as any).__pendingRetellingAdd?.restore()).catch(()=>undefined);
    }
  });
});

test('real original audio survives offline reload, complete backup, restore, card/workspace deletion and Undo',async({page,context})=>{
  await microphone(page);await openRetelling(page);await record(page);const original=await originalBytes(page);await page.getByLabel('My retelling',{exact:true}).fill('Offline manual transcript with àánú.');await save(page);
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);await page.evaluate(()=>localStorage.setItem('unrelated-retelling-fixture','retain'));
  await context.setOffline(true);
  try{
    await page.reload();await page.getByRole('button',{name:'Write a retelling',exact:true}).click();await history(page);expect(await originalBytes(page)).toEqual(original);
    await page.getByText('Backup, restore and privacy',{exact:true}).click();const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Export workspace JSON',exact:true}).click();const backup=await readFile((await(await downloading).path())!);const parsed=JSON.parse(backup.toString());
    expect(parsed.schemaVersion).toBe(2);expect(Buffer.from(parsed.media[0].dataBase64,'base64')).toEqual(original);expect(parsed.state.cards[0].retellings[0].recording.sha256).toBe(createHash('sha256').update(original).digest('hex'));
    const corrupt=structuredClone(parsed);corrupt.media[0].dataBase64=corrupt.media[0].dataBase64.slice(4);await page.getByLabel('Preview workspace backup',{exact:true}).setInputFiles({name:'corrupt.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(corrupt))});await expect(page.getByRole('alert')).toContainText('recording bytes');expect((await deviceInventory(page)).media).toHaveLength(1);
    await page.getByRole('button',{name:/^Delete memory card /}).click();await expect(page.getByRole('heading',{name:'Practice this passage',exact:true})).toHaveCount(0);expect((await deviceInventory(page)).media).toHaveLength(0);
    await page.getByRole('button',{name:'Undo last change',exact:true}).click();await page.getByRole('button',{name:'Write a retelling',exact:true}).click();await history(page);expect(await originalBytes(page)).toEqual(original);
    await page.getByRole('button',{name:'Delete personal workspace records',exact:true}).click();await page.getByRole('button',{name:'Confirm workspace deletion',exact:true}).click();await expect(page.getByRole('heading',{name:'Practice this passage',exact:true})).toHaveCount(0);expect((await deviceInventory(page)).media).toEqual([]);
    await page.getByLabel('Preview workspace backup',{exact:true}).setInputFiles({name:'complete.json',mimeType:'application/json',buffer:backup});await expect(page.getByRole('region',{name:'Import preview',exact:true})).toContainText('1 verified original recording');await page.getByRole('button',{name:'Import previewed records',exact:true}).click();await expect(page.getByRole('heading',{name:'Practice this passage',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Write a retelling',exact:true}).click();await history(page);expect(await originalBytes(page)).toEqual(original);await expect(page.getByText('Offline manual transcript with àánú.',{exact:true})).toBeVisible();expect(await page.evaluate(()=>localStorage.getItem('unrelated-retelling-fixture'))).toBe('retain');
    await page.getByRole('button',{name:/^Delete retelling from /}).click();expect((await deviceInventory(page)).media).toEqual([]);await page.reload();expect((await deviceInventory(page)).media).toEqual([]);
  }finally{await context.setOffline(false);}
});

test.describe('retelling data recovery',()=>{
  test.use({serviceWorkers:'block'});
  test('source review retains exact Arabic and Myanmar wording with source fonts and direction',async({page})=>{
    for(const fixture of [
      {edition:'arb-vandyck',book:'JHN',chapter:3,verse:16,language:'ar',direction:'rtl',font:'Adigun Naskh'},
      {edition:'mya-judson1840',book:'LEV',chapter:4,verse:2,language:'my',direction:'ltr',font:'Adigun Myanmar'}
    ]){
      const book=JSON.parse(await readFile(new URL(`../data/editions/${fixture.edition}/books/${fixture.book}.json`,import.meta.url),'utf8'));
      const wording=book.chapters.find((item:{number:number})=>item.number===fixture.chapter).verses.find((item:{number:number})=>item.number===fixture.verse).text;
      await page.goto(`#/study/${fixture.book}/${fixture.chapter}?verse=${fixture.verse}&edition=${fixture.edition}&tab=memory`);
      await page.getByRole('button',{name:'Add to memorization',exact:true}).click();
      await page.getByRole('button',{name:'Write a retelling',exact:true}).click();
      await page.getByText(/^Review the exact source wording/).click();
      const source=page.locator('section[aria-labelledby="retelling-heading"] .workspace-source');
      await expect(source).toHaveAttribute('lang',fixture.language);await expect(source).toHaveAttribute('dir',fixture.direction);
      expect(await source.locator('p').evaluate(element=>[...element.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE).map(node=>node.textContent).join(''))).toBe(wording);
      await expect.poll(()=>source.evaluate(element=>getComputedStyle(element).fontFamily)).toContain(fixture.font);
      await expect(page.getByLabel('My retelling',{exact:true})).toHaveAttribute('dir','auto');
      expect((await deviceInventory(page)).media).toEqual([]);
    }
  });
  test('scheduling a review keeps the loaded card selected and retains its unsaved retelling',async({page})=>{
    await openRetelling(page);
    await page.goto(route.replace('verse=16','verse=17'));
    await page.getByRole('button',{name:'Add to memorization',exact:true}).click();
    await expect(page.getByRole('button',{name:'Passage already in your practice list',exact:true})).toBeVisible();
    await page.reload();
    await page.getByRole('button',{name:'Write a retelling',exact:true}).click();
    await page.getByRole('textbox',{name:'My retelling',exact:true}).fill('Keep the first card draft when its review moves later.');
    await page.getByRole('button',{name:'Recalled well',exact:true}).click();
    await expect(page.getByRole('textbox',{name:'My retelling',exact:true})).toHaveValue('Keep the first card draft when its review moves later.');
    await save(page);
    const saved=await deviceInventory(page),first=saved.state.cards.find((card:{ref:{verse:number}})=>card.ref.verse===16),second=saved.state.cards.find((card:{ref:{verse:number}})=>card.ref.verse===17);
    expect(first.retellings[0].text).toBe('Keep the first card draft when its review moves later.');expect(first.history).toHaveLength(1);
    expect(second.retellings).toEqual([]);expect(second.history).toEqual([]);
  });
  test('an unsaved transcript survives deleting another retelling and requires consent before switching edits',async({page})=>{
    await microphone(page);await openRetelling(page);
    for(const text of ['First original transcript.','Second original transcript.']){await record(page);await page.getByLabel('My retelling',{exact:true}).fill(text);await save(page);}
    await page.getByText('Saved retellings (2)',{exact:true}).click();
    await expect(page.getByRole('link',{name:'Download original recording',exact:true})).toHaveCount(2);
    const before=await deviceInventory(page),second=before.state.cards[0].retellings[1];
    await page.getByRole('button',{name:'Edit manual transcript',exact:true}).nth(1).click();
    const transcript=page.getByRole('textbox',{name:'Manual transcript',exact:true});
    await transcript.fill('Keep my unsaved second transcript: àánú.');
    page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'Edit manual transcript',exact:true}).first().click();
    await expect(transcript).toHaveValue('Keep my unsaved second transcript: àánú.');
    await page.getByRole('button',{name:/^Delete retelling from /}).first().click();
    await expect(page.getByText('Saved retellings (1)',{exact:true})).toBeVisible();
    await expect(transcript).toHaveValue('Keep my unsaved second transcript: àánú.');
    await page.getByRole('button',{name:'Save manual transcript',exact:true}).click();
    await expect(page.getByRole('region',{name:'Manual transcript editor',exact:true})).toHaveCount(0);
    const after=await deviceInventory(page);
    expect(after.state.cards[0].retellings).toEqual([{...second,text:'Keep my unsaved second transcript: àánú.'}]);
    expect(after.media).toEqual(before.media.filter(file=>file.recording.id===second.id));
  });
  test('refresh after another tab deletes the edited original keeps its transcript separate and recoverable',async({page,context},testInfo)=>{
    await microphone(page);await openRetelling(page);
    for(const text of ['First original transcript.','Second original transcript.']){await record(page);await page.getByLabel('My retelling',{exact:true}).fill(text);await save(page);}
    await page.getByText('Saved retellings (2)',{exact:true}).click();
    const before=await deviceInventory(page),second=before.state.cards[0].retellings[1];
    const other=await context.newPage();await openRetelling(other,false);await other.getByText('Saved retellings (2)',{exact:true}).click();
    await other.getByRole('button',{name:'Edit manual transcript',exact:true}).first().click();
    const transcript=other.getByRole('textbox',{name:'Manual transcript',exact:true});
    await transcript.fill('Private draft belonging to the deleted first recording.');
    await page.getByRole('button',{name:/^Delete retelling from /}).first().click();
    await expect(page.getByText('Saved retellings (1)',{exact:true})).toBeVisible();
    await other.getByRole('button',{name:'Save manual transcript',exact:true}).click();
    await expect(other.getByRole('alert')).toContainText('Another tab saved a newer workspace');
    other.once('dialog',dialog=>dialog.accept());await other.getByRole('button',{name:'Reload workspace',exact:true}).click();
    await other.getByRole('button',{name:'Use refreshed history and keep draft',exact:true}).click();
    await expect(other.getByRole('region',{name:'Manual transcript editor',exact:true})).toContainText('will not overwrite another retelling');
    await expect(transcript).toHaveValue('Private draft belonging to the deleted first recording.');
    await expect(other.getByRole('button',{name:'Save manual transcript',exact:true})).toBeDisabled();
    await other.setViewportSize({width:320,height:844});
    await other.screenshot({path:testInfo.outputPath('retelling-transcript-recovery-320.png'),fullPage:true});
    expect((await deviceInventory(other)).state.cards[0].retellings).toEqual([second]);
    await other.getByRole('button',{name:'Use transcript as new written retelling',exact:true}).click();
    await expect(other.getByRole('textbox',{name:'My retelling',exact:true})).toHaveValue('Private draft belonging to the deleted first recording.');
    await save(other);
    const after=await deviceInventory(other);
    expect(after.state.cards[0].retellings[0]).toEqual(second);
    expect(after.state.cards[0].retellings[1].text).toBe('Private draft belonging to the deleted first recording.');
    expect(after.state.cards[0].retellings[1].recording).toBeUndefined();
    expect(after.media).toEqual(before.media.filter(file=>file.recording.id===second.id));
    await other.close();
  });
  test('stale-tab recording and writing survive conflict and can append after explicit history refresh',async({page,context})=>{
    await openRetelling(page);const second=await context.newPage();await microphone(second);await openRetelling(second,false);await record(second);const original=await originalBytes(second);await second.getByLabel('My retelling',{exact:true}).fill('Second tab draft must survive.');
    await page.getByLabel('My retelling',{exact:true}).fill('First tab saved writing.');await save(page);
    await second.getByRole('button',{name:'Save private retelling',exact:true}).click();await expect(second.getByRole('alert')).toContainText('Another tab saved a newer workspace');await expect(second.getByLabel('My retelling',{exact:true})).toHaveValue('Second tab draft must survive.');expect(await originalBytes(second)).toEqual(original);expect((await deviceInventory(second)).media).toEqual([]);
    second.once('dialog',dialog=>dialog.accept());await second.getByRole('button',{name:'Reload workspace',exact:true}).click();await second.getByRole('button',{name:'Use refreshed history and keep draft',exact:true}).click();await save(second);await history(second,2);expect(await originalBytes(second)).toEqual(original);await expect(second.getByText('First tab saved writing.',{exact:true})).toBeVisible();expect((await deviceInventory(second)).media).toHaveLength(1);await second.close();
  });
  test('an injected quota failure keeps the saved card, transcript draft and original until retry',async({page})=>{
    await microphone(page);await openRetelling(page);await record(page);const original=await originalBytes(page);await page.getByLabel('My retelling',{exact:true}).fill('Keep this unsaved transcript.');
    const before=await deviceInventory(page);
    await page.evaluate(()=>{const put=IDBObjectStore.prototype.put;(window as any).__restoreRetellingPut=()=>{IDBObjectStore.prototype.put=put;};IDBObjectStore.prototype.put=function(...args:Parameters<IDBObjectStore['put']>){if(this.name==='retelling-audio')throw new DOMException('Controlled quota failure','QuotaExceededError');return put.apply(this,args);};});
    await page.getByRole('button',{name:'Save private retelling',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Controlled quota failure');await expect(page.getByLabel('My retelling',{exact:true})).toHaveValue('Keep this unsaved transcript.');expect(await originalBytes(page)).toEqual(original);expect(await deviceInventory(page)).toEqual(before);
    await page.evaluate(()=>(window as any).__restoreRetellingPut());await save(page);expect((await deviceInventory(page)).media).toHaveLength(1);
  });
  test('version-one records migrate without text changes and an old client cannot reopen the upgraded database',async({page})=>{
    await page.goto('./');
    const at='2026-11-04T06:00:00.000Z';const reference={bookId:'JHN',chapter:3,verse:16,editionId:'eng-web'};
    const legacy={schemaVersion:1,revision:7,prayers:[{id:'legacy-prayer',createdAt:at,updatedAt:at,title:'Keep my prayer',text:'Exact writing: àánú. ',category:'',tags:[],refs:[reference],reflection:'',outcome:'',followUp:'',history:[]}],boards:[],cards:[{id:'legacy-card',createdAt:at,updatedAt:at,ref:reference,timeZone:'UTC',dueDate:'2026-11-05',intervalDays:3,successfulReviews:1,lapses:0,contextNotes:'Legacy context',history:[],retellings:[{at,text:'  Original legacy retelling.  '}]}],plans:[],reflections:[]};
    await page.evaluate(state=>new Promise<void>((resolve,reject)=>{const opening=indexedDB.open('adigun-aibible-workspace',1);opening.onupgradeneeded=()=>opening.result.createObjectStore('workspace');opening.onerror=()=>reject(opening.error);opening.onsuccess=()=>{const db=opening.result;db.onversionchange=()=>db.close();const tx=db.transaction('workspace','readwrite');tx.objectStore('workspace').put(state,'personal');tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);};}),legacy);
    await openRetelling(page,false);await page.getByText('Saved retellings (1)',{exact:true}).click();await expect(page.getByText('Original legacy retelling.',{exact:true})).toBeVisible();await page.getByLabel('My retelling',{exact:true}).fill('New writing after migration.');await save(page);
    const saved=await deviceInventory(page);expect(saved.state.schemaVersion).toBe(2);expect(saved.state.prayers).toEqual(legacy.prayers);expect(saved.state.cards[0].retellings[0]).toEqual(legacy.cards[0].retellings[0]);expect(saved.state.cards[0].intervalDays).toBe(3);
    expect(await page.evaluate(()=>new Promise<string>(resolve=>{const open=indexedDB.open('adigun-aibible-workspace',1);open.onerror=()=>resolve(open.error?.name||'error');open.onsuccess=()=>{open.result.close();resolve('unexpected success');};}))).toBe('VersionError');
  });
});

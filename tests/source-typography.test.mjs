import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ensureSourceFont, sourceDirection, sourceFont } from '../src/source-typography.ts';
import { paginatePassageCards, drawPassageCard, wrapExactText } from '../src/sharing/pagination.ts';
import { layoutWidget, drawWidget } from '../src/widget/model.ts';

const measure = (text, font) => [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].length * Number(font.match(/(\d+)px/)[1]) * .53;
const sample = [
  { id:'ar', editionId:'ar', editionName:'Arabic source', language:'ar', reference:'Source 1', text:'اللُّغَةُ  العَرَبِيَّةُ\n'.repeat(16) },
  { id:'my', editionId:'my', editionName:'Myanmar source', language:'my', reference:'Source 2', text:'မြန်မာစာ  မြန်မာစာ\n'.repeat(16) },
];
const sources = sample.map(p => ({ id:p.editionId, name:p.editionName, credit:'Required source credit' }));
const recordingCanvas = () => {
  const calls=[];
  const context={ font:'',direction:'',textAlign:'',fillRect(){},fillText(text,x,y){ calls.push({text,x,y,font:this.font,direction:this.direction,align:this.textAlign}); } };
  return { canvas:{width:0,height:0,getContext:()=>context}, calls };
};

test('bundled fonts and complete licenses match the pinned upstream bytes', () => {
  const manifest=JSON.parse(readFileSync(new URL('../public/fonts/sources.json',import.meta.url),'utf8'));
  assert.equal(manifest.sourceRevision,'fbe81817505e8aeadc53cc7a38a2b76fb57c333e');
  assert.deepEqual(manifest.fonts.map(f=>f.sha256),['67b5a525a661b607971fbd3f96a81b89d3a768e74534fca84f18ac97e6fab72f','7abbbfbe2514105d7ce94937aee3feb2ba89b73a256c8b77b5866bd9b83e32ec']);
  for(const entry of manifest.fonts){
    const bytes=readFileSync(new URL('../'+entry.path,import.meta.url));
    assert.equal(bytes.length,entry.bytes);assert.equal(bytes.readUInt32BE(0),0x00010000);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);
    const notice=readFileSync(new URL('../'+entry.noticePath,import.meta.url));
    assert.equal(createHash('sha256').update(notice).digest('hex'),entry.noticeSha256);
    assert.match(notice.toString(),/SIL OPEN FONT LICENSE Version 1.1/);
    assert.match(notice.toString(),/TERMINATION/);
  }
});

test('mixed-script cards preserve every grapheme and restore left-to-right source credits', () => {
  const layout=paginatePassageCards('Language samples',sample,sources,{size:'story',margin:96},measure);
  for(const passage of sample){
    const pieces=layout.pages.flatMap(page=>page.fragments.filter(f=>f.passage.id===passage.id));
    assert.equal(pieces.flatMap(f=>f.lines).join(''),passage.text);
    const clusters=[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(passage.text)].map(v=>v.segment);
    for(const fragment of pieces)for(const line of fragment.lines){
      assert.ok(!/^\p{M}/u.test(line));
      assert.ok(clusters.includes([...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(line)][0].segment));
    }
  }
  layout.pages.forEach((page,index)=>{
    const {canvas,calls}=recordingCanvas();drawPassageCard(canvas,layout,index,'gold');
    for(const fragment of page.fragments){
      const line=fragment.lines[0].replace(/[\r\n]+$/g,'');
      const call=calls.find(c=>c.text===line&&c.font===`${layout.bodyFont}px ${sourceFont(fragment.passage.language)}`);
      assert.ok(call);
      const isRtl=fragment.passage.language==='ar';assert.equal(call.direction,isRtl?'rtl':'ltr');
      assert.equal(call.align,isRtl?'right':'left');assert.equal(call.x,isRtl?layout.width-layout.margin:layout.margin);
    }
    assert.equal(calls.at(-1).direction,'ltr');assert.equal(calls.at(-1).align,'left');
  });
});

test('the lock-screen card measures and draws the same source font and direction', () => {
  const passage={...sample[0],text:sample[0].text.split('\n')[0]};
  const source={title:'Source 1',passages:[passage],sources:[sources[0]],editions:[],wholeChapter:false};
  const layout=layoutWidget(source,measure),{canvas,calls}=recordingCanvas();drawWidget(canvas,layout,'ivory');
  const line=calls.find(c=>c.text===passage.text);assert.ok(line);assert.equal(line.direction,'rtl');
  assert.equal(line.x,layout.width-layout.margin);assert.match(line.font,/Adigun Naskh/);
  assert.equal(layout.textLines.join(''),passage.text);assert.equal(calls.at(-1).direction,'ltr');
});

test('font-dependent export waits for the loaded face and fails explicitly when it is unavailable', async () => {
  let release;const pending=new Promise(resolve=>{release=resolve;});let complete=false;
  const target={fonts:{load:async()=>{await pending;return[{status:'loaded'}];},check:()=>true}};
  const loading=ensureSourceFont('my','မြန်မာ',target).then(()=>{complete=true;});await Promise.resolve();assert.equal(complete,false);
  release();await loading;assert.equal(complete,true);
  await assert.rejects(ensureSourceFont('ar','العربية',{fonts:{load:async()=>[],check:()=>false}}),/font is unavailable/);
  await assert.rejects(ensureSourceFont('my','မြန်မာ',{}),/cannot verify/);
  await ensureSourceFont('en','English',{});
  assert.equal(sourceDirection('ar-Latn'),'ltr');assert.equal(sourceDirection('sr-Cyrl'),'ltr');
  assert.equal(wrapExactText('မြန်မာစာ  العربية',120,t=>t.length*10).join(''),'မြန်မာစာ  العربية');
});

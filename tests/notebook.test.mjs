import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNotebook } from '../src/notebook.ts';
import { emptyStudy } from '../src/domain.ts';

test('notebook binds excerpts and attribution to each saved edition and retains private progress',async()=>{
  const study={...emptyStudy(),bookmarks:[{bookId:'GEN',chapter:1,verse:1,editionId:'deu1912'}],notes:[{id:'n',ref:{bookId:'GEN',chapter:1,verse:1},text:'My private reflection.',updatedAt:'2026-11-03T00:00:00Z'}],completedSessions:['steady-0'],highlights:['GEN.1.1'],readingDays:['2026-11-03']};
  const calls=[];
  const text=await buildNotebook(study,{manifest:async edition=>({edition:{id:edition,name:`Edition ${edition}`,license:'Fixture license',licenseUrl:'https://example.com/rights',sourceUrl:'https://example.com/source'}}),book:async(id,edition)=>{calls.push(edition);return{id,name:'Genesis',chapters:[{number:1,verses:[{number:1,text:`Source wording for ${edition}`}]}]};}});
  assert.deepEqual(calls,['deu1912','eng-web']);
  assert.match(text,/Source wording for deu1912/);assert.match(text,/Source wording for eng-web/);
  assert.match(text,/My private reflection/);assert.match(text,/steady-0/);assert.match(text,/2026-11-03/);assert.match(text,/https:\/\/example.com\/rights/);
});

test('source outages do not prevent personal-note recovery or fabricate quotations',async()=>{
  const study={...emptyStudy(),notes:[{id:'n',ref:{bookId:'GEN',chapter:1,verse:1,editionId:'yor'},text:'Recover this note.',updatedAt:'2026-11-03T00:00:00Z'}]};
  const unavailable=async()=>{throw new Error('offline');};
  const text=await buildNotebook(study,{manifest:unavailable,book:unavailable});
  assert.match(text,/Recover this note/);assert.match(text,/Source excerpt unavailable/);assert.doesNotMatch(text,/> 1\./);
});

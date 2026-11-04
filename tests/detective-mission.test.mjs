import test from 'node:test';
import assert from 'node:assert/strict';
import { createDetectiveMissionReflection, detectiveMission, detectiveMissionReferences } from '../src/workspace/detective-mission.ts';

test('detective mission has five evidence-based clues with supported answers and source references',()=>{
 assert.equal(detectiveMission.clues.length,5);
 assert.equal(new Set(detectiveMission.clues.map(clue=>clue.id)).size,5);
 for(const clue of detectiveMission.clues){
   assert.ok(clue.options.some(option=>option.id===clue.answerId));
   assert.ok(clue.references.length>0);
   assert.ok(clue.hint.length>0);
   assert.ok(clue.evidence.length>0);
 }
 const refs=detectiveMissionReferences('yor');
 assert.ok(refs.length>=5);
 assert.ok(refs.every(ref=>ref.editionId==='yor'));
 assert.deepEqual(detectiveMissionReferences('eng-web','helper').map(ref=>ref.bookId),['LUK']);
});

test('mission result can be saved only after all five clues and retains selected-edition evidence',()=>{
 const entry=createDetectiveMissionReflection('eng-web',5,new Date('2026-11-04T22:00:00.000Z'));
 assert.equal(entry.kind,'application');
 assert.equal(entry.state,'unresolved');
 assert.equal(entry.refs.length,5);
 assert.ok(entry.refs.every(ref=>ref.editionId==='eng-web'));
 assert.match(entry.title,/The Good Samaritan/);
 assert.match(entry.text,/5\/5 evidence clues solved/);
 assert.match(entry.text,/not a faith score/);
 assert.equal('score' in entry,false);
 assert.throws(()=>createDetectiveMissionReflection('eng-web',4),/Solve all five/);
});

test('invalid editions and clue IDs are rejected',()=>{
 assert.throws(()=>detectiveMissionReferences(''),/valid source edition/);
 assert.throws(()=>detectiveMissionReferences('eng-web','missing'),/does not exist/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createInterpretationChallenge } from '../src/workspace/model.ts';

const passage={bookId:'JHN',chapter:3,verse:16,endVerse:17,editionId:'yor'};
const date=new Date('2026-11-04T20:00:00.000Z');
const draft={observation:'The passage says this.',context:'Read the surrounding paragraph.',alternatives:'Consider another plausible reading.',uncertainty:'The intended audience is not yet clear.',sources:'John 3:15\nA reviewed study note'};

test('guided interpretation challenge saves the exact passage, user reasoning and sources without scoring',()=>{
 const entry=createInterpretationChallenge(passage,draft,date);
 assert.equal(entry.kind,'interpretation');
 assert.equal(entry.state,'unresolved');
 assert.deepEqual(entry.refs,[passage]);
 assert.match(entry.title,/JHN 3:16–17/);
 assert.match(entry.text,/Observation/);
 assert.match(entry.text,/Context/);
 assert.match(entry.text,/Alternative readings/);
 assert.equal(entry.reason,draft.uncertainty);
 assert.deepEqual(entry.sources,['John 3:15','A reviewed study note']);
 assert.deepEqual(entry.history,[]);
 assert.equal('score' in entry,false);
 assert.equal('correctAnswer' in entry,false);
});

test('challenge creation requires an observation and rejects oversized or malformed source notes',()=>{
 assert.throws(()=>createInterpretationChallenge(passage,{...draft,observation:'   '}),/observation/);
 assert.throws(()=>createInterpretationChallenge(passage,{...draft,context:'x'.repeat(4001)}),/context/);
 assert.throws(()=>createInterpretationChallenge(passage,{...draft,sources:Array(21).fill('Source').join('\n')}),/20 sources/);
 assert.throws(()=>createInterpretationChallenge(passage,{...draft,sources:'x'.repeat(5001)}),/sources/);
});

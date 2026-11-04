import test from 'node:test';
import assert from 'node:assert/strict';
import { createDecisionSimulationReflection, decisionSimulation, decisionSimulationReferences } from '../src/workspace/decision-simulation.ts';

test('decision simulation provides a clearly fictional situation, meaningful choices and competing considerations',()=>{
 assert.match(decisionSimulation.label,/Fictional/);
 assert.ok(decisionSimulation.choices.length>=3);
 assert.ok(decisionSimulation.considerations.length>=3);
 assert.ok(decisionSimulation.choices.every(choice=>choice.consequence.length>30));
 assert.match(decisionSimulation.reflectionPrompt,/Who could be affected/);
 assert.ok(decisionSimulation.followUps.length>=2);
 assert.equal('correctAnswer' in decisionSimulation,false);
 assert.equal('score' in decisionSimulation,false);
});

test('passage references retain the selected edition and save as a private reflection',()=>{
 const refs=decisionSimulationReferences('eng-web');
 assert.deepEqual(refs.map(ref=>ref.editionId),['eng-web','eng-web','eng-web']);
 const entry=createDecisionSimulationReflection('private-correction','I would verify the record and speak respectfully.','eng-web',new Date('2026-11-04T20:00:00.000Z'));
 assert.equal(entry.kind,'application');
 assert.equal(entry.state,'unresolved');
 assert.equal(entry.refs.length,3);
 assert.match(entry.text,/Fictional learning exercise — not Scripture/);
 assert.match(entry.text,/My chosen response/);
 assert.match(entry.text,/A plausible consequence/);
 assert.match(entry.text,/My reflection/);
 assert.equal('score' in entry,false);
});

test('saving requires a valid choice, private reflection and source edition',()=>{
 assert.throws(()=>createDecisionSimulationReflection('unknown','Reflection','eng-web'),/Choose one/);
 assert.throws(()=>createDecisionSimulationReflection('pause-and-verify','   ','eng-web'),/Write a reflection/);
 assert.throws(()=>createDecisionSimulationReflection('pause-and-verify','x'.repeat(5001),'eng-web'),/5,000/);
 assert.throws(()=>decisionSimulationReferences(''),/valid source edition/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createDecisionSimulationReflection, decisionSimulation, decisionSimulations, decisionSimulationReferences } from '../src/workspace/decision-simulation.ts';

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


test('second scenario keeps privacy and consent central without a scored correct answer',()=>{
 const scenario=decisionSimulations.find(item=>item.id==='private-support');
 assert.ok(scenario);
 assert.match(scenario.label,/Fictional/);
 assert.match(scenario.situation,/asks you to keep it private/);
 assert.match(scenario.situation,/no immediate safety emergency/);
 assert.match(scenario.considerations.join(' '),/immediate danger or abuse/);
 assert.equal(scenario.choices.length,3);
 assert.equal('correctAnswer' in scenario,false);
 assert.equal('score' in scenario,false);
 const refs=decisionSimulationReferences('yor','private-support');
 assert.deepEqual(refs.map(ref=>ref.bookId),['PRO','MAT','GAL']);
 assert.ok(refs.every(ref=>ref.editionId==='yor'));
 const entry=createDecisionSimulationReflection('offer-general-help','I would offer general support without identifying my friend.','yor',new Date('2026-11-04T20:30:00.000Z'),'private-support');
 assert.equal(entry.title,'Decision simulation · A request for private details');
 assert.deepEqual(entry.refs.map(ref=>ref.editionId),['yor','yor','yor']);
 assert.match(entry.text,/personal difficulty/);
 assert.match(entry.text,/offer general support/);
 assert.match(entry.sources[0],/private-support/);
});

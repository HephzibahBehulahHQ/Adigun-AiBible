import test from 'node:test';
import assert from 'node:assert/strict';
import { createRetellingPracticeReflection } from '../src/workspace/retelling-practice.ts';

const ref={bookId:'JHN',chapter:3,verse:16,endVerse:17,editionId:'yor'};
const checks={people:true,events:true,sequence:false,mainPoint:true};

test('retelling practice preserves the exact selected edition and records a self-check without grading',()=>{
 const entry=createRetellingPracticeReflection(ref,'In my own words, this passage describes love and trust.',checks,new Date('2026-11-04T21:00:00.000Z'));
 assert.equal(entry.kind,'application');
 assert.equal(entry.state,'unresolved');
 assert.deepEqual(entry.refs,[ref]);
 assert.match(entry.title,/JHN 3:16–17 · yor/);
 assert.match(entry.text,/Self-guided retelling practice/);
 assert.match(entry.text,/My retelling in my own words/);
 assert.match(entry.text,/Reviewed: Key people or participants/);
 assert.match(entry.text,/Not yet reviewed: Order or sequence/);
 assert.match(entry.text,/not a score/);
 assert.equal('score' in entry,false);
});

test('retelling requires user-authored text and a complete boolean self-check contract',()=>{
 assert.throws(()=>createRetellingPracticeReflection(ref,'   ',checks),/Write a retelling/);
 assert.throws(()=>createRetellingPracticeReflection(ref,'x'.repeat(10001),checks),/10,000/);
 assert.throws(()=>createRetellingPracticeReflection(ref,'A retelling',{...checks,events:'yes'}),/self-check/);
});

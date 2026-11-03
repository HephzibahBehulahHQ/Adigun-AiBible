import test from 'node:test';
import assert from 'node:assert/strict';
import { hashSourceText } from '../src/editorial.ts';
import { paraphraseEvidenceMatches } from '../src/publication.ts';

test('paraphrase source evidence rejects changed wording, source swaps and other editions',async()=>{
  const ref={bookId:'GEN',chapter:1,verse:1,endVerse:2,editionId:'eng-web'};
  const verses=[{number:1,text:'First source fixture.'},{number:2,text:'Second source fixture.'}];
  const ids=['eng-web:GEN:1:1','eng-web:GEN:1:2'];
  const entry={kind:'paraphrase',basePassageIds:ids,reviewedSourceHashes:Object.fromEntries(await Promise.all(verses.map(async(v,i)=>[ids[i],await hashSourceText(v.text)])))};
  assert.equal(await paraphraseEvidenceMatches(ref,verses,entry),true);
  assert.equal(await paraphraseEvidenceMatches(ref,[{...verses[0],text:'Changed.'},verses[1]],entry),false);
  assert.equal(await paraphraseEvidenceMatches(ref,[{...verses[0],text:verses[1].text},{...verses[1],text:verses[0].text}],entry),false);
  assert.equal(await paraphraseEvidenceMatches({...ref,editionId:'yor'},verses,entry),false);
  assert.equal(await paraphraseEvidenceMatches(ref,[verses[0]],entry),false);
  assert.equal(await paraphraseEvidenceMatches(ref,[verses[0],verses[0]],entry),false);
});

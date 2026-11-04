import test from 'node:test';
import assert from 'node:assert/strict';
import { searchRows, defaultSearchOptions } from '../src/search-query.ts';
const rows=[{bookId:'GEN',chapter:1,verse:1,text:'Ìfẹ́ brings hope and peace.'},{bookId:'MAT',chapter:1,verse:1,text:'Hope is not hopeless. Love brings peace.'},{bookId:'JHN',chapter:1,verse:1,text:'Love and hope.'}];
const search=(query,options={})=>searchRows(rows,query,{...defaultSearchOptions,...options},['GEN','MAT','JHN']);
test('search preserves source diacritics and scopes whole words and exclusions',()=>{assert.equal(search('ife')[0].text,rows[0].text);assert.equal(search('hope peace',{mode:'all'}).length,2);assert.equal(search('hope',{mode:'all',exclude:'love'}).length,1);assert.equal(search('hope',{mode:'all',testament:'old'}).length,1);assert.equal(search('love',{mode:'all',bookId:'JHN'}).length,1);assert.equal(search('hopeless',{mode:'all'}).length,1);assert.equal(search('hop',{mode:'all'}).length,0);});
test('Boolean precedence, grouped phrases and NOT are deterministic',()=>{assert.equal(search('hope AND NOT love',{mode:'boolean'}).length,1);assert.equal(search('(hope AND peace) OR "Love and hope"',{mode:'boolean'}).length,3);assert.equal(search('"Love and hope" AND NOT peace',{mode:'boolean'}).length,1);});
test('malformed Boolean queries fail recoverably instead of expanding scope',()=>{for(const query of ['hope OR','(hope AND peace','"unclosed','hope love','NOT'])assert.throws(()=>search(query,{mode:'boolean'}));assert.throws(()=>search('hope',{bookId:'ZZZ'}));assert.throws(()=>search('x'.repeat(501)));});

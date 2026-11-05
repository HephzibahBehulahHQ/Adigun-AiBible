import test from 'node:test';
import assert from 'node:assert/strict';
import {clampGeometry,restoreGeometry,botDestinations} from '../src/copilot/model.ts';

test('corrupt, nonfinite and oversized assistant geometry remains inside the viewport',()=>{
  for(const raw of [null,'broken','[]','{"width":1e99,"height":-100,"right":99999,"bottom":99999}','{"right":"bad"}']) {
    for(const viewport of [{width:1440,height:900},{width:320,height:568}]) {
      const g=restoreGeometry(raw,viewport);
      assert.ok(Object.values(g).every(Number.isFinite));
      assert.ok(g.right>=12 && g.bottom>=80);
      assert.ok(g.right+g.width<=viewport.width-12);
      assert.ok(g.bottom+g.height<=viewport.height-12);
    }
  }
});

test('resize clamps old desktop geometry when the viewport shrinks',()=>{
  const g=clampGeometry({width:1200,height:800,right:300,bottom:400},{width:800,height:600});
  assert.deepEqual(g,{width:776,height:496,right:12,bottom:92});
});

test('capability registry exposes only implemented local destinations with unique identities',()=>{
  assert.equal(new Set(botDestinations.map(x=>x.id)).size,botDestinations.length);
  assert.ok(botDestinations.every(x=>x.description && x.view && !/send|publish|generate/i.test(x.label)));
});

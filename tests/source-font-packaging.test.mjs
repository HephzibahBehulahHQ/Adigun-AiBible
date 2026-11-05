import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { finalizeBuild } from '../scripts/finalize-build.mjs';

test('font notices share the verified offline shell and missing licenses block packaging', async () => {
  const root=await mkdtemp(join(tmpdir(),'adigun-font-shell-'));
  try {
    for(const dir of ['assets','data','fonts'])await mkdir(join(root,'dist',dir),{recursive:true});
    const files={'assets/NotoSansMyanmar-fixture.ttf':'test-only font bytes','data/manifest.json':'{}','index.html':'<main>Test fixture</main>','manifest.webmanifest':'{}','fonts/NotoNaskhArabic-OFL.txt':'test-only Arabic notice','fonts/NotoSansMyanmar-OFL.txt':'test-only Myanmar notice','fonts/sources.json':'{"fixture":true}'};
    for(const [path,value] of Object.entries(files))await writeFile(join(root,'dist',path),value);
    const first=await finalizeBuild({root,sourceCommit:'test-only'}),sw=await readFile(join(root,'dist/sw.js'),'utf8');
    const config=JSON.parse(sw.slice(sw.lastIndexOf(')(')+2,-3));
    for(const path of Object.keys(files).filter(path=>path.startsWith('fonts/'))){
      assert.equal(config.shellFiles[path].bytes,Buffer.byteLength(files[path]));
      assert.equal(config.shellFiles[path].sha256,createHash('sha256').update(files[path]).digest('hex'));
    }
    await writeFile(join(root,'dist/fonts/NotoNaskhArabic-OFL.txt'),'changed test-only notice');
    const changed=await finalizeBuild({root,sourceCommit:'test-only'});assert.notEqual(changed.manifest.buildVersion,first.manifest.buildVersion);
    await rm(join(root,'dist/fonts/NotoSansMyanmar-OFL.txt'));
    await assert.rejects(finalizeBuild({root,sourceCommit:'test-only'}),/complete offline notice/);
  } finally { await rm(root,{recursive:true,force:true}); }
});

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const root=resolve(import.meta.dirname,'..'), dist=resolve(root,'dist'), base='/Adigun-AiBible/';
let commit='working-tree';
if(process.env.GITHUB_SHA)commit=process.env.GITHUB_SHA;
else{try{if(!execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim())commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();}catch{/* A local preview may have no Git metadata. */}}
const files=await readdir(resolve(dist,'assets'));
const version=createHash('sha256').update(await readFile(resolve(dist,'index.html'))).digest('hex').slice(0,12);
const precache=[base,`${base}index.html`,`${base}manifest.webmanifest`,`${base}data/manifest.json`,...files.filter(f=>/\.(js|css|svg|png|jpg|woff2)$/.test(f)).map(f=>`${base}assets/${f}`)];
const sw=`const VERSION=${JSON.stringify(version)},SHELL='adigun-bible-shell-'+VERSION,CONTENT='adigun-bible-content-v1',BASE=${JSON.stringify(base)},PRECACHE=${JSON.stringify(precache)};
self.addEventListener('install',event=>{event.waitUntil(caches.open(SHELL).then(cache=>cache.addAll(PRECACHE)));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('adigun-bible-shell-')&&k!==SHELL).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('message',event=>{if(event.data?.type==='ACTIVATE_UPDATE')self.skipWaiting();});
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith(BASE))return;
if(url.pathname.startsWith(BASE+'data/')){event.respondWith(caches.open(CONTENT).then(async cache=>{const stored=await cache.match(event.request);if(stored)return stored;try{const response=await fetch(event.request);if(response.ok)await cache.put(event.request,response.clone());return response;}catch{return new Response('This content is not downloaded.',{status:503,headers:{'Content-Type':'text/plain'}});}}));return;}
if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(()=>caches.open(SHELL).then(cache=>cache.match(BASE+'index.html')).then(r=>r||new Response('Reconnect once to install the application.',{status:503}))));return;}
event.respondWith(caches.open(SHELL).then(async cache=>(await cache.match(event.request))||fetch(event.request)));});`;
await writeFile(resolve(dist,'sw.js'),sw);
await writeFile(resolve(dist,'build-info.json'),JSON.stringify({sourceCommit:commit,buildVersion:version,builtAt:new Date().toISOString(),stage:'core-development',policyVersion:'2.0'},null,2));
await writeFile(resolve(dist,'.nojekyll'),'');
console.log(`Release metadata and scoped service worker generated (${version}).`);

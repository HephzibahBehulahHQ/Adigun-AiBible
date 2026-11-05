import type { Reference } from '../types';

export type Role = 'host' | 'guest';
export interface Signal { kind: 'adigun-nearby-signal'; version: 1; roomId: string; linkId: string; role: Role; name: string; expiresAt: number; description: { type: 'offer' | 'answer'; sdp: string } }
export type RoomPayload =
  | { type: 'ready' }
  | { type: 'chat'; text: string }
  | { type: 'annotation'; text: string; reference: Reference }
  | { type: 'reference'; reference: Reference }
  | { type: 'pack-offer'; transferId: string; title: string; bytes: number; sha256: string; chunks: number }
  | { type: 'pack-accept'; transferId: string }
  | { type: 'pack-chunk'; transferId: string; index: number; data: string }
  | { type: 'pack-cancel'; transferId: string }
  | { type: 'leave' };
export interface RoomMessage { version: 1; roomId: string; sequence: number; payload: RoomPayload }
export const MAX_PACK_BYTES = 250_000, CHUNK_BYTES = 6000, MAX_WIRE_BYTES = 14_000;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function fail(message = 'The nearby-room message is invalid.'): never { throw new Error(message); }
function exact(v: unknown, keys: string[]): Record<string, unknown> { if (!object(v) || Object.keys(v).length !== keys.length || keys.some(k => !(k in v))) fail(); return v; }
const validId = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9-]{36}$/.test(v);
const sha = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const integer = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;
export function participantName(v: unknown): string { if (typeof v !== 'string' || !v.trim() || v.length > 60 || /[\u0000-\u001f\u007f]/.test(v)) fail('Enter a display name of 1–60 characters.'); return v.trim(); }
export function roomReference(v: unknown): Reference {
  if (!object(v) || Object.keys(v).some(k => !['bookId','chapter','verse','endVerse'].includes(k)) || typeof v.bookId !== 'string' || !/^[1-3]?[A-Z]{2,3}$/.test(v.bookId) || !integer(v.chapter,1,150) || !integer(v.verse,1,176) || (v.endVerse !== undefined && (!integer(v.endVerse,v.verse,176) || v.endVerse - v.verse >= 40))) fail('The shared reference is invalid.');
  return { bookId:v.bookId, chapter:v.chapter, verse:v.verse, ...(v.endVerse === undefined ? {} : { endVerse:v.endVerse as number }) };
}
export function shareReference(reference: Reference): Reference { return roomReference({bookId:reference.bookId,chapter:reference.chapter,verse:reference.verse,...(reference.endVerse === undefined ? {} : {endVerse:reference.endVerse})}); }
function sdpDescription(v: unknown, role: Role): Signal['description'] {
  const row=exact(v,['type','sdp']);
  if (row.type !== (role==='host'?'offer':'answer') || typeof row.sdp!=='string' || row.sdp.length > 60_000 || !row.sdp.startsWith('v=0') || /\nm=(?:audio|video)\b/.test(row.sdp) || !/\nm=application\b/.test(row.sdp) || !/a=fingerprint:sha-256 [A-Fa-f0-9:]+/.test(row.sdp)) fail('Only this app’s data-only pairing offers are supported.');
  if (row.sdp.split(/\r?\n/).some(line=>line.startsWith('a=candidate:')&&!/\styp host(?:\s|$)/.test(line))) fail('This local transport accepts host-network candidates only.');
  return {type:row.type as 'offer'|'answer',sdp:row.sdp};
}
export function parseSignal(raw: string, now = Date.now()): Signal {
  if (new TextEncoder().encode(raw).byteLength > 80_000) fail('The pairing code is too large.');
  let value: unknown;try {value=JSON.parse(raw);}catch{fail('Paste the complete pairing code.');}
  const row=exact(value,['kind','version','roomId','linkId','role','name','expiresAt','description']);
  if(row.kind!=='adigun-nearby-signal'||row.version!==1||!validId(row.roomId)||!validId(row.linkId)||(row.role!=='host'&&row.role!=='guest')||!integer(row.expiresAt,now+1,now+15*60_000))fail('This pairing code has expired or belongs to an unsupported room. Create a fresh offer.');
  return {kind:row.kind,version:1,roomId:row.roomId,linkId:row.linkId,role:row.role,name:participantName(row.name),expiresAt:row.expiresAt,description:sdpDescription(row.description,row.role)};
}
export async function verificationCode(offer: Signal,answer: Signal):Promise<string>{
  if(offer.role!=='host'||answer.role!=='guest'||offer.roomId!==answer.roomId||offer.linkId!==answer.linkId)fail('These pairing codes do not belong together.');
  const fingerprint=(s:Signal)=>s.description.sdp.match(/a=fingerprint:sha-256 ([A-Fa-f0-9:]+)/)![1].toUpperCase();
  const hash=await digest(new TextEncoder().encode([offer.roomId,offer.linkId,fingerprint(offer),fingerprint(answer)].join('|')));
  return hash.slice(0,16).toUpperCase().match(/.{4}/g)!.join(' ');
}
export function validatePayload(v:unknown):RoomPayload{
  if(!object(v)||typeof v.type!=='string')fail();
  const t=v.type;
  if(t==='ready'||t==='leave'){exact(v,['type']);return {type:t};}
  if(t==='chat'||t==='annotation'){
    exact(v,t==='chat'?['type','text']:['type','text','reference']);
    if(typeof v.text!=='string'||!v.text.trim()||v.text.length>2000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v.text))fail('Shared writing must contain 1–2,000 plain-text characters.');
    return t==='chat'?{type:t,text:v.text}:{type:t,text:v.text,reference:roomReference(v.reference)};
  }
  if(t==='reference'){exact(v,['type','reference']);return {type:t,reference:roomReference(v.reference)};}
  if(t==='pack-offer'){
    exact(v,['type','transferId','title','bytes','sha256','chunks']);
    if(!validId(v.transferId)||typeof v.title!=='string'||!v.title.trim()||v.title.length>250||!integer(v.bytes,1,MAX_PACK_BYTES)||!sha(v.sha256)||!integer(v.chunks,1,Math.ceil(MAX_PACK_BYTES/CHUNK_BYTES))||v.chunks!==Math.ceil(v.bytes/CHUNK_BYTES))fail('The offered passage package exceeds the supported limits.');
    return {type:t,transferId:v.transferId,title:v.title,bytes:v.bytes,sha256:v.sha256,chunks:v.chunks};
  }
  if(t==='pack-accept'||t==='pack-cancel'){exact(v,['type','transferId']);if(!validId(v.transferId))fail();return {type:t,transferId:v.transferId};}
  if(t==='pack-chunk'){
    exact(v,['type','transferId','index','data']);
    if(!validId(v.transferId)||!integer(v.index,0,Math.ceil(MAX_PACK_BYTES/CHUNK_BYTES)-1)||typeof v.data!=='string'||v.data.length>8000||v.data.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(v.data))fail();
    return {type:t,transferId:v.transferId,index:v.index,data:v.data};
  }
  return fail('Unknown nearby-room operation.');
}
export function parseMessage(raw:unknown,roomId:string,lastSequence:number):RoomMessage{
  if(typeof raw!=='string'||new TextEncoder().encode(raw).byteLength>MAX_WIRE_BYTES)fail('The room message exceeds the supported limit.');
  let parsed:unknown;try{parsed=JSON.parse(raw);}catch{fail();}
  const row=exact(parsed,['version','roomId','sequence','payload']);
  if(row.version!==1||row.roomId!==roomId||!integer(row.sequence,lastSequence+1,Number.MAX_SAFE_INTEGER-1))fail('A duplicate or out-of-order room message was rejected.');
  return {version:1,roomId,sequence:row.sequence,payload:validatePayload(row.payload)};
}
export async function digest(bytes:Uint8Array):Promise<string>{return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes).buffer))].map(v=>v.toString(16).padStart(2,'0')).join('');}
export function encodeChunks(bytes:Uint8Array):string[]{if(bytes.byteLength<1||bytes.byteLength>MAX_PACK_BYTES)fail('Passage package exceeds 250 KB.');const chunks:string[]=[];for(let i=0;i<bytes.length;i+=CHUNK_BYTES)chunks.push(btoa(String.fromCharCode(...bytes.slice(i,i+CHUNK_BYTES))));return chunks;}
export class IncomingTransfer{
  readonly offer:Extract<RoomPayload,{type:'pack-offer'}>;private parts:Uint8Array[]=[];private length=0;
  constructor(offer:Extract<RoomPayload,{type:'pack-offer'}>){this.offer=validatePayload(offer) as typeof offer;}
  get received(){return this.length;}
  async add(chunk:Extract<RoomPayload,{type:'pack-chunk'}>):Promise<Uint8Array|null>{
    validatePayload(chunk);
    if(chunk.transferId!==this.offer.transferId||chunk.index!==this.parts.length)fail('Passage transfer order is invalid.');
    const bytes=Uint8Array.from(atob(chunk.data),c=>c.charCodeAt(0)),expected=Math.min(CHUNK_BYTES,this.offer.bytes-this.length);
    if(bytes.length!==expected||!expected)fail('Passage transfer size differs from its offer.');
    this.parts.push(bytes);this.length+=bytes.length;
    if(this.parts.length!==this.offer.chunks)return null;
    const full=new Uint8Array(this.length);let at=0;for(const part of this.parts){full.set(part,at);at+=part.length;}
    if(await digest(full)!==this.offer.sha256)fail('The transferred package checksum failed. Nothing was imported.');return full;
  }
}

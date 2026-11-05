import { parseMessage, parseSignal, participantName, verificationCode, validatePayload, MAX_WIRE_BYTES } from './protocol.ts';
import type { Role, RoomPayload, Signal } from './protocol.ts';
export interface LinkEvents { status:(status:string)=>void; code:(code:string)=>void; message:(payload:RoomPayload)=>void|Promise<void>; error:(message:string)=>void; closed:()=>void }
/** No signaling service, STUN, TURN, media capture, telemetry or background reconnect. */
export class NearbyLink{
  private pc:RTCPeerConnection;private channel?:RTCDataChannel;private offer?:Signal;private answer?:Signal;private sequence=0;private lastSequence=0;private rateStart=0;private rateCount=0;private stopped=false;private receiving:Promise<void>=Promise.resolve();
  readonly role:Role;readonly name:string;roomId='';linkId='';remoteName='';localApproved=false;remoteApproved=false;
  constructor(role:Role,name:string,private events:LinkEvents){
    if(typeof RTCPeerConnection==='undefined'||!globalThis.isSecureContext)throw new Error('This browser needs a secure page with WebRTC data-channel support. Standalone downloaded reading remains available.');
    this.role=role;this.name=participantName(name);this.pc=new RTCPeerConnection({iceServers:[],iceTransportPolicy:'all',bundlePolicy:'max-bundle'});
    this.pc.onconnectionstatechange=()=>{const state=this.pc.connectionState;events.status(state);if(state==='failed')events.error('The local connection failed. Check that both devices share a LAN without client isolation, then create a fresh pairing offer.');if(state==='closed')events.closed();};
    this.pc.ondatachannel=event=>{if(this.role!=='guest'||this.channel||event.channel.label!=='adigun-study-v1'){event.channel.close();return;}this.attach(event.channel);};
  }
  get approved(){return this.localApproved&&this.remoteApproved&&this.channel?.readyState==='open';}
  get connected(){return this.channel?.readyState==='open';}
  private attach(channel:RTCDataChannel){
    this.channel=channel;channel.bufferedAmountLowThreshold=32_000;
    channel.onopen=()=>this.events.status('connected · approval required');
    channel.onclose=()=>{this.events.status('disconnected');this.events.closed();};
    channel.onerror=()=>this.events.error('The data channel reported an error. No private workspace was sent.');
    channel.onmessage=event=>{this.receiving=this.receiving.then(async()=>{
      if(this.stopped)return;
      if(Date.now()-this.rateStart>1000){this.rateStart=Date.now();this.rateCount=0;}if(++this.rateCount>80)throw new Error('This peer sent too many messages.');
      const m=parseMessage(event.data,this.roomId,this.lastSequence);this.lastSequence=m.sequence;
      if(m.payload.type==='leave'){this.close();return;}
      if(m.payload.type==='ready'){this.remoteApproved=true;await this.events.message(m.payload);return;}
      if(!this.approved)throw new Error('Shared content arrived before both participants approved this connection.');
      if(m.payload.type==='reference'&&this.role==='host')throw new Error('Only the host can coordinate passage navigation.');
      await this.events.message(m.payload);
    }).catch(error=>{this.events.error(error instanceof Error?error.message:'The peer sent invalid data.');this.close();});};
  }
  private async gathered():Promise<void>{
    if(this.pc.iceGatheringState==='complete')return;
    await new Promise<void>((resolve,reject)=>{const timer=window.setTimeout(()=>finish(new Error('Local address discovery timed out. Try a fresh offer on a supported shared network.')),12_000);const changed=()=>{if(this.pc.iceGatheringState==='complete')finish();};const finish=(error?:Error)=>{clearTimeout(timer);this.pc.removeEventListener('icegatheringstatechange',changed);if(error)reject(error);else resolve();};this.pc.addEventListener('icegatheringstatechange',changed);changed();});
  }
  private signal(role:Role,expiresAt:number):Signal{
    const description=this.pc.localDescription;if(!description?.sdp)throw new Error('No local pairing description is available.');
    return parseSignal(JSON.stringify({kind:'adigun-nearby-signal',version:1,roomId:this.roomId,linkId:this.linkId,role,name:this.name,expiresAt,description:{type:description.type,sdp:description.sdp}}));
  }
  async createOffer():Promise<string>{
    if(this.role!=='host'||this.offer)throw new Error('Create a new room before making another offer.');
    this.roomId=crypto.randomUUID();this.linkId=crypto.randomUUID();this.attach(this.pc.createDataChannel('adigun-study-v1',{ordered:true}));
    await this.pc.setLocalDescription(await this.pc.createOffer());await this.gathered();this.offer=this.signal('host',Date.now()+10*60_000);return JSON.stringify(this.offer);
  }
  async answerOffer(raw:string):Promise<string>{
    if(this.role!=='guest'||this.offer)throw new Error('Create a new room before accepting another offer.');
    const offer=parseSignal(raw);if(offer.role!=='host')throw new Error('A guest must receive the host’s offer.');
    this.offer=offer;this.roomId=offer.roomId;this.linkId=offer.linkId;this.remoteName=offer.name;
    await this.pc.setRemoteDescription(offer.description);await this.pc.setLocalDescription(await this.pc.createAnswer());await this.gathered();this.answer=this.signal('guest',offer.expiresAt);this.events.code(await verificationCode(offer,this.answer));return JSON.stringify(this.answer);
  }
  async acceptAnswer(raw:string):Promise<void>{
    if(this.role!=='host'||!this.offer||this.answer)throw new Error('Generate a host offer first.');const answer=parseSignal(raw);
    if(answer.role!=='guest'||answer.roomId!==this.roomId||answer.linkId!==this.linkId||answer.expiresAt!==this.offer.expiresAt)throw new Error('That answer does not match this room offer.');
    await this.pc.setRemoteDescription(answer.description);this.answer=answer;this.remoteName=answer.name;this.events.code(await verificationCode(this.offer,answer));
  }
  approve(){if(!this.connected||!this.offer||!this.answer)throw new Error('Finish pairing before approval.');this.localApproved=true;this.send({type:'ready'});}
  send(payload:RoomPayload){
    validatePayload(payload);if(!this.channel||this.channel.readyState!=='open')throw new Error('The peer is disconnected. Create a fresh pairing offer to reconnect.');
    if(payload.type!=='ready'&&payload.type!=='leave'&&!this.approved)throw new Error('Both participants must approve the matching verification code.');
    if(payload.type==='reference'&&this.role!=='host')throw new Error('Only the host can coordinate passages.');
    const raw=JSON.stringify({version:1,roomId:this.roomId,sequence:++this.sequence,payload});if(new TextEncoder().encode(raw).byteLength>MAX_WIRE_BYTES)throw new Error('The message exceeds the supported limit.');
    if(this.channel.bufferedAmount>200_000)throw new Error('The local connection is busy. Wait for the current transfer before sending more.');this.channel.send(raw);
  }
  async sendChunks(transferId:string,chunks:string[],signal:AbortSignal,onProgress:(sent:number,total:number)=>void){
    for(let index=0;index<chunks.length;index++){
      if(signal.aborted||this.stopped)throw new Error('Passage transfer cancelled.');
      if(!this.channel||this.channel.readyState!=='open')throw new Error('The transfer peer disconnected.');
      if(this.channel.bufferedAmount>64_000)await new Promise<void>((resolve,reject)=>{const c=this.channel!,timer=window.setTimeout(()=>finish(new Error('Passage transfer timed out.')),10_000);const low=()=>finish(),abort=()=>finish(new Error('Passage transfer cancelled.'));const finish=(e?:Error)=>{clearTimeout(timer);c.removeEventListener('bufferedamountlow',low);signal.removeEventListener('abort',abort);if(e)reject(e);else resolve();};c.addEventListener('bufferedamountlow',low,{once:true});signal.addEventListener('abort',abort,{once:true});});
      this.send({type:'pack-chunk',transferId,index,data:chunks[index]});onProgress(index+1,chunks.length);
    }
  }
  close(){if(this.stopped)return;try{if(this.connected)this.send({type:'leave'});}catch{/*Closing is always possible.*/}this.stopped=true;this.channel?.close();this.pc.close();this.localApproved=false;this.remoteApproved=false;this.events.closed();}
}

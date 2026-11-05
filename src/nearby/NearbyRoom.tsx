import { useEffect, useRef, useState } from 'react';
import type { Locale, Reference } from '../types';
import type { SourceSnapshot } from '../editorial-workbench/model';
import { sourceLabel } from '../editorial-workbench/source-core';
import { bibleEditionIds } from '../data';
import { downloadPrivateFile } from '../workspace/shared';
import { IncomingTransfer, digest, encodeChunks, shareReference } from './protocol';
import type { Role, RoomPayload } from './protocol';
import { NearbyLink } from './transport';
import { createPassagePackage, passagePackageText, resolveRoomPassage, verifyPassagePackage } from './source';
import './nearby.css';
type LogEntry={name:string;text:string;at:string;reference?:Reference};
type PackOffer=Extract<RoomPayload,{type:'pack-offer'}>;
const label=(ref:Reference)=>`${ref.bookId} ${ref.chapter}:${ref.verse}${ref.endVerse&&ref.endVerse!==ref.verse?`–${ref.endVerse}`:''}`;
export default function NearbyRoom({reference,locale,onOpenReference}:{reference:Reference;locale:Locale;onOpenReference:(ref:Reference)=>void}){
  const [name,setName]=useState(''),[role,setRole]=useState<Role>('host'),[input,setInput]=useState(''),[output,setOutput]=useState(''),[code,setCode]=useState(''),[status,setStatus]=useState('Not connected'),[remoteName,setRemoteName]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[connected,setConnected]=useState(false),[localApproved,setLocalApproved]=useState(false),[remoteApproved,setRemoteApproved]=useState(false);
  const [reading,setReading]=useState<Reference>(reference),[edition,setEdition]=useState(reference.editionId||'eng-web'),[passage,setPassage]=useState<SourceSnapshot|null>(null),[sourceError,setSourceError]=useState('');
  const [book,setBook]=useState(reference.bookId),[chapter,setChapter]=useState(String(reference.chapter)),[first,setFirst]=useState(String(reference.verse)),[last,setLast]=useState(String(reference.endVerse||reference.verse)),[follow,setFollow]=useState(false),[proposed,setProposed]=useState<Reference|null>(null);
  const [writing,setWriting]=useState(''),[annotation,setAnnotation]=useState(false),[log,setLog]=useState<LogEntry[]>([]),[offer,setOffer]=useState<PackOffer|null>(null),[progress,setProgress]=useState(''),[received,setReceived]=useState<SourceSnapshot|null>(null);
  const link = useRef<NearbyLink|null>(null), incoming = useRef<IncomingTransfer|null>(null), outgoing = useRef<{id:string;chunks:string[]}|null>(null);
  const offered = useRef<PackOffer|null>(null), cancelled = useRef(new Set<string>()), transferAbort = useRef<AbortController|null>(null);
  const messageHandler = useRef<(payload:RoomPayload, owner:NearbyLink)=>Promise<void>>(async()=>{});
  const locked = useRef(false), alive = useRef(true), actionRun = useRef(0), guard = useRef({connected,dirty:!!writing,busy});
  guard.current={connected,dirty:!!writing,busy};
  const approved=connected&&localApproved&&remoteApproved,supported=typeof RTCPeerConnection!=='undefined'&&globalThis.isSecureContext;
  const currentLink = (owner:NearbyLink) => alive.current && link.current===owner;
  function forgetTransfer(id:string) { cancelled.current.add(id); if(cancelled.current.size>50)cancelled.current.delete(cancelled.current.values().next().value!); }
  function clearTransfers() { transferAbort.current?.abort(); transferAbort.current=null; incoming.current=null; outgoing.current=null; offered.current=null; }
  useEffect(()=>{
    alive.current=true;
    const navigate=(event:Event)=>{const state=guard.current;if((state.connected||state.dirty||state.busy)&&!window.confirm('Leave this nearby room? The connection and unsaved discussion will end. Download the discussion first if you need it.'))event.preventDefault();};
    const update=(event:Event)=>{const state=guard.current;if(state.connected||state.dirty||state.busy)event.preventDefault();};
    const unload=(event:BeforeUnloadEvent)=>{const state=guard.current;if(state.connected||state.dirty||state.busy){event.preventDefault();event.returnValue='';}};
    window.addEventListener('adigun:before-navigation',navigate);window.addEventListener('adigun:before-update',update);window.addEventListener('beforeunload',unload);
    return()=>{alive.current=false;actionRun.current++;const previous=link.current;link.current=null;clearTransfers();previous?.close();window.removeEventListener('adigun:before-navigation',navigate);window.removeEventListener('adigun:before-update',update);window.removeEventListener('beforeunload',unload);};
  },[]);
  useEffect(()=>{let active=true;setPassage(null);setSourceError('');void resolveRoomPassage({...reading,editionId:edition}).then(value=>{if(active)setPassage(value);}).catch(reason=>{if(active)setSourceError(reason instanceof Error?reason.message:'The selected source is unavailable.');});return()=>{active=false;};},[reading,edition]);
  function addLog(entry:LogEntry){setLog(rows=>[...rows.slice(-99),entry]);}
  function applyReference(ref:Reference){setReading(ref);setBook(ref.bookId);setChapter(String(ref.chapter));setFirst(String(ref.verse));setLast(String(ref.endVerse||ref.verse));setProposed(null);}
  async function run(action:()=>Promise<void>|void){
    if(locked.current)return;locked.current=true;const operation=++actionRun.current;setBusy(true);setError('');
    try{await action();}catch(reason){if(alive.current&&operation===actionRun.current)setError(reason instanceof Error?reason.message:'This room operation failed.');}
    finally{if(operation===actionRun.current){locked.current=false;if(alive.current)setBusy(false);}}
  }
  messageHandler.current=async(payload,owner)=>{
    if(!currentLink(owner))return;
    if(payload.type==='ready'){setRemoteApproved(true);return;}
    if(payload.type==='chat'||payload.type==='annotation'){addLog({name:owner.remoteName||'Peer',text:payload.text,at:new Date().toISOString(),...(payload.type==='annotation'?{reference:payload.reference}:{})});return;}
    if(payload.type==='reference'){if(follow)applyReference(payload.reference);else setProposed(payload.reference);return;}
    if('transferId' in payload&&cancelled.current.has(payload.transferId))return;
    if(payload.type==='pack-offer'){
      if(offered.current||incoming.current||outgoing.current){forgetTransfer(payload.transferId);owner.send({type:'pack-cancel',transferId:payload.transferId});return;}
      offered.current=payload;setOffer(payload);setReceived(null);setProgress('Passage offered; waiting for your choice.');return;
    }
    if(payload.type==='pack-cancel'){
      const matches=outgoing.current?.id===payload.transferId||incoming.current?.offer.transferId===payload.transferId||offered.current?.transferId===payload.transferId;
      forgetTransfer(payload.transferId);
      if(matches){clearTransfers();setOffer(null);setProgress('Passage transfer cancelled.');}return;
    }
    if(payload.type==='pack-accept'){
      const next=outgoing.current;if(!next||next.id!==payload.transferId)throw new Error('No matching outgoing passage offer exists.');
      if(transferAbort.current)return;
      const controller=new AbortController();transferAbort.current=controller;
      // Keep receiving chat, cancellation and leave while the sender waits for its buffer.
      void owner.sendChunks(next.id,next.chunks,controller.signal,(done,total)=>{if(currentLink(owner)&&outgoing.current===next&&!controller.signal.aborted)setProgress(`Sending passage: ${done} / ${total} chunks`);}).then(()=>{
        if(currentLink(owner)&&outgoing.current===next&&!controller.signal.aborted)setProgress('Passage sent. The recipient must verify it against the installed source.');
      }).catch(reason=>{
        if(currentLink(owner)&&outgoing.current===next&&!controller.signal.aborted){setProgress('Passage transfer failed. The room remains available.');setError(reason instanceof Error?reason.message:'Passage transfer failed.');try{owner.send({type:'pack-cancel',transferId:next.id});}catch{/* A disconnected peer cannot receive cancellation. */}}
      }).finally(()=>{
        if(currentLink(owner)&&outgoing.current===next){outgoing.current=null;forgetTransfer(next.id);}
        if(transferAbort.current===controller)transferAbort.current=null;
      });return;
    }
    if(payload.type==='pack-chunk'){
      const current=incoming.current;if(!current||current.offer.transferId!==payload.transferId)throw new Error('Unrequested passage data was rejected.');
      const full=await current.add(payload);
      if(!currentLink(owner)||incoming.current!==current||cancelled.current.has(payload.transferId))return;
      setProgress(`Receiving passage: ${current.received} / ${current.offer.bytes} bytes`);
      if(full){
        try{const source=await verifyPassagePackage(full);if(currentLink(owner)&&incoming.current===current){setReceived(source);setProgress('Passage received and verified against the installed source.');}}
        catch(reason){if(currentLink(owner)&&incoming.current===current){setProgress('Passage rejected; nothing was saved.');setError(reason instanceof Error?reason.message:'Source verification failed.');}}
        finally{if(currentLink(owner)&&incoming.current===current){incoming.current=null;offered.current=null;forgetTransfer(payload.transferId);setOffer(null);}}
      }return;
    }
  };
  function createLink(nextRole:Role){
    const previous=link.current;link.current=null;clearTransfers();previous?.close();cancelled.current.clear();
    setConnected(false);setLocalApproved(false);setRemoteApproved(false);setCode('');setRemoteName('');setOutput('');setOffer(null);setReceived(null);setProgress('');setStatus('Preparing local connection…');
    const created:NearbyLink=new NearbyLink(nextRole,name,{
      status:value=>{if(currentLink(created)){setStatus(value);setConnected(created.connected);}},
      code:value=>{if(currentLink(created)){setCode(value);setRemoteName(created.remoteName);}},
      message:payload=>currentLink(created)?messageHandler.current(payload,created):undefined,
      error:value=>{if(currentLink(created))setError(value);},
      closed:()=>{if(currentLink(created)){clearTransfers();setOffer(null);setConnected(false);setLocalApproved(false);setRemoteApproved(false);setStatus('Disconnected · create a fresh offer to reconnect');}}
    });link.current=created;return created;
  }
  function reset(){
    actionRun.current++;locked.current=false;const previous=link.current;link.current=null;clearTransfers();previous?.close();cancelled.current.clear();
    setBusy(false);setConnected(false);setLocalApproved(false);setRemoteApproved(false);setInput('');setOutput('');setCode('');setRemoteName('');setOffer(null);setReceived(null);setProgress('');setError('');setNotice('');setStatus('Not connected');
  }
  async function pairRoom(){
    if(role==='guest'){const owner=createLink('guest'),answer=await owner.answerOffer(input);if(currentLink(owner))setOutput(answer);}
    else{const owner=link.current;if(!owner)throw new Error('Create the host offer first.');await owner.acceptAnswer(input);}
  }
  async function choosePassage(){
    const operation=actionRun.current,owner=link.current,ref=shareReference({bookId:book.trim().toUpperCase(),chapter:Number(chapter),verse:Number(first),endVerse:Number(last)});
    await resolveRoomPassage({...ref,editionId:edition});if(!alive.current||operation!==actionRun.current)return;applyReference(ref);
    if(role==='host'&&owner&&currentLink(owner)&&owner.approved)owner.send({type:'reference',reference:ref});
  }
  async function sendWriting(){const text=writing.trim();link.current!.send(annotation?{type:'annotation',text,reference:shareReference(reading)}:{type:'chat',text});addLog({name:`${name} (you)`,text,at:new Date().toISOString(),...(annotation?{reference:shareReference(reading)}:{})});setWriting('');}
  async function offerPassage(){
    const owner=link.current;if(!owner?.approved)throw new Error('Approve the current connection before sharing a passage.');
    if(outgoing.current||incoming.current||offered.current)throw new Error('Finish or cancel the existing passage offer first.');
    const pack=await createPassagePackage({...reading,editionId:edition}),sha256=await digest(pack.bytes);
    if(!currentLink(owner)||!owner.approved)return;
    const id=crypto.randomUUID(),chunks=encodeChunks(pack.bytes),next={id,chunks};outgoing.current=next;
    try{owner.send({type:'pack-offer',transferId:id,title:pack.title,bytes:pack.bytes.length,sha256,chunks:chunks.length});setProgress('Passage offered; the other participant must accept.');}
    catch(error){if(outgoing.current===next)outgoing.current=null;throw error;}
  }
  function acceptPassage(){
    const next=offered.current,owner=link.current;if(!next||!owner?.approved)throw new Error('The offered passage is no longer available.');
    if(incoming.current)return;
    incoming.current=new IncomingTransfer(next);
    try{owner.send({type:'pack-accept',transferId:next.transferId});setProgress('Receiving the accepted passage…');}catch(error){incoming.current=null;throw error;}
  }
  function cancelTransfer(){
    const id=outgoing.current?.id||incoming.current?.offer.transferId||offered.current?.transferId;
    if(!id)return;forgetTransfer(id);clearTransfers();setOffer(null);setProgress('Passage transfer cancelled.');
    try{if(link.current?.approved)link.current.send({type:'pack-cancel',transferId:id});}catch(reason){setError(reason instanceof Error?reason.message:'The disconnected peer could not be notified.');}
  }
  return <div className="page nearby-room" lang="en"><div className="page-heading"><span className="eyebrow">LOCAL CONNECTION PILOT</span><h1>Nearby study room</h1><p>Pair a host and one guest on a shared local network. Both choose what to share.</p></div>
    {locale!=='en'&&<p className="availability-note">EN fallback · nearby-room controls have not received native-language review.</p>}
    <p className="availability-note">Two-person transport pilot. Real internet-disabled testing on two physical devices is still pending. Network isolation and browser policy may prevent pairing; standalone offline reading remains available.</p>
    <details className="panel"><summary>How local pairing works</summary><ol><li>Open this app on both devices first. Download the required Bible books before disconnecting the internet.</li><li>Keep both devices on the same Wi-Fi or local hotspot. This pilot uses no internet signaling, STUN or relay server.</li><li>The host creates an offer. Transfer its complete pairing text to the guest using a method you control; the app does not send it elsewhere.</li><li>The guest creates an answer and returns it to the host. Compare the displayed verification code in person and both approve the connection.</li></ol><p>Pairing codes contain temporary connection details. Share them only with the intended peer. A local display name does not verify someone’s identity. No microphone or camera is used.</p><p>After disconnection, create a fresh offer. This pilot has no background reconnection, group relay or remote audio control.</p></details>
    {error&&<p role="alert" className="availability-note">{error}</p>}{notice&&<p role="status">{notice}</p>}
    <section className="panel"><h2>Pair and approve</h2><p role="status">Connection: {status}</p>{!supported?<p>WebRTC data channels are unavailable in this browser or page context. Use the reader and downloaded study tools on this device.</p>:<>
      <div className="nearby-form"><label>Your display name<input aria-label="Your display name" value={name} maxLength={60} disabled={!!output||connected||busy} onChange={e=>setName(e.target.value)}/></label><label>Your role<select aria-label="Your role" value={role} disabled={!!output||connected||busy} onChange={e=>{setRole(e.target.value as Role);setInput('');}}><option value="host">Host</option><option value="guest">Guest</option></select></label></div>
      {!output&&role==='host'&&<button className="primary" disabled={busy||!name.trim()} onClick={()=>void run(async()=>{const owner=createLink('host'),offer=await owner.createOffer();if(currentLink(owner))setOutput(offer);})}>Create pairing offer</button>}
      <label>{role==='host'?'Paste guest answer':'Paste host offer'}<textarea aria-label={role==='host'?'Paste guest answer':'Paste host offer'} value={input} rows={3} maxLength={80000} onChange={e=>setInput(e.target.value)}/></label>
      <button className="secondary" disabled={busy||!input.trim()||!name.trim()||!!code} onClick={()=>void run(pairRoom)}>{role==='host'?'Accept guest answer':'Create pairing answer'}</button>
      {output&&<><label>Your pairing {role==='host'?'offer':'answer'}<textarea aria-label="Your pairing code" value={output} readOnly rows={3}/></label><div className="button-row"><button className="text-button" onClick={()=>void run(async()=>{if(!navigator.clipboard)throw new Error('Clipboard is unavailable. Select and copy the pairing text above.');await navigator.clipboard.writeText(output);setNotice('Pairing text copied.');})}>Copy pairing code</button><button className="text-button" onClick={()=>downloadPrivateFile(`adigun-nearby-${role}.txt`,output,'text/plain')}>Download pairing code</button></div></>}
      {code&&<div className="nearby-verification"><h3>Compare this code with {remoteName}</h3><output aria-label="Connection verification code">{code}</output><p>Confirm the same code on both screens before sharing.</p><button className="primary" disabled={!connected||localApproved||busy} onClick={()=>void run(()=>{link.current!.approve();setLocalApproved(true);})}>{localApproved?'You approved this connection':role==='host'?'Approve this guest':'Confirm this host'}</button><p>{remoteApproved?'The other participant has approved.':'Waiting for the other participant’s approval.'}</p></div>}
      <button className="text-button" onClick={reset}>Disconnect and reset pairing</button></>}
    </section>
    <section className="panel"><h2>Read together</h2><p>Each participant keeps their own edition. Only the host can propose coordinated passage changes.</p><div className="nearby-form"><label>Your Bible edition<select aria-label="Your Bible edition" value={edition} onChange={e=>setEdition(e.target.value)}>{bibleEditionIds.map(id=><option key={id} value={id}>{id}</option>)}</select></label><label>Book code<input aria-label="Book code" value={book} maxLength={4} onChange={e=>setBook(e.target.value)}/></label><label>Chapter<input aria-label="Chapter" type="number" min={1} max={150} value={chapter} onChange={e=>setChapter(e.target.value)}/></label><label>First verse<input aria-label="First verse" type="number" min={1} max={176} value={first} onChange={e=>setFirst(e.target.value)}/></label><label>Last verse<input aria-label="Last verse" type="number" min={1} max={176} value={last} onChange={e=>setLast(e.target.value)}/></label></div><button className="secondary" disabled={busy} onClick={()=>void run(choosePassage)}>{role==='host'&&approved?'Open and propose passage':'Open passage on this device'}</button>
      {role==='guest'&&<label className="nearby-check"><input type="checkbox" checked={follow} onChange={e=>setFollow(e.target.checked)}/>Follow host passage changes using my own edition</label>}
      {proposed&&<p className="availability-note">Host proposed {label(proposed)}. <button className="text-button" onClick={()=>applyReference(proposed)}>Read proposed passage</button></p>}
      {sourceError?<p role="alert">{sourceError}</p>:passage?<div className="nearby-source"><h3>{sourceLabel(passage)}</h3>{passage.units.map(unit=><p key={unit.number}><sup>{unit.number}</sup> {unit.text}</p>)}<p className="small muted">{passage.attribution}</p><button className="text-button" onClick={()=>onOpenReference({...reading,editionId:edition})}>Open full reader</button></div>:<p role="status">Loading your selected source…</p>}
    </section>
    <section className="panel"><h2>Shared discussion and annotations</h2><p>Only text you send here is shared. Reader notes and other private workspaces are never read by this room. The last 100 messages stay in memory until you leave.</p><ol className="nearby-discussion" aria-label="Room discussion">{log.map((entry,i)=><li key={`${entry.at}-${i}`}><strong>{entry.name}</strong>{entry.reference&&<span> · {label(entry.reference)}</span>}<p>{entry.text}</p><time dateTime={entry.at}>{new Date(entry.at).toLocaleTimeString()}</time></li>)}</ol>
      <label>Write to the room<textarea aria-label="Write to the room" value={writing} maxLength={2000} rows={3} onChange={e=>setWriting(e.target.value)}/></label><label className="nearby-check"><input type="checkbox" checked={annotation} onChange={e=>setAnnotation(e.target.checked)}/>Attach current passage reference</label><button className="primary" disabled={!approved||busy||!writing.trim()} onClick={()=>void run(sendWriting)}>Send to participant</button><div className="button-row"><button className="text-button" disabled={!log.length} onClick={()=>downloadPrivateFile('adigun-nearby-discussion.json',JSON.stringify({kind:'adigun-nearby-discussion',schemaVersion:1,exportedAt:new Date().toISOString(),messages:log},null,2),'application/json')}>Download shared discussion</button><button className="text-button" disabled={!log.length} onClick={()=>{if(confirm('Clear this device’s copy of the discussion? The other participant keeps their own copy.'))setLog([]);}}>Clear local discussion</button></div>
    </section>
    <section className="panel"><h2>Transfer an attributed passage</h2><p>Offer the selected passage as a small study package. The receiver accepts first. Both sides check the edition’s sharing, offline and export rights. Verification requires this app’s source revision to be available on the receiving device.</p><button className="secondary" disabled={!approved||busy||!passage||!!outgoing.current||!!incoming.current||!!offer} onClick={()=>void run(offerPassage)}>Offer passage package</button>{offer&&<div className="availability-note"><p>{offer.title} · {offer.bytes.toLocaleString()} bytes</p><button className="secondary" disabled={!!incoming.current} onClick={()=>void run(acceptPassage)}>Accept passage package</button><button className="text-button" onClick={cancelTransfer}>Decline passage package</button></div>}
      {progress&&<p role="status">{progress}</p>}{(outgoing.current||incoming.current)&&<button className="text-button" onClick={cancelTransfer}>Cancel passage transfer</button>}{received&&<div><h3>Verified: {sourceLabel(received)}</h3><p>The package can be saved as attributed text. It does not install a Bible edition or overwrite a downloaded book.</p><button className="secondary" onClick={()=>downloadPrivateFile('adigun-shared-passage.txt',passagePackageText(received),'text/plain')}>Download received passage</button></div>}
    </section><details className="panel"><summary>Transport references and verification limits</summary><p><a href="https://www.w3.org/TR/webrtc/" target="_blank" rel="noreferrer">W3C WebRTC specification</a> · <a href="https://webrtc.org/getting-started/data-channels" target="_blank" rel="noreferrer">WebRTC data-channel documentation</a></p><p>Browser automation can check pairing and messages between pages. It cannot establish support for two real offline phones. Treat this as an experimental paired-room feature until a physical-device receipt is recorded.</p></details>
  </div>;
}

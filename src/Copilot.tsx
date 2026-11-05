import { useEffect, useRef, useState } from 'react';
import { BookOpen, Bookmark, FileText, Maximize2, MessageCircle, Minimize2, Search, X, CornerDownLeft, Move, Sparkles, Minus, Expand } from 'lucide-react';
import type { View } from './types';
import { BOT_GEOMETRY_KEY, botDestinations, clampGeometry, restoreGeometry } from './copilot/model';
import type { BotGeometry } from './copilot/model';
import './copilot/copilot.css';
interface Props {
  onReference: (text: string) => void; onSearch: (text: string) => void;
  onBookmark: () => boolean; onNote: () => void; onSources: () => void;
  onContext: () => void; onNavigate: (view:View) => boolean | void; selected: string;
}
const viewport = () => ({width:window.innerWidth,height:window.innerHeight});
function initialGeometry() {
  let raw = null; try { raw = localStorage.getItem(BOT_GEOMETRY_KEY) || localStorage.getItem('adigun-bot-position'); } catch { /* Optional presentation preference. */ }
  return restoreGeometry(raw,viewport());
}
export default function Copilot(props: Props) {
  const [open,setOpen]=useState(false), [max,setMax]=useState(false), [input,setInput]=useState('');
  const [geometry,setGeometry]=useState(initialGeometry), [geometryMessage,setGeometryMessage]=useState('');
  const [reply,setReply]=useState('Choose a study tool. These actions work locally; a generative AI service is not connected.');
  const launcher=useRef<HTMLButtonElement>(null), panel=useRef<HTMLDivElement>(null);
  const pointer=useRef<{x:number;y:number;geometry:BotGeometry;kind:'move'|'resize'}|null>(null);
  const changeGeometry=(next:Partial<BotGeometry>)=>setGeometry(previous=>clampGeometry({...previous,...next},viewport()));
  useEffect(()=>{
    const resize=()=>setGeometry(previous=>clampGeometry(previous,viewport()));
    window.addEventListener('resize',resize); return()=>window.removeEventListener('resize',resize);
  },[]);
  useEffect(()=>{
    try { localStorage.setItem(BOT_GEOMETRY_KEY,JSON.stringify(geometry)); }
    catch { setGeometryMessage('Window preferences could not be saved; the assistant still works for this visit.'); }
  },[geometry]);
  useEffect(()=>{if(open)panel.current?.querySelector<HTMLInputElement>('input')?.focus();},[open]);
  const close=()=>{setOpen(false);launcher.current?.focus();};
  useEffect(()=>{
    if(!open)return;
    const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'&&panel.current?.contains(document.activeElement)){e.preventDefault();setOpen(false);launcher.current?.focus();}};
    window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);
  },[open]);
  function pointerStart(e:React.PointerEvent<HTMLButtonElement>,kind:'move'|'resize') {
    if(max || window.innerWidth<=620)return;
    pointer.current={x:e.clientX,y:e.clientY,geometry,kind};e.currentTarget.setPointerCapture(e.pointerId);
  }
  function pointerMove(e:React.PointerEvent<HTMLButtonElement>) {
    const origin=pointer.current;if(!origin)return;
    const dx=e.clientX-origin.x,dy=e.clientY-origin.y;
    changeGeometry(origin.kind==='move'?{right:origin.geometry.right-dx,bottom:origin.geometry.bottom-dy}:{width:origin.geometry.width-dx,height:origin.geometry.height-dy});
  }
  function keyboard(e:React.KeyboardEvent<HTMLButtonElement>,kind:'move'|'resize') {
    if(max||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
    e.preventDefault();const amount=e.shiftKey?40:10;
    const dx=e.key==='ArrowLeft'?amount:e.key==='ArrowRight'?-amount:0;
    const dy=e.key==='ArrowUp'?amount:e.key==='ArrowDown'?-amount:0;
    changeGeometry(kind==='move'?{right:geometry.right+dx,bottom:geometry.bottom+dy}:{width:geometry.width+dx,height:geometry.height+dy});
  }
  function destination(view:View) {
    if(props.onNavigate(view)!==false)close();
    else setReply('Navigation was cancelled. Your current writing remains open.');
  }
  return <>
    <button ref={launcher} className="bot-launcher" onClick={()=>setOpen(value=>!value)} aria-label={open?'Close Adigun BOT':'Open Adigun BOT'} aria-expanded={open}><MessageCircle size={21}/><span>Adigun BOT</span><span className="status-dot"/></button>
    {open&&<div ref={panel} className={`bot-panel ${max?'maximized':''}`} role="dialog" aria-modal="false" aria-labelledby="bot-title" lang="en" style={max?{}:geometry}>
      <header className="bot-header">
        <button type="button" className="bot-drag" aria-label="Move assistant with arrow keys" aria-describedby="bot-geometry-help" onPointerDown={e=>pointerStart(e,'move')} onPointerMove={pointerMove} onPointerUp={()=>{pointer.current=null;}} onPointerCancel={()=>{pointer.current=null;}} onKeyDown={e=>keyboard(e,'move')}><Sparkles size={19}/><span><strong id="bot-title">Adigun BOT</strong><small>Local study assistant</small></span></button>
        <button type="button" className="icon-button" onClick={()=>changeGeometry({right:24,bottom:96,width:420,height:600})} aria-label="Reset assistant position"><Move size={16}/></button>
        <button type="button" className="icon-button" onClick={close} aria-label="Minimize assistant"><Minus size={16}/></button>
        <button type="button" className="icon-button" onClick={()=>setMax(value=>!value)} aria-label={max?'Restore assistant':'Maximize assistant'}>{max?<Minimize2 size={16}/>:<Maximize2 size={16}/>}</button>
        <button type="button" className="icon-button" onClick={close} aria-label="Close assistant"><X size={17}/></button>
      </header>
      <div className="bot-content"><span className="eyebrow">YOUR PASSAGE</span><h3>{props.selected}</h3><p className="muted">Choose a local action. Private notes stay on this device.</p>
        <div className="bot-tools" aria-label="Available local capabilities">
          <button type="button" onClick={()=>{const changed=props.onBookmark();setReply(changed?'Bookmark selection updated. Check the device-storage status for save confirmation.':'Study storage is still opening or unavailable. Check its status before saving.');}}><Bookmark size={17}/>Bookmark selected verse</button>
          <button type="button" onClick={()=>{close();props.onNote();}}><FileText size={17}/>Write a private note</button>
          <button type="button" onClick={()=>{close();props.onContext();}}><BookOpen size={17}/>Show passage context</button>
          <button type="button" onClick={()=>{close();props.onSources();}}><BookOpen size={17}/>Inspect the source edition</button>
          {botDestinations.map(action=><button type="button" key={action.id} title={action.description} onClick={()=>destination(action.view)}>{action.label}</button>)}
        </div><p className="bot-reply" role="status">{reply}</p>
      </div>
      <form className="bot-form" onSubmit={e=>{e.preventDefault();if(input.trim()){props.onReference(input);setReply('Reference sent to the reader. Any invalid reference is reported by the reader.');}}}>
        <label htmlFor="bot-input">Reference or search words</label><div className="input-with-action"><input id="bot-input" value={input} maxLength={500} onChange={e=>setInput(e.target.value)} placeholder="John 3:16"/><button aria-label="Open reference"><CornerDownLeft size={19}/></button></div>
        <button className="text-button" type="button" onClick={()=>{if(input.trim()){close();props.onSearch(input);}}}><Search size={16}/>Search these words</button>
      </form>
      <div className="bot-disclosure">No model service connected. Your notes and reading history are not sent to an AI provider.</div>
      <div className="bot-window-controls"><span id="bot-geometry-help" className="visually-hidden">Use arrow keys to move or resize. Hold Shift for larger steps. Window controls are constrained to this screen.</span><small role="status">{geometryMessage}</small><button type="button" className="icon-button bot-resize" aria-label="Resize assistant with arrow keys" aria-describedby="bot-geometry-help" onPointerDown={e=>pointerStart(e,'resize')} onPointerMove={pointerMove} onPointerUp={()=>{pointer.current=null;}} onPointerCancel={()=>{pointer.current=null;}} onKeyDown={e=>keyboard(e,'resize')}><Expand size={16}/></button></div>
    </div>}
  </>;
}

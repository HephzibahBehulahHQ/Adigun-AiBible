import { useEffect, useRef, useState } from 'react';
import { RetellingCapture } from './retelling-capture';
import type { CaptureState } from './retelling-capture';
import type { RetellingDraft, RetellingSource } from './retelling-media';

export default function RetellingRecorder({ disabled, source, onReady, onActiveChange }: { disabled:boolean; source:RetellingSource | null; onReady:(draft:RetellingDraft) => void; onActiveChange:(active:boolean) => void }) {
  const [state,setState] = useState<CaptureState>({ phase:'idle',elapsedMs:0,status:'',error:false });
  const [consent,setConsent] = useState(false);
  const capture = useRef<RetellingCapture | null>(null);
  const callbacks = useRef({ onReady,onActiveChange }); callbacks.current = { onReady,onActiveChange };
  const supported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
  useEffect(() => {
    capture.current = new RetellingCapture(next => { setState(next); callbacks.current.onActiveChange(next.phase !== 'idle'); },draft => callbacks.current.onReady(draft));
    return () => { capture.current?.dispose(); capture.current = null; };
  },[]);
  const active = state.phase !== 'idle';
  return <section className="retelling-recorder" aria-label="Record my retelling">
    <h5>Optional private voice recording</h5>
    <p className="workspace-help">Up to 5 minutes and 8 MiB per recording. Original audio stays in this browser. No automatic transcript, upload or score is created.</p>
    {!supported ? <p className="workspace-help">Microphone recording is unavailable in this browser. Written retellings still work.</p> : <>
      {!source && <p className="workspace-help">Load the exact source passage before making a new recording. Your saved originals and writing remain available.</p>}
      <label className="workspace-check"><input type="checkbox" checked={consent} disabled={disabled || active || !source} onChange={e => setConsent(e.target.checked)} /><span>I consent to this private recording and have permission from everyone being recorded.</span></label>
      <div className="button-row">
        <button type="button" disabled={disabled || active || !source || !consent} onClick={() => { if (!source || !consent) return; setConsent(false); if ('speechSynthesis' in window) window.speechSynthesis.cancel(); document.querySelectorAll('audio').forEach(audio => audio.pause()); void capture.current?.start(true,source); }}>Start private recording</button>
        {state.phase === 'recording' && <button type="button" onClick={() => capture.current?.stop(true)}>Stop and keep recording</button>}
        {active && <button type="button" onClick={() => capture.current?.stop(false)}>{state.phase === 'requesting' ? 'Cancel microphone request' : 'Cancel and discard recording'}</button>}
      </div>
      {state.phase === 'recording' && <p><span aria-hidden="true">● </span>Recording <time aria-live="off">{Math.floor(state.elapsedMs / 60000)}:{String(Math.floor(state.elapsedMs / 1000) % 60).padStart(2,'0')}</time></p>}
    </>}
    {state.status && <p role={state.error ? 'alert' : 'status'} className={state.error ? 'workspace-error' : 'workspace-help'}>{state.status}</p>}
  </section>;
}

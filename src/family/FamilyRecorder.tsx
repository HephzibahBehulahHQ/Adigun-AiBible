import { useEffect, useRef, useState } from 'react';
import { MAX_FAMILY_FILE_BYTES, prepareFamilyAttachment } from './model';
import type { FamilyAttachment } from './model';

interface RecordingSession { generation: number; recorder: MediaRecorder; stream: MediaStream; chunks: Blob[]; bytes: number; keep: boolean; error: string; startedAt: number; timer?: ReturnType<typeof setInterval>; reachedLimit: boolean }
const MAX_SECONDS = 15 * 60;

export default function FamilyRecorder({ disabled, onReady, onActiveChange }: { disabled: boolean; onReady: (file: FamilyAttachment) => void; onActiveChange: (active: boolean) => void }) {
  const [phase, setPhase] = useState<'idle' | 'requesting' | 'recording' | 'finishing'>('idle');
  const [consent, setConsent] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [status, setStatus] = useState('');
  const generation = useRef(0);
  const session = useRef<RecordingSession | null>(null);
  const mounted = useRef(true);
  const callbacks = useRef({ onReady, onActiveChange });
  callbacks.current = { onReady, onActiveChange };
  const supported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';

  const stopTracks = (current: RecordingSession) => { if (current.timer) clearInterval(current.timer); current.stream.getTracks().forEach(track => track.stop()); };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false; generation.current++;
      const current = session.current;
      if (current) { current.keep = false; current.recorder.ondataavailable = null; current.recorder.onstop = null; if (current.recorder.state !== 'inactive') current.recorder.stop(); stopTracks(current); }
      session.current = null;
    };
  }, []);

  function stop(keep: boolean) {
    const current = session.current;
    if (!current) { generation.current++; setPhase('idle'); callbacks.current.onActiveChange(false); setStatus('Microphone request canceled. No recording was kept.'); return; }
    current.keep = keep;
    if (!keep) setStatus('Discarding this recording…');
    setPhase('finishing');
    if (current.recorder.state !== 'inactive') current.recorder.stop();
    stopTracks(current);
  }

  async function start() {
    if (!supported || !consent || disabled || phase !== 'idle') return;
    const run = ++generation.current;
    setStatus('Waiting for microphone permission…'); setPhase('requesting'); setElapsed(0); callbacks.current.onActiveChange(true);
    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (run !== generation.current || !mounted.current) { stream.getTracks().forEach(track => track.stop()); return; }
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type));
      if (!mime) throw new Error('This browser reports no supported audio-recording format. Upload an original recording instead.');
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      const current: RecordingSession = { generation: run, recorder, stream, chunks: [], bytes: 0, keep: true, error: '', startedAt: Date.now(), reachedLimit: false };
      session.current = current;
      recorder.ondataavailable = event => {
        if (current.generation !== generation.current || !event.data.size) return;
        current.bytes += event.data.size;
        if (current.bytes > MAX_FAMILY_FILE_BYTES) { current.error = 'Recording exceeded 32 MiB and was not kept. Record a shorter part or upload a smaller original.'; current.keep = false; if (recorder.state !== 'inactive') recorder.stop(); stopTracks(current); return; }
        current.chunks.push(event.data);
      };
      recorder.onerror = () => { current.error = 'The microphone recording failed. No completed recording was saved.'; current.keep = false; if (recorder.state !== 'inactive') recorder.stop(); stopTracks(current); };
      recorder.onstop = async () => {
        stopTracks(current);
        if (run !== generation.current || !mounted.current) return;
        setPhase('finishing');
        try {
          if (current.error) throw new Error(current.error);
          if (!current.keep) { setStatus('Recording discarded. The microphone is off.'); return; }
          const type = recorder.mimeType || mime;
          const extension = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
          const original = new Blob(current.chunks, { type });
          const file = await prepareFamilyAttachment(original, `family-recording-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`, 'microphone');
          if (run !== generation.current || !mounted.current) return;
          callbacks.current.onReady(file);
          setStatus(`${current.reachedLimit ? 'The 15-minute recording limit was reached. ' : ''}Recording is ready in the form. Save the family item to keep it on this device.`);
        } catch (error) { if (mounted.current && run === generation.current) setStatus(error instanceof Error ? error.message : 'Could not prepare this recording.'); }
        finally { current.chunks = []; if (run === generation.current && mounted.current) { session.current = null; setPhase('idle'); callbacks.current.onActiveChange(false); } }
      };
      recorder.start(1000);
      setPhase('recording'); setStatus('Recording now. Audio stays in this browser; no transcription or upload is running.');
      current.timer = setInterval(() => {
        if (!mounted.current || run !== generation.current) return;
        const seconds = Math.floor((Date.now() - current.startedAt) / 1000); setElapsed(seconds);
        if (seconds >= MAX_SECONDS) { current.reachedLimit = true; setPhase('finishing'); if (recorder.state !== 'inactive') recorder.stop(); stopTracks(current); }
      }, 1000);
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop());
      if (run !== generation.current || !mounted.current) return;
      session.current = null; setPhase('idle'); callbacks.current.onActiveChange(false);
      const name = error instanceof DOMException ? error.name : '';
      setStatus(name === 'NotAllowedError' ? 'Microphone permission was denied. No recording was made. You can grant permission in your browser or upload an original file.' : name === 'NotFoundError' ? 'No microphone was found on this device.' : error instanceof Error ? error.message : 'The microphone could not be opened.');
    }
  }

  return <section className="family-recorder" aria-label="Record a family voice">
    <h3>Record a family voice</h3>
    <p className="family-help">Record up to 15 minutes or 32 MiB per item. The original is kept in the browser’s supported format. A recording does not grant permission to clone anyone’s voice.</p>
    {!supported ? <p className="family-help">Microphone recording is unavailable in this browser. You can upload an authorized original recording.</p> : <>
      <label className="family-check"><input type="checkbox" checked={consent} disabled={disabled || phase !== 'idle'} onChange={event => setConsent(event.target.checked)} /><span>I have permission from everyone being recorded.</span></label>
      <div className="button-row">
        <button type="button" className="secondary" disabled={disabled || !consent || phase !== 'idle'} onClick={() => void start()}>Start recording</button>
        {phase === 'recording' && <button type="button" className="secondary" onClick={() => stop(true)}>Stop and keep recording</button>}
        {(phase === 'recording' || phase === 'requesting') && <button type="button" onClick={() => stop(false)}>{phase === 'requesting' ? 'Cancel microphone request' : 'Cancel and discard recording'}</button>}
      </div>
      {phase === 'recording' && <p className="family-recording"><span aria-hidden="true">●</span> Recording <time aria-live="off">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</time></p>}
      {phase === 'finishing' && <p className="family-help">Preparing the original recording…</p>}
    </>}
    {status && <p className="family-help" role="status">{status}</p>}
  </section>;
}

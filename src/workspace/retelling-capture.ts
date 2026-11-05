import { MAX_RETELLING_AUDIO_BYTES, MAX_RETELLING_CAPTURE_MS, prepareRetellingDraft, validateRetellingSource } from './retelling-media.ts';
import type { RetellingDraft, RetellingSource } from './retelling-media';

export interface CaptureState { phase: 'idle' | 'requesting' | 'recording' | 'finishing'; elapsedMs: number; status: string; error: boolean }
export interface CaptureEnvironment {
  request: () => Promise<MediaStream>; supports: (mime: string) => boolean;
  create: (stream: MediaStream, mime: string) => MediaRecorder; now: () => number;
  later: typeof setTimeout; cancelLater: typeof clearTimeout;
  every: typeof setInterval; cancelEvery: typeof clearInterval;
}
const browserEnvironment: CaptureEnvironment = {
  request: () => navigator.mediaDevices.getUserMedia({ audio:true, video:false }),
  supports: mime => MediaRecorder.isTypeSupported(mime), create: (stream,mime) => new MediaRecorder(stream,{ mimeType:mime }),
  now: () => performance.now(), later:setTimeout, cancelLater:clearTimeout, every:setInterval, cancelEvery:clearInterval,
};
interface Session {
  run:number; recorder:MediaRecorder; stream:MediaStream; source:RetellingSource; mime:string;
  chunks:Blob[]; bytes:number; started:number; stopped?:number; keep:boolean; error:string;
  timer?:ReturnType<typeof setInterval>; deadline?:ReturnType<typeof setTimeout>; ended:() => void; limited:boolean;
}
/** Local capture only. Consent, bytes, lifecycle and asynchronous generation checks live in one place. */
export class RetellingCapture {
  private generation = 0;
  private disposed = false;
  private session: Session | null = null;
  private state: CaptureState = { phase:'idle', elapsedMs:0, status:'', error:false };
  constructor(private changed:(state:CaptureState) => void, private ready:(draft:RetellingDraft) => void, private env:CaptureEnvironment = browserEnvironment) {}
  private publish(change:Partial<CaptureState>) { this.state = { ...this.state,...change }; if (!this.disposed) this.changed(this.state); }
  private release(current:Session) {
    if (current.timer !== undefined) this.env.cancelEvery(current.timer);
    if (current.deadline !== undefined) this.env.cancelLater(current.deadline);
    current.stream.getTracks().forEach(track => { track.removeEventListener('ended',current.ended); track.stop(); });
  }
  async start(consent:boolean, source:RetellingSource) {
    if (this.disposed || this.state.phase !== 'idle' || !consent) return;
    const run = ++this.generation; let stream:MediaStream | undefined;
    this.publish({ phase:'requesting',elapsedMs:0,error:false,status:'Waiting for microphone permission…' });
    try {
      const boundSource = validateRetellingSource(source);
      stream = await this.env.request();
      if (run !== this.generation || this.disposed) { stream.getTracks().forEach(track => track.stop()); return; }
      const mime = ['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/mp4'].find(type => this.env.supports(type));
      if (!mime) throw new Error('This browser has no supported recording format. You can still write a retelling.');
      const recorder = this.env.create(stream,mime);
      const current:Session = { run,recorder,stream,source:boundSource,mime,chunks:[],bytes:0,started:this.env.now(),keep:true,error:'',limited:false,ended:() => { current.error = 'The microphone disconnected. This incomplete recording was discarded; your writing remains.'; this.stop(false); } };
      this.session = current;
      stream.getTracks().forEach(track => track.addEventListener('ended',current.ended));
      recorder.ondataavailable = event => {
        if (run !== this.generation || this.disposed || !event.data.size) return;
        current.bytes += event.data.size;
        if (current.bytes > MAX_RETELLING_AUDIO_BYTES) { current.error = 'Recording exceeded 8 MiB and was discarded. Your writing remains; try a shorter recording.'; this.stop(false); return; }
        current.chunks.push(event.data);
      };
      recorder.onerror = () => { current.error = 'Microphone recording failed. No recording was saved; your writing remains.'; this.stop(false); };
      recorder.onstop = () => void this.finished(current);
      recorder.start(1000);
      this.publish({ phase:'recording',status:'Recording now. Audio stays in this browser; no upload or transcription is running.' });
      current.timer = this.env.every(() => { if (run === this.generation && !this.disposed) this.publish({ elapsedMs:Math.max(0,this.env.now()-current.started) }); },1000);
      // Leave one second for normal event scheduling. A suspended browser that exceeds five minutes fails closed.
      current.deadline = this.env.later(() => { current.limited = true; this.stop(true); },MAX_RETELLING_CAPTURE_MS - 1000);
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop());
      if (run !== this.generation || this.disposed) return;
      if (this.session) this.release(this.session);
      this.session = null;
      const name = error instanceof DOMException ? error.name : '';
      this.publish({ phase:'idle',error:true,status:name === 'NotAllowedError' ? 'Microphone permission was denied. You can still write and save a retelling.' : name === 'NotFoundError' ? 'No microphone was found on this device. You can still write a retelling.' : error instanceof Error ? error.message : 'The microphone could not be opened.' });
    }
  }
  stop(keep:boolean) {
    if (this.disposed) return;
    const current = this.session;
    if (!current) { this.generation++; this.publish({ phase:'idle',status:'Microphone request canceled. No recording was kept.',error:false }); return; }
    current.keep = keep;
    if (current.stopped === undefined) current.stopped = this.env.now();
    this.publish({ phase:'finishing',status:keep ? 'Preparing the original recording…' : 'Discarding this recording…' });
    this.release(current);
    try { if (current.recorder.state !== 'inactive') current.recorder.stop(); else if (!keep) { this.generation++; this.session = null; current.chunks = []; this.publish({ phase:'idle',status:current.error || 'Recording discarded. The microphone is off.',error:!!current.error }); } }
    catch { this.generation++; this.session = null; current.chunks = []; this.publish({ phase:'idle',status:'The recording could not be stopped cleanly and was discarded. The microphone is off.',error:true }); }
  }
  private async finished(current:Session) {
    this.release(current);
    if (current.run !== this.generation || this.disposed) return;
    this.publish({ phase:'finishing' });
    try {
      if (current.error) throw new Error(current.error);
      if (!current.keep) { this.publish({ status:'Recording discarded. The microphone is off.',error:false }); return; }
      const captureMs = Math.max(0,Math.floor((current.stopped ?? this.env.now()) - current.started));
      if (captureMs > MAX_RETELLING_CAPTURE_MS) throw new Error('Capture exceeded five minutes while the browser was delayed. The recording was discarded; your writing remains.');
      const blob = new Blob(current.chunks,{ type:current.recorder.mimeType || current.mime });
      const draft = await prepareRetellingDraft(blob,captureMs,current.source);
      if (current.run !== this.generation || this.disposed) return;
      this.ready(draft);
      this.publish({ status:`${current.limited ? 'Recording stopped at the time limit. ' : ''}Original recording ready. Save the private retelling to keep it on this device.`,error:false });
    } catch (error) { if (current.run === this.generation && !this.disposed) this.publish({ error:true,status:error instanceof Error ? error.message : 'The recording could not be prepared.' }); }
    finally { current.chunks = []; if (current.run === this.generation && !this.disposed) { this.session = null; this.publish({ phase:'idle' }); } }
  }
  dispose() {
    this.disposed = true; this.generation++;
    const current = this.session; this.session = null;
    if (current) { current.keep = false; current.chunks = []; current.recorder.ondataavailable = null; current.recorder.onstop = null; current.recorder.onerror = null; this.release(current); try { if (current.recorder.state !== 'inactive') current.recorder.stop(); } catch { /* Tracks have already been stopped. */ } }
  }
}

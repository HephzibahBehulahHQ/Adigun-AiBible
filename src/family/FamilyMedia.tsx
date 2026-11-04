import { useEffect, useMemo, useRef, useState } from 'react';
import { parseCaptions } from './model';
import type { FamilyAttachment } from './model';

export function familySize(bytes: number): string { return bytes < 1024 * 1024 ? `${Math.max(1, Math.ceil(bytes / 1024))} KiB` : `${(bytes / 1024 / 1024).toFixed(1)} MiB`; }

export function downloadFamilyBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function useBlobUrl(blob: Blob) {
  const [url, setUrl] = useState('');
  useEffect(() => { const next = URL.createObjectURL(blob); setUrl(next); return () => URL.revokeObjectURL(next); }, [blob]);
  return url;
}

export default function FamilyMedia({ attachment, title, captionsVtt = '' }: { attachment: FamilyAttachment; title: string; captionsVtt?: string }) {
  const url = useBlobUrl(attachment.blob);
  const audio = useRef<HTMLAudioElement>(null);
  const [position, setPosition] = useState(0);
  const [error, setError] = useState('');
  const captions = useMemo(() => { try { return parseCaptions(captionsVtt); } catch { return []; } }, [captionsVtt]);
  const current = captions.filter(cue => cue.start <= position && cue.end > position);
  useEffect(() => { setError(''); setPosition(0); }, [attachment.blob]);
  return <div className="family-media">
    {attachment.kind === 'photo' && url && <img src={url} alt={title} loading="lazy" onError={() => setError('This browser cannot preview the original image. You can still download the saved file.')} />}
    {attachment.kind === 'audio' && url && <>
      <audio ref={audio} controls preload="metadata" src={url} aria-label={`Original recording: ${title}`} onTimeUpdate={event => setPosition(event.currentTarget.currentTime)} onError={() => setError('This browser cannot play the original audio format. Download it for a compatible player.')} />
      {captions.length > 0 && <>
        <div className="family-caption" aria-label="Current caption" aria-live="off">{current.length ? current.map(cue => cue.text).join('\n') : 'Captions appear here at their recorded times.'}</div>
        <details className="family-cue-list"><summary>All caption cues ({captions.length})</summary><ol>{captions.map((cue, index) => <li key={`${cue.start}-${index}`}><button type="button" onClick={() => { if (audio.current) { audio.current.currentTime = cue.start; setPosition(cue.start); } }} aria-label={`Seek to ${Math.floor(cue.start / 60)} minutes ${Math.floor(cue.start % 60)} seconds`} >{Math.floor(cue.start / 60)}:{String(Math.floor(cue.start % 60)).padStart(2, '0')}</button><span>{cue.text}</span></li>)}</ol></details>
      </>}
    </>}
    {attachment.kind === 'document' && <p className="family-meta">Original document retained. Download it to open in your chosen application.</p>}
    {error && <p className="family-error" role="alert">{error}</p>}
    <p className="family-meta">{attachment.name} · {familySize(attachment.size)} · {attachment.origin === 'microphone' ? 'Recorded with the device microphone' : 'Uploaded original'}</p>
    <button type="button" className="secondary" onClick={() => downloadFamilyBlob(attachment.blob, attachment.name)}>Download original file</button>
  </div>;
}

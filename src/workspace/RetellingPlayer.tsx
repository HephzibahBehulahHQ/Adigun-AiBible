import { useEffect, useState } from 'react';
import { loadRetellingMedia } from './storage';
import { referenceLabel } from './model';
import type { RetellingMedia, RetellingRecording } from './retelling-media';

export default function RetellingPlayer({ recording, original, disabled=false }: { recording:RetellingRecording; original?:RetellingMedia; disabled?:boolean }) {
  const [url,setUrl] = useState(''); const [error,setError] = useState(''); const [retry,setRetry] = useState(0);
  useEffect(() => {
    let live = true; let objectUrl = ''; setUrl(''); setError('');
    if (!disabled) void (original ? Promise.resolve(original) : loadRetellingMedia(recording)).then(file => {
      if (!live) return; objectUrl = URL.createObjectURL(file.blob); setUrl(objectUrl);
    }).catch(reason => { if (live) setError(reason instanceof Error ? reason.message : 'The original recording is unavailable.'); });
    return () => { live = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  },[recording,original,disabled,retry]);
  return <div className="retelling-player">
    <p className="workspace-help">Original recording · {(recording.bytes / 1024).toFixed(1)} KiB · elapsed capture {(recording.captureMs / 1000).toFixed(1)} seconds</p>
    {disabled ? <p className="workspace-help">Playback is paused while the microphone is active.</p> : url ? <>
      <audio controls preload="metadata" src={url} aria-label="Original retelling recording" onError={() => setError('This browser cannot play the original format. Download the original recording for a compatible player; the manual transcript remains available.')} />
      <a className="retelling-download" href={url} download={recording.name}>Download original recording</a>
    </> : !error && <p role="status">Checking the saved original recording…</p>}
    {error && <p className="workspace-error" role="alert">{error} {!url && <button type="button" onClick={() => setRetry(value => value + 1)}>Retry original recording</button>}</p>}
    <details><summary>Recording details and source</summary><p className="workspace-help">Recorded for {referenceLabel(recording.source.ref)}. Capture time is elapsed microphone time; decoded media duration has not been independently measured.</p><dl><dt>Original file</dt><dd>{recording.name}</dd><dt>Actual MIME</dt><dd>{recording.mimeType}</dd><dt>Original SHA-256</dt><dd>{recording.sha256}</dd><dt>Source edition revision</dt><dd>{recording.source.editionSha256}</dd></dl></details>
  </div>;
}

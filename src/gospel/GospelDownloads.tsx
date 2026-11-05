import { useEffect, useRef, useState } from 'react';
import { assetUrl } from '../data';
import { downloadOfflineFiles, inspectOfflineDownloads } from '../offline';
import type { SavedPassage } from '../reading-session/model';
import { gospelDownloadPlan } from './source';

export default function GospelDownloads({ passages, onBusyChange }: { passages: SavedPassage[]; onBusyChange: (busy: boolean) => void }) {
  const key = JSON.stringify(passages), lock = useRef(false), abort = useRef<AbortController | null>(null), alive = useRef(false);
  const [plan, setPlan] = useState<{ key: string; paths: string[]; bytes: number; ready: boolean }>();
  const [error, setError] = useState(''), [status, setStatus] = useState(''), [busy, setBusy] = useState(false), [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; alive.current = true;
    Promise.all([gospelDownloadPlan(passages), inspectOfflineDownloads(assetUrl(''))]).then(([next, downloaded]) => {
      if (active) { setPlan({ ...next, key, ready: next.paths.every(path => downloaded.includes(path)) }); setError(''); }
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Download status could not be checked.'); });
    return () => { active = false; alive.current = false; abort.current?.abort(); };
  }, [key, passages, retry]);
  async function download() {
    if (lock.current || plan?.key !== key) return;
    lock.current = true; setBusy(true); onBusyChange(true); setError('');
    const controller = new AbortController(); abort.current = controller;
    try {
      await downloadOfflineFiles(assetUrl(''), plan.paths, { packId: 'gospel-comparison', signal: controller.signal,
        onProgress: (done, total) => { if (alive.current) setStatus(`${done} of ${total} source files verified`); } });
      if (alive.current) { setPlan({ ...plan, ready: true }); setStatus('Selected source books, edition manifests and rights notices are verified for offline use.'); }
    } catch (reason) { if (alive.current) { setError(controller.signal.aborted ? 'Download cancelled. Previous complete downloads remain available.' : reason instanceof Error ? reason.message : 'Download failed.'); setStatus(''); } }
    finally { lock.current = false; abort.current = null; onBusyChange(false); if (alive.current) setBusy(false); }
  }
  return <section className="panel gospel-downloads" aria-labelledby="gospel-offline-title">
    <h2 id="gospel-offline-title">Keep this row available offline</h2>
    <p>{plan?.key === key ? `${plan.ready ? 'Source files downloaded and verified.' : 'These source files are not all downloaded.'} ${(plan.bytes / 1_000_000).toFixed(1)} MB before browser compression.` : 'Checking selected source books and complete rights notices…'}</p>
    <p className="muted small">This downloads the selected books, including chapter context. Private notes use separate device storage; export a backup to keep them. Remove source downloads in Settings for the relevant edition.</p>
    <div className="button-row"><button className="secondary" disabled={busy || plan?.key !== key} onClick={() => void download()}>{plan?.ready ? 'Verify row downloads' : 'Download row sources'}</button>{busy && <button className="secondary" onClick={() => abort.current?.abort()}>Cancel row download</button>}{error && <button className="secondary" disabled={busy} onClick={() => { setError(''); setRetry(value => value + 1); }}>Retry download check</button>}</div>
    {status && <p role="status">{status}</p>}{error && <p role="alert">{error}</p>}
  </section>;
}

import { useEffect, useRef, useState } from 'react';
import { downloadSourceBook, removeSourceBook, verifySourceDownload } from './offline';
import { pinFor, requiredSourcePaths, SOURCE_PREFIX } from './source';

export default function SourceDownloads({ baseUrl, bookId, bookName, onRemoved }: { baseUrl: string; bookId: string; bookName: string; onRemoved: () => void }) {
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [checking, setChecking] = useState(true);
  const [status, setStatus] = useState('Checking exact source download bytes…'), [error, setError] = useState('');
  const current = useRef(0), lock = useRef(false), abort = useRef<AbortController | null>(null);
  const bytes = requiredSourcePaths(bookId).reduce((total, path) => total + pinFor(path.slice(SOURCE_PREFIX.length)).bytes, 0);
  useEffect(() => {
    const generation = ++current.current, controller = new AbortController(); abort.current = controller;
    setReady(false); setChecking(true); setError(''); setStatus('Checking exact source download bytes…');
    void verifySourceDownload(baseUrl, bookId, controller.signal).then(result => {
      if (generation !== current.current) return;
      setReady(result.verified); setStatus(result.verified ? 'Source book, morphology key and all source notices verified on this device.' : 'The complete source book and notices have not been verified for offline use.');
    }).catch(reason => { if (generation === current.current && !controller.signal.aborted) { setError(reason instanceof Error ? reason.message : 'Download verification is unavailable.'); setStatus(''); } })
      .finally(() => { if (generation === current.current) { setChecking(false); abort.current = null; } });
    const guard = (event: Event) => { if (lock.current) event.preventDefault(); }; window.addEventListener('adigun:before-update', guard);
    return () => { current.current++; controller.abort(); abort.current?.abort(); window.removeEventListener('adigun:before-update', guard); };
  }, [baseUrl, bookId]);
  async function download() {
    if (checking || lock.current) return;
    lock.current = true; setBusy(true); setError(''); const generation = current.current, controller = new AbortController(); abort.current = controller;
    try {
      await downloadSourceBook(baseUrl, bookId, controller.signal, (done, total) => { if (generation === current.current) setStatus(`${done} of ${total} source files verified; completing the atomic download…`); });
      if (generation === current.current) { setReady(true); setStatus('Source book, morphology key and all source notices verified on this device.'); }
    } catch (reason) {
      if (generation === current.current) { setError(controller.signal.aborted ? 'Download cancelled. Existing complete packs are retained.' : reason instanceof Error ? reason.message : 'Source download failed.'); setStatus(''); }
    } finally { lock.current = false; if (generation === current.current) { abort.current = null; setBusy(false); } }
  }
  async function remove() {
    if (checking || lock.current) return;
    lock.current = true; setBusy(true); setError(''); const generation = current.current;
    try {
      await removeSourceBook(baseUrl, bookId);
      if (generation === current.current) { setReady(false); setStatus('Selected source book removed from offline storage. Shared source notices remain available.'); onRemoved(); }
    } catch (reason) { if (generation === current.current) setError(reason instanceof Error ? reason.message : 'Source removal failed.'); }
    finally { lock.current = false; if (generation === current.current) setBusy(false); }
  }
  return <section className="panel hebrew-downloads" aria-labelledby="hebrew-downloads-title">
    <h2 id="hebrew-downloads-title">Offline source book</h2>
    <p>{bookName} with the complete source manifest, provenance, integrity ledger, morphology key and five source notices: {(bytes / 1_000_000).toFixed(1)} MB.</p>
    <p className="muted small">This download provides source reading and exact lemma lookup within this book. Historical dictionaries have their own download and verification controls.</p>
    <div className="button-row">
      <button className="secondary" disabled={checking || busy} onClick={() => void download()}>{ready ? 'Verify source book and notices' : 'Download source book and notices'}</button>
      {busy && abort.current && <button className="secondary" onClick={() => abort.current?.abort()}>Cancel source download</button>}
      <button className="text-button" disabled={checking || busy} onClick={() => void remove()}>Remove source book download</button>
    </div>
    {status && <p role="status" data-testid="hebrew-download-status">{status}</p>}{error && <p role="alert">{error}</p>}
  </section>;
}

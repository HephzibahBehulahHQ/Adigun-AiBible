import { useEffect, useRef, useState } from 'react';
import { assetUrl } from '../data';
import { downloadOfflineFiles, getOfflineManifest, inspectOfflineDownloads, removeOfflineDownloads } from '../offline';
import { lexiconManifest } from './data';

const paths = ['data/linguistics/manifest.json', 'data/linguistics/NOTICE.txt', ...lexiconManifest.dictionaries.map(dictionary => `data/linguistics/${dictionary.path}`)];
export default function LexiconDownloads() {
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [checking, setChecking] = useState(true), [size, setSize] = useState<number | null>(null);
  const [status, setStatus] = useState('Checking dictionary downloads…'), [error, setError] = useState('');
  const abort = useRef<AbortController | null>(null), lock = useRef(false), alive = useRef(false);
  useEffect(() => {
    let current = true;
    alive.current = true;
    void Promise.all([inspectOfflineDownloads(assetUrl('')), getOfflineManifest(assetUrl(''))]).then(([cached, manifest]) => {
      if (!current) return;
      setReady(paths.every(path => cached.includes(path)));
      setSize(paths.reduce((total, path) => total + (manifest.files[path]?.bytes || 0), 0));
      setStatus('');
      setChecking(false);
    }).catch(reason => { if (current) { setError(reason instanceof Error ? reason.message : 'Download status is unavailable.'); setStatus(''); setChecking(false); } });
    const guard = (event: Event) => { if (lock.current) event.preventDefault(); };
    window.addEventListener('adigun:before-update', guard);
    return () => { current = false; alive.current = false; abort.current?.abort(); window.removeEventListener('adigun:before-update', guard); };
  }, []);
  async function download() {
    if (checking || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    const controller = new AbortController(); abort.current = controller;
    try {
      await downloadOfflineFiles(assetUrl(''), paths, {
        packId: 'historical-lexicons', signal: controller.signal,
        onProgress: (done, total) => { if (alive.current) setStatus(`${done} of ${total} dictionary files verified`); },
      });
      if (alive.current) { setReady(true); setStatus('Both dictionaries and their source notices are verified for offline lookup.'); }
    } catch (reason) {
      if (alive.current) { setError(controller.signal.aborted ? 'Dictionary download cancelled. Existing complete downloads are retained.' : reason instanceof Error ? reason.message : 'Dictionary download failed.'); setStatus(''); }
    } finally { lock.current = false; abort.current = null; if (alive.current) setBusy(false); }
  }
  async function remove() {
    if (checking || lock.current || !window.confirm('Remove downloaded dictionaries and their notices? Your private translation exercises are retained.')) return;
    lock.current = true; setBusy(true); setError('');
    try {
      await removeOfflineDownloads(assetUrl(''), { prefix: 'data/linguistics/' });
      if (alive.current) { setReady(false); setStatus('Dictionary downloads removed. Private translation exercises are retained.'); }
    } catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : 'Dictionary removal failed.'); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  return <section className="panel" aria-labelledby="lexicon-downloads-title">
    <h2 id="lexicon-downloads-title">Offline dictionaries</h2>
    <p>{ready ? 'Both historical dictionaries and the complete source notices are downloaded on this device.' : 'Download both dictionaries and their notices to keep lexical lookup available without a connection.'}{size !== null && ` ${new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(size / 1_000_000)} MB before browser compression.`}</p>
    <p className="muted small">Bible passages need their own book download. Private experiments are stored separately and should be backed up.</p>
    <div className="button-row"><button className="secondary" disabled={checking || busy} onClick={() => void download()}>{ready ? 'Verify dictionary downloads' : 'Download dictionaries and notices'}</button>{busy && abort.current && <button className="secondary" onClick={() => abort.current?.abort()}>Cancel dictionary download</button>}{ready && <button className="text-button" disabled={checking || busy} onClick={() => void remove()}>Remove dictionary downloads</button>}</div>
    {status && <p role="status">{status}</p>}{error && <p role="alert">{error}</p>}
  </section>;
}

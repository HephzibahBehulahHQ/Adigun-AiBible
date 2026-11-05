import { useEffect, useRef, useState } from 'react';
import { editionDataPath, getBook, getManifest } from '../data';
import { downloadOfflineFiles, getOfflineManifest } from '../offline';
import { requirePermission } from '../permissions';
import { gospelReferenceKey, resolvePaneReference } from './model';
import type { GospelSelection } from './model';
import { loadGospelExcerpt } from './source';

const base = import.meta.env.BASE_URL;
export default function GospelDownloads({ selection }: { selection: GospelSelection }) {
  const references = selection.panes.map(pane => resolvePaneReference(selection, pane));
  const key = references.map(gospelReferenceKey).join('|');
  const [busy, setBusy] = useState(false), [status, setStatus] = useState(''), [error, setError] = useState('');
  const generation = useRef(0), controller = useRef<AbortController | null>(null);
  useEffect(() => {
    generation.current++; setBusy(false); setStatus(''); setError('');
    const guard = (event: Event) => { if (controller.current) event.preventDefault(); };
    window.addEventListener('adigun:before-update', guard);
    return () => { generation.current++; controller.current?.abort(); controller.current = null; window.removeEventListener('adigun:before-update', guard); };
  }, [key]);
  async function download() {
    if (controller.current) return;
    const token = generation.current, abort = new AbortController(); controller.current = abort;
    setBusy(true); setError(''); setStatus('Checking the selected sources and offline permissions…');
    try {
      const excerpts = await Promise.all(references.map(reference => loadGospelExcerpt(reference, { getManifest, getBook, requirePermission })));
      const paths = new Set(['data/manifest.json', 'data/editions/catalog.json', 'data/editions/rights-register.json', 'data/editorial.json']);
      for (const excerpt of excerpts) {
        await requirePermission(excerpt.edition, 'offline');
        paths.add(editionDataPath(excerpt.edition.id, 'manifest.json'));
        paths.add(editionDataPath(excerpt.edition.id, `books/${excerpt.reference.bookId}.json`));
        if (excerpt.edition.noticePath) paths.add(`data/editions/${excerpt.edition.noticePath}`);
      }
      if (abort.signal.aborted || generation.current !== token) return;
      const inventory = await getOfflineManifest(base, abort.signal);
      if (abort.signal.aborted || generation.current !== token) return;
      let bytes = 0;
      for (const path of paths) {
        if (!inventory.files[path]) throw new Error('This source file is absent from the verified download inventory. Update the app before downloading.');
        bytes += inventory.files[path].bytes;
      }
      setStatus(`Downloading ${(bytes / 1_000_000).toFixed(1)} MB of source books and notices…`);
      await downloadOfflineFiles(base, [...paths], { packId: 'gospel-comparison', signal: abort.signal, onProgress: (done, total) => { if (generation.current === token) setStatus(`${done} of ${total} Gospel source files verified; completing the download…`); } });
      if (generation.current === token) setStatus('Selected Gospel books and included source notices are verified for offline reading on this device.');
    } catch (reason) {
      if (generation.current === token) { setStatus(''); setError(abort.signal.aborted ? 'Gospel download cancelled. Existing complete downloads are retained.' : reason instanceof Error ? reason.message : 'Gospel download failed. Existing complete downloads are retained.'); }
    } finally {
      if (generation.current === token) { controller.current = null; setBusy(false); }
    }
  }
  return <details className="panel gospel-downloads"><summary>Offline Gospel reading</summary><p>Download the books used by these panes with their edition details, permissions and included source notices. The comparison link retains your ranges; no private notebook is included. Changing a pane cancels an unfinished download.</p><div className="button-row"><button className="secondary" disabled={busy} onClick={() => void download()}>Download or verify these Gospel books</button>{busy && <button className="secondary" onClick={() => controller.current?.abort()}>Cancel Gospel download</button>}</div>{status && <p role="status">{status}</p>}{error && <p role="alert">{error}</p>}</details>;
}

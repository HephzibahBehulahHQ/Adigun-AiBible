import { useEffect, useRef, useState } from 'react';
import { downloadBlob } from '../media';
import { addReaderLayout, MAX_LAYOUTS, MAX_LAYOUT_BACKUP_BYTES, parseReaderLayoutsBackup, readerLayoutsBackup, removeReaderLayout, renameReaderLayout } from './model';
import type { ReaderLayout, ReaderLayoutSettings, ReaderLayoutsState } from './model';
import { DamagedReaderLayoutsError, loadReaderLayouts, resetDamagedReaderLayouts, saveReaderLayouts } from './storage';
import { validateLayoutSources } from './sources';
import './reader-layouts.css';

interface Props {
  settings: ReaderLayoutSettings;
  onApply: (settings: ReaderLayoutSettings, signal: AbortSignal) => Promise<void>;
  onClose: () => void;
}
const message = (error: unknown) => error instanceof Error ? error.message : 'Reader layout changes could not be saved.';

export default function ReaderLayouts({ settings, onApply, onClose }: Props) {
  const [state, setState] = useState<ReaderLayoutsState | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Opening saved layouts…');
  const [busy, setBusy] = useState(false);
  const [damaged, setDamaged] = useState<DamagedReaderLayoutsError | null>(null);
  const [preview, setPreview] = useState<ReaderLayoutsState | null>(null);
  const [rename, setRename] = useState<{ id: string; name: string } | null>(null);
  const alive = useRef(true), working = useRef(false), applyController = useRef<AbortController | null>(null);

  function report(failure: unknown) {
    if (!alive.current) return;
    setError(message(failure)); setStatus('');
    if (failure instanceof DamagedReaderLayoutsError) { setDamaged(failure); setState(null); }
  }
  async function reload() {
    if (working.current) return;
    working.current = true; setBusy(true); setError(''); setStatus('Opening saved layouts…');
    try {
      const loaded = await loadReaderLayouts();
      if (!alive.current) return;
      setState(loaded); setDamaged(null); setPreview(null); setRename(null); setStatus('Saved layouts loaded.');
    } catch (failure) { report(failure); }
    finally { working.current = false; if (alive.current) setBusy(false); }
  }
  useEffect(() => {
    alive.current = true;
    void reload();
    return () => { alive.current = false; applyController.current?.abort(); };
    // This dialog reloads the current record each time it is opened.
  }, []);

  async function change(build: (current: ReaderLayoutsState) => ReaderLayoutsState) {
    if (!state || working.current) return false;
    working.current = true; setBusy(true); setError(''); setStatus('Saving layouts…');
    try {
      const saved = await saveReaderLayouts(build(state), state.revision);
      if (!alive.current) return false;
      setState(saved); setPreview(null); setRename(null); setStatus('Saved on this device.');
      return true;
    } catch (failure) { report(failure); return false; }
    finally { working.current = false; if (alive.current) setBusy(false); }
  }
  async function apply(layout: ReaderLayout) {
    if (working.current) return;
    working.current = true; setBusy(true); setError(''); setStatus('Checking saved layout…');
    const controller = new AbortController(); applyController.current = controller;
    try {
      await onApply(layout.settings, controller.signal);
      if (alive.current && !controller.signal.aborted) onClose();
    } catch (failure) { if (!controller.signal.aborted) report(failure); }
    finally { working.current = false; if (alive.current) setBusy(false); }
  }
  async function importFile(file: File | undefined) {
    if (!file || !state || working.current) return;
    working.current = true; setBusy(true); setError(''); setPreview(null); setStatus('Checking layout backup…');
    try {
      if (file.size > MAX_LAYOUT_BACKUP_BYTES) throw new Error('Reader layout backup is too large.');
      const imported = parseReaderLayoutsBackup(await file.text());
      await Promise.all(imported.layouts.map(layout => validateLayoutSources(layout.settings)));
      if (alive.current) { setPreview(imported); setStatus('Backup checked. Review it before replacing saved layouts.'); }
    } catch (failure) { report(failure); }
    finally { working.current = false; if (alive.current) setBusy(false); }
  }
  function exportLayouts() {
    if (!state) return;
    try {
      downloadBlob(new Blob([readerLayoutsBackup(state)], { type: 'application/json' }), 'Adigun-reader-layouts.json');
      setStatus('Layout backup downloaded.');
    } catch (failure) { report(failure); }
  }
  async function reset() {
    if (!damaged?.backup || working.current || !confirm('Reset damaged saved layouts on this device? Download the damaged data first. Your notes and reading history are kept separately.')) return;
    working.current = true; setBusy(true); setError('');
    try {
      const recovered = await resetDamagedReaderLayouts(damaged.backup);
      if (alive.current) { setState(recovered); setDamaged(null); setStatus('Saved on this device.'); }
    } catch (failure) { report(failure); }
    finally { working.current = false; if (alive.current) setBusy(false); }
  }

  return <div className="dialog-backdrop layouts-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="layouts-dialog" role="dialog" aria-modal="true" aria-labelledby="reader-layouts-title" tabIndex={-1}>
      <header><div><span className="eyebrow">YOUR READING WORKSPACE</span><h2 id="reader-layouts-title">Saved reader layouts</h2></div>
        <button type="button" className="secondary" aria-label="Close saved layouts" onClick={onClose}>Close</button></header>
      <p className="muted">Keep up to {MAX_LAYOUTS} layouts on this device. Each saves appearance, publisher display, the study inspector and 2–4 comparison pane choices. Your current passage, notes and reading history stay in their own workspaces.</p>
      <p className="layouts-current">Current appearance: {settings.theme} · {settings.fontSize}px · {settings.lineHeight} spacing · {settings.source.layout} · {settings.panes.length} comparison panes</p>
      {error && <p className="layouts-error" role="alert">{error}</p>}
      <p role="status" aria-live="polite">{status}</p>
      {damaged ? <section className="layouts-recovery" aria-label="Damaged layout recovery"><h3>Recover saved layouts</h3><p>Download a copy before resetting. Existing data stays untouched until you choose Reset.</p>
        <div className="button-row"><button type="button" className="secondary" disabled={!damaged.backup || busy} onClick={() => {
          if (damaged.backup) downloadBlob(new Blob([damaged.backup], { type: 'application/json' }), 'Adigun-damaged-reader-layouts.json');
        }}>Download damaged layouts</button><button type="button" className="secondary danger" disabled={!damaged.backup || busy} onClick={() => void reset()}>Reset damaged layouts</button></div></section>
        : <form className="layouts-save" onSubmit={event => {
          event.preventDefault();
          void change(current => addReaderLayout(current, settings, crypto.randomUUID(), name, new Date().toISOString())).then(saved => { if (saved && alive.current) setName(''); });
        }}><label>Layout name<input data-layout-name value={name} maxLength={80} required disabled={!state || busy} onChange={event => setName(event.target.value)} placeholder="Evening reading"/></label>
          <button className="primary" type="submit" disabled={!state || busy || state.layouts.length >= MAX_LAYOUTS}>Save current layout</button></form>}
      {state && <div className="layouts-list">{state.layouts.length === 0 && <p>No reader layouts saved yet.</p>}{state.layouts.map(layout => <article key={layout.id} aria-label={`Layout ${layout.name}`}>
        <h3>{layout.name}</h3><p>{layout.settings.theme} · {layout.settings.fontSize}px · {layout.settings.lineHeight} spacing · {layout.settings.source.layout}<br/>{layout.settings.panes.length} comparison panes · {layout.settings.focus ? 'Focus mode' : 'Full workspace'}</p>
        {rename?.id === layout.id ? <form onSubmit={event => { event.preventDefault(); void change(current => renameReaderLayout(current, layout.id, rename.name, new Date().toISOString())); }}>
          <label>New layout name<input autoFocus maxLength={80} required value={rename.name} disabled={busy} onChange={event => setRename({ id: layout.id, name: event.target.value })}/></label>
          <div className="button-row"><button className="primary" disabled={busy}>Save layout name</button><button type="button" className="secondary" disabled={busy} onClick={() => setRename(null)}>Cancel rename</button></div>
        </form> : <div className="button-row">
          <button type="button" className="primary" disabled={busy} onClick={() => void apply(layout)}>Apply layout</button>
          <button type="button" className="secondary" disabled={busy} onClick={() => { setRename({ id: layout.id, name: layout.name }); setError(''); }}>Rename layout</button>
          <button type="button" className="secondary danger" disabled={busy} onClick={() => { if (confirm(`Delete saved layout “${layout.name}”?`)) void change(current => removeReaderLayout(current, layout.id)); }}>Delete layout</button>
        </div>}
      </article>)}</div>}
      {preview && <section className="layouts-import-preview" aria-label="Layout import preview"><h3>Replace saved layouts?</h3>
        <p>This backup contains {preview.layouts.length} layouts. Replacing the saved list does not apply a layout to the reader.</p>
        <ul>{preview.layouts.map(layout => <li key={layout.id}>{layout.name}</li>)}</ul>
        <div className="button-row"><button type="button" className="primary" disabled={busy} onClick={() => void change(() => preview)}>Replace saved layouts</button>
          <button type="button" className="secondary" disabled={busy} onClick={() => { setPreview(null); setStatus('Import cancelled.'); }}>Cancel import</button></div>
      </section>}
      <footer><div className="button-row"><button type="button" className="secondary" disabled={!state || busy} onClick={exportLayouts}>Export layouts</button>
        <button type="button" className="secondary" disabled={busy} onClick={() => void reload()}>Reload saved layouts</button></div>
        <label>Import layouts backup<input type="file" accept=".json,application/json" disabled={!state || busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void importFile(file); }}/></label>
        <p className="muted">Backups contain layout names and display choices. Keep a copy before clearing browser storage. Personal study backups are separate.</p>
      </footer>
    </section>
  </div>;
}

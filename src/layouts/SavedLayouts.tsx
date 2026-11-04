import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  MAX_LAYOUTS, MAX_LAYOUT_NAME, MAX_LAYOUT_BACKUP_BYTES, addLayout, layoutBackup,
  layoutDescription, mergeLayouts, parseLayoutBackup, removeLayout, renameLayout, validateLayoutSnapshot,
} from './model';
import type { SavedWorkspaceLayout, WorkspaceLayoutSnapshot, WorkspaceLayouts } from './model';
import { DamagedLayoutsError, LayoutCancelledError, loadLayouts, resetDamagedLayouts, saveLayouts } from './storage';
import './layouts.css';

type Props = { snapshot: WorkspaceLayoutSnapshot; onApply: (snapshot: WorkspaceLayoutSnapshot) => void };
type ImportPreview = ReturnType<typeof mergeLayouts> & { layouts: SavedWorkspaceLayout[]; revision: number };
const message = (error: unknown) => error instanceof Error ? error.message : 'The layout action could not be completed.';
function download(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function SavedLayouts({ snapshot, onApply }: Props) {
  const [state, setState] = useState<WorkspaceLayouts | null>(null);
  const [busy, setBusy] = useState(true), [reload, setReload] = useState(0);
  const [storageError, setStorageError] = useState(''), [actionError, setActionError] = useState(''), [notice, setNotice] = useState('');
  const [damaged, setDamaged] = useState<DamagedLayoutsError | null>(null), [confirmReset, setConfirmReset] = useState(false);
  const [name, setName] = useState(''), [renaming, setRenaming] = useState(''), [renameName, setRenameName] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null), [removed, setRemoved] = useState<SavedWorkspaceLayout | null>(null);
  const saved = useRef<WorkspaceLayouts | null>(null), blocked = useRef(true), locked = useRef(false);
  const lifetime = useRef<AbortController | null>(null), nameInput = useRef<HTMLInputElement>(null), renameInput = useRef<HTMLInputElement>(null);
  const previousRename = useRef('');
  const current = (controller: AbortController) => lifetime.current === controller && !controller.signal.aborted;

  function failed(error: unknown) {
    blocked.current = true;
    setStorageError(message(error));
    setDamaged(error instanceof DamagedLayoutsError ? error : null);
  }
  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller;
    blocked.current = true; locked.current = true; setBusy(true); setPreview(null); setConfirmReset(false);
    void loadLayouts().then(value => {
      if (!current(controller)) return;
      saved.current = value; setState(value); blocked.current = false; setStorageError(''); setDamaged(null);
    }).catch(error => { if (current(controller)) failed(error); }).finally(() => {
      if (current(controller)) { locked.current = false; setBusy(false); }
    });
    return () => { controller.abort(); if (lifetime.current === controller) lifetime.current = null; };
  }, [reload]);
  useEffect(() => {
    if (renaming) renameInput.current?.focus();
    else if (previousRename.current) (document.getElementById(`layout-rename-${previousRename.current}`) || nameInput.current)?.focus();
    previousRename.current = renaming;
  }, [renaming]);

  async function change(update: (state: WorkspaceLayouts) => WorkspaceLayouts, success: string): Promise<boolean> {
    const controller = lifetime.current, before = saved.current;
    if (!controller || !current(controller) || locked.current || blocked.current || !before) return false;
    locked.current = true; setBusy(true); setActionError(''); setNotice('');
    try {
      const next = update(before);
      let value: WorkspaceLayouts;
      try { value = await saveLayouts(next, before.revision, { signal: controller.signal, isCurrent: () => current(controller) }); }
      catch (error) { if (current(controller) && !(error instanceof LayoutCancelledError)) failed(error); throw error; }
      if (!current(controller)) return false;
      saved.current = value; setState(value); setNotice(success);
      return true;
    } catch (error) {
      if (current(controller) && !(error instanceof LayoutCancelledError)) setActionError(message(error));
      return false;
    } finally { if (current(controller)) { locked.current = false; setBusy(false); } }
  }

  async function saveNew(event: FormEvent) {
    event.preventDefault();
    // Capture what the user chose at submission; delayed writes cannot capture a later configuration.
    const settings = { ...snapshot };
    if (await change(value => addLayout(value, name, settings, crypto.randomUUID(), new Date().toISOString()), 'Layout saved on this device.')) setName('');
  }
  function apply(layout: SavedWorkspaceLayout) {
    setActionError(''); setNotice('');
    try { onApply(validateLayoutSnapshot(layout.snapshot)); setNotice(`Applied “${layout.name}”.`); }
    catch (error) { setActionError(message(error)); }
  }
  async function rename(event: FormEvent, layout: SavedWorkspaceLayout) {
    event.preventDefault();
    if (await change(value => renameLayout(value, layout.id, renameName, new Date().toISOString()), 'Layout renamed.')) {
      setRenaming('');
    }
  }
  async function remove(layout: SavedWorkspaceLayout) {
    if (await change(value => removeLayout(value, layout.id), 'Layout removed. You can undo this removal.')) {
      setRemoved(layout); if (renaming === layout.id) setRenaming(''); nameInput.current?.focus();
    }
  }
  async function undoRemoval() {
    if (!removed) return;
    if (await change(value => {
      const restored = mergeLayouts(value, [removed]);
      if (!restored.added) throw new Error('A layout with that name or identity is already saved. Existing layouts were kept.');
      return restored.state;
    }, 'Layout restored.')) setRemoved(null);
  }
  async function inspectImport(file: File) {
    const controller = lifetime.current, before = saved.current;
    if (!controller || !current(controller) || locked.current || blocked.current || !before) return;
    locked.current = true; setBusy(true); setPreview(null); setActionError(''); setNotice('');
    try {
      if (file.size > MAX_LAYOUT_BACKUP_BYTES) throw new Error('Layout backup exceeds 64 KB.');
      const raw = await file.text();
      if (!current(controller)) return;
      const layouts = parseLayoutBackup(raw), result = mergeLayouts(before, layouts);
      setPreview({ ...result, layouts, revision: before.revision });
    } catch (error) { if (current(controller)) setActionError(message(error)); }
    finally { if (current(controller)) { locked.current = false; setBusy(false); } }
  }
  async function importLayouts() {
    if (!preview) return;
    const checked = preview;
    if (await change(value => {
      if (value.revision !== checked.revision) throw new Error('Your saved layouts changed after this preview. Select the backup again to review it.');
      return mergeLayouts(value, checked.layouts).state;
    }, `Imported ${checked.added} layout${checked.added === 1 ? '' : 's'}; kept ${checked.skipped} existing match${checked.skipped === 1 ? '' : 'es'}.`)) setPreview(null);
  }
  async function reset() {
    const controller = lifetime.current;
    if (!controller || !current(controller) || locked.current || !damaged || !confirmReset) return;
    locked.current = true; setBusy(true); setActionError(''); setNotice('');
    try {
      const value = await resetDamagedLayouts(damaged.backup, { signal: controller.signal, isCurrent: () => current(controller) });
      if (!current(controller)) return;
      saved.current = value; setState(value); blocked.current = false; setStorageError(''); setDamaged(null); setConfirmReset(false);
      setNotice('Damaged layouts reset. Other study data was kept.');
    } catch (error) { if (current(controller) && !(error instanceof LayoutCancelledError)) setActionError(message(error)); }
    finally { if (current(controller)) { locked.current = false; setBusy(false); } }
  }
  const unavailable = busy || !state || !!storageError;

  return <section className="panel saved-layouts" aria-labelledby="saved-layouts-title" aria-busy={busy}>
    <header className="layout-heading"><div><h2 id="saved-layouts-title">Saved workspace layouts</h2><p>Keep named display settings on this device. Applying a layout preserves your passage, edition and interface language.</p></div><button className="secondary" disabled={busy} onClick={() => { setActionError(''); setNotice(''); setReload(value => value + 1); }}>Reload layouts</button></header>
    <p className="layout-current"><strong>Current display:</strong> {layoutDescription(snapshot)}</p>
    {storageError && <p className="error-message" role="alert">{storageError}</p>}
    {actionError && actionError !== storageError && <p className="error-message" role="alert">{actionError}</p>}
    <p className="layout-status" role="status" aria-live="polite">{busy ? 'Working with device layouts…' : notice}</p>
    {damaged && <div className="layout-recovery">
      <div className="button-row"><button className="secondary" disabled={busy || damaged.backup === null} onClick={() => { if (damaged.backup !== null) download(damaged.backup, 'adigun-damaged-layouts.json'); }}>Download damaged layouts</button><button className="secondary" disabled={busy || damaged.backup === null} onClick={() => setConfirmReset(true)}>Reset damaged layouts</button></div>
      {confirmReset && <div><p>Reset removes only the damaged layout record. Download it first if you want to keep a recovery copy.</p><div className="button-row"><button className="primary" disabled={busy} onClick={() => void reset()}>Confirm layout reset</button><button className="secondary" disabled={busy} onClick={() => setConfirmReset(false)}>Keep saved data</button></div></div>}
    </div>}
    <form className="layout-save-form" onSubmit={event => void saveNew(event)}>
      <label>New layout name<input ref={nameInput} value={name} onChange={event => setName(event.target.value)} maxLength={MAX_LAYOUT_NAME} disabled={unavailable} autoComplete="off"/></label>
      <button className="primary" type="submit" disabled={unavailable || !name.trim() || (state?.layouts.length ?? 0) >= MAX_LAYOUTS}>Save current layout</button>
    </form>
    {state && <p className="muted">{state.layouts.length} of {MAX_LAYOUTS} layouts saved. Layout backups contain display settings and names; personal study records are backed up separately.</p>}
    {state?.layouts.length === 0 && !storageError && <p>No layouts saved yet. Choose your display settings, then give the layout a name.</p>}
    {!!state?.layouts.length && <ul className="layout-list">{state.layouts.map(layout => <li key={layout.id}>
      <h3>{layout.name}</h3><p>{layoutDescription(layout.snapshot)}</p>
      {renaming === layout.id ? <form className="layout-rename-form" onSubmit={event => void rename(event, layout)}>
        <label>Rename layout<input ref={renameInput} value={renameName} onChange={event => setRenameName(event.target.value)} maxLength={MAX_LAYOUT_NAME} disabled={unavailable}/></label>
        <div className="button-row"><button className="primary" type="submit" disabled={unavailable || !renameName.trim()}>Save layout name</button><button className="secondary" type="button" disabled={busy} onClick={() => setRenaming('')}>Cancel rename</button></div>
      </form> : <div className="button-row">
        <button className="secondary" disabled={unavailable} aria-label={`Apply layout ${layout.name}`} onClick={() => apply(layout)}>Apply</button>
        <button className="secondary" id={`layout-rename-${layout.id}`} disabled={unavailable} aria-label={`Rename layout ${layout.name}`} onClick={() => { setRenaming(layout.id); setRenameName(layout.name); }}>Rename</button>
        <button className="secondary" disabled={unavailable} aria-label={`Remove layout ${layout.name}`} onClick={() => void remove(layout)}>Remove</button>
      </div>}
    </li>)}</ul>}
    {removed && <button className="secondary" disabled={unavailable} onClick={() => void undoRemoval()}>Undo removal of {removed.name}</button>}
    <details className="layout-backup"><summary>Layout backup and restore</summary>
      <p>Import adds new layouts. Existing matching identities or names are kept, including names that differ only in letter case. Imports never apply a layout automatically.</p>
      <div className="button-row"><button className="secondary" disabled={busy || !state} onClick={() => { if (state) download(layoutBackup(state), 'adigun-workspace-layouts.json'); }}>Export workspace layouts</button><label>Import workspace layouts<input type="file" accept=".json,application/json" disabled={unavailable} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void inspectImport(file); }}/></label></div>
      {preview && <section className="layout-import-preview" aria-labelledby="layout-import-title">
        <h3 id="layout-import-title">Review layout import</h3><p>{preview.added} new layout{preview.added === 1 ? '' : 's'} to add; {preview.skipped} existing match{preview.skipped === 1 ? '' : 'es'} kept.</p>
        <ul>{preview.layouts.map(layout => <li key={layout.id}><strong>{layout.name}</strong> · {preview.addedIds.includes(layout.id) ? 'Add' : 'Keep existing'}<p>{layoutDescription(layout.snapshot)}</p></li>)}</ul>
        <div className="button-row"><button className="primary" disabled={unavailable || preview.added === 0} onClick={() => void importLayouts()}>Merge workspace layouts</button><button className="secondary" disabled={busy} onClick={() => setPreview(null)}>Cancel layout import</button></div>
      </section>}
    </details>
  </section>;
}

import { useEffect, useRef, useState } from 'react';
import type { WorkspaceTab } from './model';
import { emptyWorkspace, mergeWorkspace, summarizeWorkspaceImport, workspaceNotebook, workspaceRecordings } from './model';
import type { WorkspaceSnapshot } from './retelling-inventory';
import { completeWorkspaceBackup, readCompleteWorkspaceBackup, selectedImportedMedia } from './retelling-backup';
import { readWorkspaceSnapshot } from './storage';
import { requestRetellingNavigation } from './retelling-guard';
import { useWorkspace } from './useWorkspace';
import { downloadPrivateFile } from './shared';
import type { WorkspaceProps } from './shared';
import PrayerTab from './PrayerTab';
import CollectionsTab from './CollectionsTab';
import MemoryTab from './MemoryTab';
import PlansTab from './PlansTab';
import ReflectionsTab from './ReflectionsTab';
import './workspace.css';

function downloadBlob(name:string, blob:Blob) {
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url),1000);
}
export default function PersonalWorkspace(props:WorkspaceProps) {
  const { state,busy:saving,error,status,canUndo,reload,commit,undoLast } = useWorkspace();
  const [tab,setTab] = useState<WorkspaceTab>(() => { const requested = new URLSearchParams(location.hash.split('?')[1]).get('tab'); return ['prayer','collections','memory','plans','reflections'].includes(requested || '') ? requested as WorkspaceTab : 'prayer'; });
  const [preview,setPreview] = useState<WorkspaceSnapshot | null>(null);
  const [transferError,setTransferError] = useState(''); const [transferStatus,setTransferStatus] = useState('');
  const [transferring,setTransferring] = useState(false);
  const [conflicts,setConflicts] = useState<'keep-device' | 'use-import'>('keep-device'); const [deleteOpen,setDeleteOpen] = useState(false);
  const sequence = useRef(0); const transferringNow = useRef(false);
  useEffect(() => () => { sequence.current++; },[]);
  const busy = saving || transferring;
  const importSummary = preview && state ? summarizeWorkspaceImport(state,preview.state) : null;
  async function readBackup(file?:File) {
    if (!file || !state || transferringNow.current) return;
    const run = ++sequence.current; transferringNow.current = true; setTransferring(true); setTransferError(''); setPreview(null); setTransferStatus('Verifying the complete private backup…');
    try { const parsed = await readCompleteWorkspaceBackup(file); if (run === sequence.current) { setPreview(parsed); setConflicts('keep-device'); setTransferStatus('Backup verified. Review the import preview before saving.'); } }
    catch (reason) { if (run === sequence.current) { setTransferError(reason instanceof Error ? reason.message : 'Could not read this backup.'); setTransferStatus('Existing device records were not changed.'); } }
    finally { if (run === sequence.current) { transferringNow.current = false; setTransferring(false); } }
  }
  async function exportBackup() {
    if (transferringNow.current || saving) return;
    const run = ++sequence.current; transferringNow.current = true; setTransferring(true); setTransferError(''); setTransferStatus('Checking saved writing and original recordings for export…');
    try {
      const snapshot = await readWorkspaceSnapshot(); const file = await completeWorkspaceBackup(snapshot);
      if (run === sequence.current) { downloadBlob('adigun-personal-workspace.json',file); setTransferStatus(`Complete backup exported from saved revision ${snapshot.state.revision}, including ${snapshot.media.length} original recording${snapshot.media.length === 1 ? '' : 's'}.`); }
    } catch (reason) { if (run === sequence.current) setTransferError(reason instanceof Error ? reason.message : 'Could not export this workspace.'); }
    finally { if (run === sequence.current) { transferringNow.current = false; setTransferring(false); } }
  }
  async function importBackup() {
    if (!preview || !state || busy || !requestRetellingNavigation()) return;
    setTransferError('');
    try {
      const selected = mergeWorkspace(state,preview.state,conflicts);
      const files = selectedImportedMedia(selected,preview.media);
      if (await commit(current => mergeWorkspace(current,preview.state,conflicts),files)) { setPreview(null); setTransferStatus('Selected records and their original recordings were imported together.'); }
    } catch (reason) { setTransferError(reason instanceof Error ? reason.message : 'The selected backup could not be imported.'); }
  }
  return <div className="page workspace-page">
    <header className="page-heading"><span className="eyebrow">Your private study</span><h1>Personal workspace</h1><p>Prayer, collections, reflection and learning belong to you. This workspace is stored in this browser on this device.</p></header>
    <div className="workspace-status"><p role="status" aria-live="polite">{status}</p><div className="button-row"><button type="button" disabled={busy} onClick={() => { if (requestRetellingNavigation()) void reload(); }}>Reload workspace</button><button type="button" disabled={busy || !canUndo} onClick={() => { if (requestRetellingNavigation()) void undoLast(); }}>Undo last change</button></div></div>
    {error && <p className="workspace-error" role="alert">{error}</p>}
    {state && <>
      <details className="workspace-card workspace-backup"><summary>Backup, restore and privacy</summary>
        <p>Complete workspace JSON includes your private writing and all saved original retelling recordings. Keep backups somewhere you trust. Save a current draft first; unsaved writing and recordings are not included. Passage references and source revision IDs are included rather than copied scripture.</p>
        <p className="workspace-help">Readable notebooks contain writing and manual transcripts, without audio bytes. Reader bookmarks and notes keep their separate backup in Saved study. Clearing browser data can remove this device copy.</p>
        <p className="workspace-help">{workspaceRecordings(state).length} saved retelling recordings · {(workspaceRecordings(state).reduce((sum,item) => sum + item.bytes,0) / 1024 / 1024).toFixed(2)} of 32 MiB audio used. Complete backups are limited to 64 MiB; legacy text-only backups remain importable.</p>
        <div className="button-row"><button type="button" disabled={busy} onClick={() => void exportBackup()}>Export workspace JSON</button><button type="button" disabled={busy} onClick={() => downloadPrivateFile('adigun-personal-workspace.md',workspaceNotebook(state),'text/markdown;charset=utf-8')}>Export readable notebook</button></div>
        <label>Preview workspace backup<input disabled={busy} type="file" accept="application/json,.json" onChange={e => { void readBackup(e.target.files?.[0]); e.target.value = ''; }} /></label>
        {transferStatus && <p role="status">{transferStatus}</p>}{transferError && <p role="alert" className="workspace-error">{transferError}</p>}
        {importSummary && preview && <section className="workspace-import" aria-label="Import preview"><h3>Import preview</h3><p>{importSummary.added} new records · {importSummary.identical} identical duplicates · {importSummary.conflicts} conflicting records. Import merges records and does not delete existing entries.</p><p>{preview.media.length} verified original recording{preview.media.length === 1 ? '' : 's'} in this backup. Only audio belonging to the selected records will be imported.</p>
          {importSummary.conflicts > 0 && <label>For conflicting record IDs<select disabled={busy} value={conflicts} onChange={e => setConflicts(e.target.value as typeof conflicts)}><option value="keep-device">Keep this device’s records</option><option value="use-import">Use records from the backup</option></select></label>}
          <div className="button-row"><button type="button" disabled={busy} onClick={() => void importBackup()}>Import previewed records</button><button type="button" disabled={busy} onClick={() => setPreview(null)}>Cancel import</button></div>
        </section>}
        <p>No account synchronization, selective sharing, background prayer notifications or cloud recovery is active for these records. Recordings are not uploaded or transcribed. Browser storage is not an encrypted vault.</p>
        <p className="workspace-help">Undo keeps the previous change, including deleted originals, in this tab until another successful change, reload or leaving the workspace. Deletion removes the originals from persistent device storage together with their records.</p>
        <button type="button" disabled={busy} onClick={() => setDeleteOpen(value => !value)}>Delete personal workspace records</button>
        {deleteOpen && <div className="workspace-import"><p>Delete all prayers, collections, memory cards, original retelling recordings, plans and reflections from this workspace? Reader notes, installed source packs and other apps are separate.</p><div className="button-row"><button type="button" disabled={busy} onClick={async () => { if (requestRetellingNavigation() && await commit(current => ({ ...emptyWorkspace(),revision:current.revision }))) { setDeleteOpen(false); setPreview(null); } }}>Confirm workspace deletion</button><button type="button" disabled={busy} onClick={() => setDeleteOpen(false)}>Keep records</button></div></div>}
      </details>
      <nav className="workspace-tabs" aria-label="Personal workspace sections">{([['prayer','Prayer journal'],['collections','Collections'],['memory','Memorization'],['plans','My plans'],['reflections','Reflections']] as [WorkspaceTab,string][]).map(([id,label]) => <button key={id} type="button" disabled={busy} aria-current={tab === id ? 'page' : undefined} onClick={() => { if (id === tab || requestRetellingNavigation()) setTab(id); }}>{label}</button>)}</nav>
      {tab === 'prayer' && <PrayerTab {...props} state={state} busy={busy} commit={commit} />}
      {tab === 'collections' && <CollectionsTab {...props} state={state} busy={busy} commit={commit} />}
      {tab === 'memory' && <MemoryTab {...props} state={state} busy={busy} commit={commit} />}
      {tab === 'plans' && <PlansTab {...props} state={state} busy={busy} commit={commit} />}
      {tab === 'reflections' && <ReflectionsTab {...props} state={state} busy={busy} commit={commit} />}
    </>}
  </div>;
}

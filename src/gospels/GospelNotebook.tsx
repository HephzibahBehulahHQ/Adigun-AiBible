import { useRef, useState } from 'react';
import { downloadBlob } from '../media';
import { gospelNames, resolvePaneReference, validateGospelSelection } from './model';
import type { GospelSelection } from './model';
import { gospelStudyBackup, MAX_GOSPEL_STUDIES, MAX_GOSPEL_STUDY_BACKUP_BYTES, mergeGospelStudies, moveGospelStudy, parseGospelStudyBackup, previewGospelStudyImport, validateGospelStudyRow } from './study-model';
import type { GospelStudyRow, GospelStudyState } from './study-model';
import { captureGospelStudyPassages, checkGospelStudySources, gospelStudyMarkdown } from './study-source';
import { gospelStudySources } from './study-source-runtime';
import { useGospelStudy, useGospelStudyGuard } from './useGospelStudy';

type Draft = { title: string; note: string };
const emptyDraft = (): Draft => ({ title: '', note: '' });
const reasonText = (reason: unknown) => reason instanceof Error ? reason.message : 'This Gospel study operation could not be completed.';
const snapshot = (draft: Draft, selection: GospelSelection | undefined) => JSON.stringify({ draft, selection });

export default function GospelNotebook({ selection, onOpenStudy, onBusyChange }: {
  selection?: GospelSelection; onOpenStudy: (row: GospelStudyRow | null) => void; onBusyChange: (busy: boolean) => void;
}) {
  const study = useGospelStudy();
  const [draft, setDraft] = useState<Draft>(emptyDraft), [active, setActive] = useState<GospelStudyRow | null>(null);
  const [baseline, setBaseline] = useState(''), [operation, setOperation] = useState('');
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [preview, setPreview] = useState<{ incoming: GospelStudyState; revision: number } | null>(null);
  const [conflict, setConflict] = useState<'keep-device' | 'use-backup'>('keep-device');
  const [removed, setRemoved] = useState<{ row: GospelStudyRow; index: number } | null>(null);
  const lock = useRef(false), importInput = useRef<HTMLInputElement>(null), titleInput = useRef<HTMLInputElement>(null);
  const dirty = active ? snapshot(draft, selection) !== baseline : !!(draft.title || draft.note);
  const blocked = study.busy || !!operation;
  useGospelStudyGuard(dirty, study.saving || !!operation);
  const index = study.state?.rows.findIndex(row => row.id === active?.id) ?? -1;
  function replace(row: GospelStudyRow | null) {
    const next = row ? { title: row.title, note: row.note } : emptyDraft();
    setActive(row); setDraft(next); setBaseline(row ? snapshot(next, row.selection) : '');
    setError(''); setNotice(''); setPreview(null); onOpenStudy(row);
  }
  function mayReplace() { return !lock.current && !blocked && (!dirty || window.confirm('Discard this unsaved Gospel study draft? Download the draft first if you need to keep it.')); }
  function open(row: GospelStudyRow | null) {
    if (!mayReplace()) return;
    replace(row); requestAnimationFrame(() => titleInput.current?.focus());
  }
  async function run(label: string, action: () => Promise<void>) {
    if (lock.current || study.busy) return;
    lock.current = true; onBusyChange(true); setOperation(label); setError(''); setNotice('');
    try { await action(); } catch (reason) { setError(reasonText(reason)); }
    finally { lock.current = false; onBusyChange(false); setOperation(''); }
  }
  async function prepare(): Promise<GospelStudyRow> {
    if (!selection) throw new Error('Choose valid Gospel panes before saving or exporting a source notebook.');
    if (!draft.title.trim()) throw new Error('Give this Gospel study a title.');
    const selected = validateGospelSelection(selection), text = { ...draft }, previous = active;
    const passages = await captureGospelStudyPassages(selected, gospelStudySources, previous?.passages || []);
    const now = new Date().toISOString();
    return validateGospelStudyRow({ id: previous?.id || `gospel-${crypto.randomUUID()}`, title: text.title.trim(), note: text.note,
      selection: selected, passages, createdAt: previous?.createdAt || now, updatedAt: now });
  }
  const save = () => run('Checking sources and saving this Gospel study…', async () => {
    const row = await prepare();
    const saved = await study.commit(state => {
      if (active && !state.rows.some(item => item.id === active.id)) throw new Error('This study was removed from saved storage. Start a new study to retain your draft separately.');
      return { ...state, rows: state.rows.some(item => item.id === row.id) ? state.rows.map(item => item.id === row.id ? row : item) : [...state.rows, row] };
    });
    if (saved) { replace(row); setRemoved(null); setNotice('Gospel study saved with its exact source revisions.'); }
  });
  function recoverDraft() {
    const lines = [draft.title || 'Untitled Gospel study', '', 'PRIVATE DRAFT · user writing · not a source-validated backup', '', draft.note, '', 'Selected Gospel panes'];
    if (selection) for (const pane of selection.panes) {
      const ref = resolvePaneReference(selection, pane);
      lines.push(`${gospelNames[ref.bookId]} ${ref.chapter}:${ref.verse}–${ref.endVerse} · ${ref.editionId} · ${pane.linked ? 'linked' : 'independent'}`);
    }
    lines.push('', 'Selection for recovery', JSON.stringify(selection || null, null, 2));
    if (active) lines.push('', 'Previously saved source references', JSON.stringify(active.passages, null, 2));
    try {
      downloadBlob(new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }), 'Adigun-Gospel-private-draft.txt');
      setNotice('Private draft downloaded as text. This does not save changes in the app.');
    } catch (reason) { setError(reasonText(reason)); }
  }
  const exportNotebook = () => run('Preparing the source-checked notebook…', async () => {
    const row = await prepare(), markdown = await gospelStudyMarkdown(row, gospelStudySources);
    downloadBlob(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }), 'Adigun-Gospel-study.md');
    setNotice('Private notebook downloaded with exact source wording, source notices and your notes.');
  });
  function exportBackup() {
    if (!study.state) return;
    try {
      downloadBlob(new Blob([gospelStudyBackup(study.state)], { type: 'application/json' }), 'Adigun-Gospel-studies.json');
      setNotice('Saved studies downloaded. Unsaved writing is excluded; use Download draft text to keep it.');
    } catch (reason) { setError(reasonText(reason)); }
  }
  async function readBackup(file?: File) {
    if (!file || !study.state) return;
    await run('Checking this backup and every saved source…', async () => {
      if (file.size > MAX_GOSPEL_STUDY_BACKUP_BYTES) throw new Error('Choose a Gospel study backup no larger than 2 MiB.');
      const incoming = await checkGospelStudySources(parseGospelStudyBackup(await file.text()), gospelStudySources);
      setPreview({ incoming, revision: study.state!.revision }); setConflict('keep-device');
    });
  }
  function remove() {
    if (!active || !mayReplace() || !window.confirm('Delete this saved Gospel study and its note? Source downloads stay on this device.')) return;
    const removedRow = active, removedIndex = index;
    void run('Deleting this saved Gospel study…', async () => {
      const saved = await study.commit(state => ({ ...state, rows: state.rows.filter(row => row.id !== removedRow.id) }));
      if (saved) { replace(null); setRemoved({ row: removedRow, index: removedIndex }); setNotice('Gospel study deleted. Undo is available until the next saved change.'); }
    });
  }
  const summary = preview && study.state ? previewGospelStudyImport(study.state, preview.incoming) : null;
  return <details className="panel gospel-notebook">
    <summary>Private Gospel studies{study.state ? ` · ${study.state.rows.length} saved` : ''}</summary>
    <div className="gospel-notebook-body">
      <h2>Save your comparison and notes</h2>
      <p>Keep the pane order, linked or independent ranges, editions and exact source revisions with your own writing. These are private reading selections, not reviewed Gospel parallels.</p>
      <p className="small muted">Saved on this device, without cloud sync or encryption. Browser storage can be removed; keep a backup. Other applications on this GitHub Pages domain share the same origin.</p>
      <p role="status">{operation || study.status}</p>{(error || study.error) && <p role="alert">{error || study.error}</p>}{notice && <p role="status">{notice}</p>}
      <div className="gospel-notebook-navigation">
        <label>Saved Gospel study<select aria-label="Saved Gospel study" value={active?.id && study.state?.rows.some(row => row.id === active.id) ? active.id : ''} disabled={blocked || !study.state} onChange={event => open(study.state?.rows.find(row => row.id === event.target.value) || null)}><option value="">New unsaved study</option>{study.state?.rows.map(row => <option key={row.id} value={row.id}>{row.title}</option>)}</select></label>
        <div className="button-row"><button className="secondary" disabled={blocked || index <= 0} onClick={() => open(study.state!.rows[index - 1])}>Previous saved study</button><button className="secondary" disabled={blocked || index < 0 || index >= (study.state?.rows.length || 0) - 1} onClick={() => open(study.state!.rows[index + 1])}>Next saved study</button><button className="secondary" disabled={blocked} onClick={() => open(null)}>New study from these panes</button></div>
      </div>
      <form onSubmit={event => { event.preventDefault(); void save(); }}>
        <fieldset disabled={!!operation || study.saving} className="gospel-notebook-form"><legend className="visually-hidden">Private Gospel study writing</legend>
          <label>Study title<input ref={titleInput} aria-label="Study title" maxLength={160} value={draft.title} onChange={event => setDraft(value => ({ ...value, title: event.target.value }))}/></label>
          <label>Private Gospel notes<textarea aria-label="Private Gospel notes" rows={5} maxLength={12000} value={draft.note} onChange={event => setDraft(value => ({ ...value, note: event.target.value }))}/></label>
          <p className="small">{dirty ? 'Unsaved changes. Save or download your draft before leaving.' : active ? 'This study matches its saved selection and writing.' : 'Name this selection to save a private study.'}</p>
          <div className="button-row"><button className="primary" type="submit" disabled={blocked || !study.state || !selection || (!active && study.state.rows.length >= MAX_GOSPEL_STUDIES)}>{active ? 'Save study changes' : 'Save Gospel study'}</button><button className="secondary" type="button" disabled={blocked || !selection} onClick={() => void exportNotebook()}>Export study notebook</button></div>
        </fieldset>
      </form>
      <div className="button-row"><button className="secondary" onClick={recoverDraft}>Download draft text</button><button className="secondary" disabled={blocked} onClick={() => void study.reload()}>Reload saved studies</button><button className="text-button" disabled={blocked || !active} onClick={() => { if (mayReplace()) replace(study.state?.rows.find(row => row.id === active?.id) || null); }}>Discard unsaved changes</button></div>
      {active && <div className="button-row"><button className="secondary" disabled={blocked || dirty || index <= 0} onClick={() => void run('Reordering saved studies…', async () => { if (await study.commit(state => moveGospelStudy(state, active.id, -1))) { setRemoved(null); setPreview(null); setNotice('Saved study moved earlier.'); } })}>Move study earlier</button><button className="secondary" disabled={blocked || dirty || index < 0 || index >= (study.state?.rows.length || 0) - 1} onClick={() => void run('Reordering saved studies…', async () => { if (await study.commit(state => moveGospelStudy(state, active.id, 1))) { setRemoved(null); setPreview(null); setNotice('Saved study moved later.'); } })}>Move study later</button><button className="text-button danger" disabled={blocked} onClick={remove}>Delete saved study</button></div>}
      {removed && <button className="secondary" disabled={blocked} onClick={() => void run('Restoring the deleted study…', async () => {
        if (await study.commit(state => {
          if (state.rows.some(row => row.id === removed.row.id)) throw new Error('This study identifier already exists. No saved study was overwritten.');
          const rows = [...state.rows]; rows.splice(Math.max(0, Math.min(removed.index, rows.length)), 0, removed.row); return { ...state, rows };
        })) { setRemoved(null); setPreview(null); setNotice('Deleted Gospel study restored. Your current draft is unchanged.'); }
      })}>Undo deleted study</button>}
      <section className="gospel-notebook-backup" aria-labelledby="gospel-backup-title"><h3 id="gospel-backup-title">Private backup and restore</h3><p>JSON backups contain saved writing, selections and source references, without copied Scripture. Restore checks exact sources and previews conflicts before saving.</p>
        <div className="button-row"><button className="secondary" disabled={blocked || !study.state} onClick={exportBackup}>Export Gospel backup</button><button className="secondary" disabled={blocked || !study.state} onClick={() => importInput.current?.click()}>Import Gospel backup</button></div>
        <input ref={importInput} className="visually-hidden" type="file" accept="application/json,.json" aria-label="Gospel backup file" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void readBackup(file); }}/>
        {preview && summary && <section className="gospel-import" aria-labelledby="gospel-import-title"><h4 id="gospel-import-title">Review Gospel backup</h4><p>{summary.added} new studies · {summary.identical} identical · {summary.conflicts} conflicts. New studies are appended in backup order; unrelated saved studies stay in place.</p>
          <label>When study IDs conflict<select aria-label="When study IDs conflict" disabled={blocked} value={conflict} onChange={event => setConflict(event.target.value as typeof conflict)}><option value="keep-device">Keep this device’s studies</option><option value="use-backup">Use the backup’s conflicting studies</option></select></label>
          <div className="button-row"><button className="primary" disabled={blocked} onClick={() => {
            if (!mayReplace()) return;
            void run('Rechecking sources and restoring Gospel studies…', async () => {
              const incoming = await checkGospelStudySources(preview.incoming, gospelStudySources);
              const saved = await study.commit(state => {
                if (state.revision !== preview.revision) throw new Error('Saved studies changed after this preview. Choose the backup again before merging.');
                return mergeGospelStudies(state, incoming, conflict);
              });
              if (saved) { replace(null); setRemoved(null); setNotice('Gospel backup merged and saved. Choose a saved study to open its panes.'); }
            });
          }}>Merge Gospel backup</button><button className="secondary" disabled={blocked} onClick={() => setPreview(null)}>Cancel Gospel import</button></div>
        </section>}
      </section>
    </div>
  </details>;
}

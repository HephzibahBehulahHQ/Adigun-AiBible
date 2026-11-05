import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Download, Plus, Save } from 'lucide-react';
import { getEditionCatalog } from '../data';
import { downloadBlob } from '../media';
import { passageLabel } from '../reading-session/model';
import type { SavedPassage } from '../reading-session/model';
import { sourceDirection, sourceFont } from '../source-typography';
import type { Edition, Locale, Reference } from '../types';
import { emptyGospel, gospelBackup, GOSPEL_BOOKS, MAX_GOSPEL_BACKUP_BYTES, MAX_GOSPEL_ROWS, mergeGospel, moveGospelRow, parseGospelBackup, previewGospelImport, requestedSowerRanges, validateGospelRow } from './model';
import type { GospelRow, GospelState } from './model';
import { checkGospelImportSources, gospelRowMarkdown, resolveGospelSource } from './source-core';
import type { GospelSource } from './source-core';
import { gospelSources } from './source';
import GospelDownloads from './GospelDownloads';
import { useGospelGuard, useGospelStudy } from './useGospelStudy';
import './gospel.css';

interface Draft { id?: string; title: string; note: string; references: Reference[]; pins: (SavedPassage | undefined)[]; createdAt?: string }
const names = { MAT: 'Matthew', MRK: 'Mark', LUK: 'Luke', JHN: 'John' };
const starter = (): Draft => ({ title: 'Sower reading ranges', note: '', references: structuredClone(requestedSowerRanges), pins: [] });
const fromRow = (row: GospelRow): Draft => ({ id: row.id, title: row.title, note: row.note, references: row.passages.map(p => p.reference), pins: row.passages, createdAt: row.createdAt });
const message = (error: unknown) => error instanceof Error ? error.message : 'This operation could not be completed.';
const rangeName = (r: Reference) => `${names[r.bookId as keyof typeof names] || r.bookId} ${r.chapter}:${r.verse}${r.endVerse !== r.verse ? `–${r.endVerse}` : ''}`;
type Outcome = { source: GospelSource } | { error: string };

export default function GospelWorkspace({ reference, locale, onOpenReference }: { reference: Reference; locale: Locale; onOpenReference: (reference: Reference) => void }) {
  const study = useGospelStudy();
  const [draft, setDraft] = useState<Draft>(starter), [baseline, setBaseline] = useState(() => JSON.stringify(starter()));
  const [editions, setEditions] = useState<Edition[]>([]), [catalogError, setCatalogError] = useState(''), [catalogRetry, setCatalogRetry] = useState(0);
  const [result, setResult] = useState<{ key: string; outcomes: Outcome[] }>(), [retry, setRetry] = useState(0);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [operation, setOperation] = useState(''), [downloading, setDownloading] = useState(false);
  const [preview, setPreview] = useState<GospelState | null>(null), [conflict, setConflict] = useState<'keep-device' | 'use-backup'>('keep-device');
  const lock = useRef(false), bootstrapped = useRef(false), touched = useRef(false), importInput = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(draft) !== baseline;
  const blocked = study.busy || !!operation || downloading;
  useGospelGuard(dirty, study.saving || !!operation || downloading);
  const sourceKey = JSON.stringify({ references: draft.references, pins: draft.pins });
  const sourcesReady = result?.key === sourceKey && result.outcomes.length === draft.references.length && result.outcomes.every(item => 'source' in item);
  const resolvedPassages = useMemo(() => result?.key === sourceKey && result.outcomes.every(item => 'source' in item)
    ? result.outcomes.map(item => (item as { source: GospelSource }).source.passage) : [], [result, sourceKey]);
  const index = study.state?.rows.findIndex(row => row.id === draft.id) ?? -1;

  useEffect(() => {
    let active = true;
    getEditionCatalog().then(catalog => { if (active) { setEditions(catalog.editions.filter(edition => edition.corpus === 'bible')); setCatalogError(''); } }).catch(reason => { if (active) setCatalogError(message(reason)); });
    return () => { active = false; };
  }, [catalogRetry]);
  useEffect(() => {
    let active = true;
    const selection: { references: Reference[]; pins: (SavedPassage | undefined)[] } = JSON.parse(sourceKey);
    Promise.all(selection.references.map((ref, i) => resolveGospelSource(ref, gospelSources, selection.pins[i]).then(source => ({ source })).catch(reason => ({ error: message(reason) })))).then(outcomes => {
      if (active) setResult({ key: sourceKey, outcomes });
    });
    return () => { active = false; };
  }, [sourceKey, retry]);
  useEffect(() => {
    if (!study.state || bootstrapped.current) return;
    bootstrapped.current = true;
    if (!touched.current && study.state.rows.length) {
      const next = fromRow(study.state.rows[0]); setDraft(next); setBaseline(JSON.stringify(next));
    }
  }, [study.state]);

  function change(next: Draft) { touched.current = true; setDraft(next); setError(''); setNotice(''); }
  function mayReplace() { return !lock.current && !blocked && (!dirty || window.confirm('Discard this unsaved Gospel draft and open another row?')); }
  function replace(next: Draft) { touched.current = true; setDraft(next); setBaseline(JSON.stringify(next)); setError(''); setNotice(''); setPreview(null); }
  function chooseRow(id: string) { const row = study.state?.rows.find(item => item.id === id); if (row && mayReplace()) replace(fromRow(row)); }
  function changeReference(i: number, patch: Partial<Reference>) {
    change({ ...draft, references: draft.references.map((ref, j) => j === i ? { ...ref, ...patch } : ref), pins: draft.references.map((_, j) => j === i ? undefined : draft.pins[j]) });
  }
  async function run(name: string, action: () => Promise<void>) {
    if (lock.current || downloading || study.busy) return;
    lock.current = true; setOperation(name); setError(''); setNotice('');
    try { await action(); } catch (reason) { setError(message(reason)); }
    finally { lock.current = false; setOperation(''); }
  }
  async function prepareDraft(): Promise<GospelRow> {
    if (!draft.title.trim()) throw new Error('Give this comparison row a title before saving or exporting.');
    const sources = await Promise.all(draft.references.map((ref, i) => resolveGospelSource(ref, gospelSources, draft.pins[i])));
    const now = new Date().toISOString();
    return validateGospelRow({ id: draft.id || `gospel-${crypto.randomUUID()}`, title: draft.title.trim(), note: draft.note, passages: sources.map(source => source.passage), createdAt: draft.createdAt || now, updatedAt: now });
  }
  const save = () => run('Saving this comparison row…', async () => {
    const row = await prepareDraft();
    if (await study.commit(state => ({ ...state, rows: state.rows.some(item => item.id === row.id) ? state.rows.map(item => item.id === row.id ? row : item) : [...state.rows, row] }))) {
      replace(fromRow(row)); setNotice('Comparison row saved with its exact source revisions.');
    }
  });
  const exportDraft = () => run('Preparing draft backup…', async () => {
    // A recovery backup never requires source access: include the unmodified draft as plain text.
    const text = [draft.title || 'Untitled Gospel draft', '', 'PRIVATE UNSAVED DRAFT · not an importable source-validated backup', '', ...draft.references.map((ref, i) => `${rangeName(ref)} · ${ref.editionId}${draft.pins[i] ? ` · source ${draft.pins[i]!.sourceSha256}` : ' · source not yet pinned'}`), '', draft.note].join('\n');
    downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), 'Adigun-Gospel-private-draft.txt');
    setNotice('Private draft downloaded as text. It remains unsaved in this workspace.');
  });
  const exportRow = () => run('Preparing source-checked notebook…', async () => {
    const row = await prepareDraft(), text = await gospelRowMarkdown(row, gospelSources);
    downloadBlob(new Blob([text], { type: 'text/markdown;charset=utf-8' }), 'Adigun-Gospel-private-row.md');
    setNotice('Private notebook downloaded with exact source wording, attribution and your notes.');
  });
  async function readBackup(file?: File) {
    if (!file || !mayReplace()) return;
    await run('Checking every source in this backup…', async () => {
      if (file.size > MAX_GOSPEL_BACKUP_BYTES) throw new Error('Choose a Gospel backup smaller than 2 MB.');
      const incoming = await checkGospelImportSources(parseGospelBackup(await file.text()), gospelSources);
      setPreview(incoming); setConflict('keep-device');
    });
  }
  async function removeRow() {
    if (!draft.id || !study.state || !mayReplace() || !window.confirm('Delete this saved comparison row and its private note? Keep an exported backup if you need it. Source downloads are preserved.')) return;
    await run('Deleting comparison row…', async () => {
      const nextRows = study.state!.rows.filter(row => row.id !== draft.id);
      if (await study.commit(state => ({ ...state, rows: state.rows.filter(row => row.id !== draft.id) }))) replace(nextRows.length ? fromRow(nextRows[Math.min(index, nextRows.length - 1)]) : starter());
    });
  }
  const summary = preview && study.state ? previewGospelImport(study.state, preview) : null;

  return <div className="page tool-page gospel-workspace" lang="en">
    <div className="page-heading"><span className="eyebrow">READ EACH ACCOUNT IN CONTEXT</span><h1>Gospel comparison</h1><p>Arrange two to four Gospel passages in one row. Move through saved rows together, while each account keeps its own wording, numbering and edition.</p></div>
    {locale !== 'en' && <p className="availability-note">English interface fallback: these study controls await native-language review. Scripture retains its own language and edition.</p>}
    <p className="availability-note gospel-review">Your arrangement · not independently reviewed. Placing passages together does not establish equivalent events, chronology or doctrine. Missing selections or source verses do not mean “no parallel.”</p>
    <section className="panel gospel-row-navigation" aria-labelledby="gospel-rows-title">
      <h2 id="gospel-rows-title">Your comparison rows</h2><p className="small muted">{study.state?.rows.length ?? 0} of {MAX_GOSPEL_ROWS} rows saved locally. Previous and next move every passage panel together.</p>
      <div className="button-row"><button className="secondary" disabled={blocked || index <= 0} onClick={() => chooseRow(study.state!.rows[index - 1].id)}><ArrowLeft size={16} aria-hidden="true"/>Previous row</button>
        <label className="gospel-row-picker">Saved comparison row<select disabled={blocked || !study.state?.rows.length} value={index >= 0 ? draft.id : ''} onChange={event => chooseRow(event.target.value)}><option value="" disabled>Choose a saved row</option>{study.state?.rows.map((row, i) => <option key={row.id} value={row.id}>{i + 1}. {row.title}</option>)}</select></label>
        <button className="secondary" disabled={blocked || index < 0 || index >= (study.state?.rows.length ?? 0) - 1} onClick={() => chooseRow(study.state!.rows[index + 1].id)}>Next row<ArrowRight size={16} aria-hidden="true"/></button></div>
      <div className="button-row"><button className="secondary" disabled={blocked} onClick={() => { if (!mayReplace()) return; const bookId = GOSPEL_BOOKS.includes(reference.bookId as typeof GOSPEL_BOOKS[number]) ? reference.bookId : 'MAT'; const second = GOSPEL_BOOKS.find(id => id !== bookId)!; replace({ title: '', note: '', references: [{ ...(bookId === reference.bookId ? reference : { bookId, chapter: 1, verse: 1 }), endVerse: bookId === reference.bookId ? reference.endVerse ?? reference.verse : 1, editionId: reference.editionId || 'eng-web' }, { bookId: second, chapter: 1, verse: 1, endVerse: 1, editionId: reference.editionId || 'eng-web' }], pins: [] }); }}><Plus size={16} aria-hidden="true"/>New comparison row</button>
        <button className="text-button" disabled={blocked} onClick={() => { if (mayReplace()) replace(starter()); }}>Open requested Sower ranges</button>
        <button className="text-button" disabled={blocked || dirty || index <= 0} onClick={() => void run('Moving comparison row…', async () => { await study.commit(state => moveGospelRow(state, draft.id!, -1)); })}>Move row earlier</button>
        <button className="text-button" disabled={blocked || dirty || index < 0 || index >= (study.state?.rows.length ?? 0) - 1} onClick={() => void run('Moving comparison row…', async () => { await study.commit(state => moveGospelRow(state, draft.id!, 1)); })}>Move row later</button></div>
      <p role="status">{study.status}</p>{study.error && <p role="alert">{study.error}</p>}<button className="text-button" disabled={blocked} onClick={() => { if (mayReplace()) { replace(starter()); bootstrapped.current = false; touched.current = false; void study.reload(); } }}>Reload saved rows</button>
    </section>
    <section className="panel gospel-editor" aria-labelledby="gospel-edit-title">
      <h2 id="gospel-edit-title">{draft.id ? 'Edit this comparison row' : 'Prepare a comparison row'}</h2>
      {!draft.id && draft.title === 'Sower reading ranges' && <p className="small muted">Reading ranges requested in the project brief: Matthew 13:1–23, Mark 4:1–20 and Luke 8:4–15. No editorial alignment or interpretation is supplied.</p>}
      <label>Comparison row title<input value={draft.title} maxLength={160} disabled={blocked} onChange={event => change({ ...draft, title: event.target.value })}/></label>
      {catalogError && <p role="alert">{catalogError} <button className="text-button" onClick={() => setCatalogRetry(value => value + 1)}>Retry edition list</button></p>}
      <div className="gospel-selectors">{draft.references.map((ref, i) => <fieldset key={i} disabled={blocked}><legend>Passage {i + 1}</legend>
        <label>Gospel<select aria-label={`Passage ${i + 1} Gospel`} value={ref.bookId} onChange={event => changeReference(i, { bookId: event.target.value, chapter: 1, verse: 1, endVerse: 1 })}>{GOSPEL_BOOKS.map(id => <option key={id} value={id} disabled={id !== ref.bookId && draft.references.some(item => item.bookId === id)}>{names[id]}</option>)}</select></label>
        <label>Edition<select aria-label={`Passage ${i + 1} edition`} value={ref.editionId} onChange={event => changeReference(i, { editionId: event.target.value })}>{!editions.some(edition => edition.id === ref.editionId) && <option value={ref.editionId}>{ref.editionId} · source edition</option>}{editions.map(edition => <option key={edition.id} value={edition.id}>{edition.nativeTitle || edition.name} · {edition.language}</option>)}</select></label>
        <div className="gospel-range"><label>Chapter<input aria-label={`Passage ${i + 1} chapter`} type="number" min={1} max={28} value={ref.chapter} onChange={event => changeReference(i, { chapter: Number(event.target.value) })}/></label><label>First verse<input aria-label={`Passage ${i + 1} first verse`} type="number" min={1} max={200} value={ref.verse} onChange={event => changeReference(i, { verse: Number(event.target.value) })}/></label><label>Last verse<input aria-label={`Passage ${i + 1} last verse`} type="number" min={1} max={200} value={ref.endVerse} onChange={event => changeReference(i, { endVerse: Number(event.target.value) })}/></label></div>
        <button className="text-button" disabled={draft.references.length <= 2} onClick={() => change({ ...draft, references: draft.references.filter((_, j) => j !== i), pins: draft.pins.filter((_, j) => j !== i) })}>Remove passage {i + 1}</button>
      </fieldset>)}</div>
      <button className="secondary" disabled={blocked || draft.references.length >= 4} onClick={() => { const bookId = GOSPEL_BOOKS.find(id => !draft.references.some(ref => ref.bookId === id)); if (bookId) change({ ...draft, references: [...draft.references, { bookId, chapter: 1, verse: 1, endVerse: 1, editionId: reference.editionId || 'eng-web' }], pins: [...draft.references.map((_, i) => draft.pins[i]), undefined] }); }}><Plus size={16} aria-hidden="true"/>Add Gospel passage</button>
      <label>Private comparison notes<textarea rows={4} value={draft.note} maxLength={12000} disabled={blocked} onChange={event => change({ ...draft, note: event.target.value })}/></label>
      <p className="small muted">Notes and row titles are your own writing. Sources are saved by edition and SHA-256; changing a selection deliberately checks and pins that new source. Use additional rows for passages spanning chapters.</p>
      <div className="button-row"><button className="primary" disabled={blocked || !study.state || !sourcesReady || !draft.title.trim()} onClick={() => void save()}><Save size={16} aria-hidden="true"/>Save comparison row</button><button className="secondary" disabled={blocked} onClick={() => void exportDraft()}>Export unsaved draft text</button><button className="secondary" disabled={blocked || !sourcesReady || !draft.title.trim()} onClick={() => void exportRow()}><Download size={16} aria-hidden="true"/>Export private row notebook</button>{draft.id && <button className="text-button danger" disabled={blocked} onClick={() => void removeRow()}>Delete comparison row</button>}</div>
      <p className="small" role="status">{dirty ? 'Unsaved draft. Save this row or export the draft before leaving.' : draft.id ? 'This row matches its saved device record.' : 'These reading selections are not yet saved to your private rows.'}</p>
    </section>
    {(error || notice || operation) && <div className="gospel-feedback">{error && <p role="alert">{error}</p>}{(notice || operation) && <p role="status">{operation || notice}</p>}</div>}
    <section aria-labelledby="gospel-reading-title"><div className="section-title"><h2 id="gospel-reading-title">{draft.title || 'Selected Gospel passages'}</h2><button className="text-button" disabled={blocked} onClick={() => { setResult(undefined); setRetry(value => value + 1); }}>Reload selected sources</button></div>
      <div className="gospel-passages" style={{ '--gospel-columns': draft.references.length } as React.CSSProperties}>{draft.references.map((ref, i) => {
        const outcome = result?.key === sourceKey ? result.outcomes[i] : undefined;
        const source = outcome && 'source' in outcome ? outcome.source : undefined;
        return <article className="panel gospel-passage" key={`${sourceKey}:${i}`} aria-label={`Gospel passage ${i + 1}`}><header><span className="source-label">UNCHANGED SOURCE TEXT</span><h3>{source ? passageLabel(source.passage) : rangeName(ref)}</h3><p className="small">{source?.edition.name || draft.pins[i]?.editionName || ref.editionId}</p></header>
          {!outcome ? <p role="status">Opening this exact source range…</p> : 'error' in outcome ? <p role="alert">{outcome.error} No alternative wording has been substituted.</p> : <>
            <div className="gospel-source-text" lang={source!.edition.language} dir={source!.edition.direction || sourceDirection(source!.edition.language)} style={{ fontFamily: sourceFont(source!.edition.language) }}>{source!.verses.map(verse => <p key={verse.number} data-verse={verse.number}><sup>{ref.chapter}:{verse.number}</sup>{' '}{verse.text}</p>)}</div>
            <details><summary>Surrounding chapter context</summary><div lang={source!.edition.language} dir={source!.edition.direction || sourceDirection(source!.edition.language)} style={{ fontFamily: sourceFont(source!.edition.language) }}>{source!.context.map(verse => <p key={verse.number}><sup>{ref.chapter}:{verse.number}</sup>{' '}{verse.text || 'Publisher supplies no text at this position.'}</p>)}</div></details>
            <details><summary>Edition and source revision</summary><p className="gospel-credit">{source!.attribution}</p><p className="small gospel-sha">SHA-256: {source!.passage.sourceSha256}</p><a href={source!.edition.sourceUrl} target="_blank" rel="noreferrer">Publisher source</a>{' · '}<a href={source!.edition.licenseUrl} target="_blank" rel="noreferrer">Rights notice</a></details>
            <button className="text-button" disabled={blocked} onClick={() => onOpenReference(source!.passage.reference)}><BookOpen size={16} aria-hidden="true"/>Open passage {i + 1} in reader</button>
          </>}
        </article>;
      })}</div>
    </section>
    {sourcesReady && <GospelDownloads key={sourceKey} passages={resolvedPassages} onBusyChange={setDownloading}/>}
    <section className="panel gospel-backup" aria-labelledby="gospel-backup-title"><h2 id="gospel-backup-title">Private backup and restore</h2><p>Backups contain saved row order, notes, references and source revisions. They contain no copied Scripture. Restoring checks every source and previews conflicts before saving.</p><p className="small muted">Device storage can be removed by the browser. These records are not encrypted or cloud-synced. Other applications on this GitHub Pages origin share the same origin; keep your own backup.</p>
      <div className="button-row"><button className="secondary" disabled={blocked || !study.state} onClick={() => { try { downloadBlob(new Blob([gospelBackup(study.state!)], { type: 'application/json' }), 'Adigun-Gospel-workspace.json'); setNotice('Saved Gospel rows downloaded. Unsaved edits are excluded; use Export unsaved draft text to keep them.'); } catch (reason) { setError(message(reason)); } }}>Export Gospel backup</button><button className="secondary" disabled={blocked || !study.state} onClick={() => importInput.current?.click()}>Import Gospel backup</button><button className="text-button danger" disabled={blocked || !study.state?.rows.length} onClick={() => { if (!mayReplace() || !window.confirm('Delete all saved Gospel rows and their private notes on this device? An exported backup is needed to restore them. Other study tools and source downloads are unaffected.')) return; void run('Deleting saved Gospel rows…', async () => { if (await study.commit(state => ({ ...emptyGospel(), revision: state.revision }))) replace(starter()); }); }}>Delete all Gospel rows</button></div>
      <input ref={importInput} type="file" accept="application/json,.json" className="visually-hidden" aria-label="Gospel backup file" onChange={event => { void readBackup(event.target.files?.[0]); event.target.value = ''; }}/>
      {preview && summary && <section className="gospel-import" aria-labelledby="gospel-import-title"><h3 id="gospel-import-title">Review Gospel backup</h3><p>{summary.added} new rows · {summary.identical} identical · {summary.conflicts} conflicts. Existing unrelated rows remain in place; new rows are appended in backup order.</p><label>When row IDs conflict<select value={conflict} disabled={blocked} onChange={event => setConflict(event.target.value as typeof conflict)}><option value="keep-device">Keep this device’s rows</option><option value="use-backup">Use the backup’s conflicting rows</option></select></label><div className="button-row"><button className="primary" disabled={blocked} onClick={() => void run('Restoring Gospel rows…', async () => { await checkGospelImportSources(preview, gospelSources); if (await study.commit(state => mergeGospel(state, preview, conflict))) { replace(starter()); setNotice('Gospel backup merged and saved. Choose a saved row above.'); } })}>Merge Gospel backup</button><button className="secondary" disabled={blocked} onClick={() => setPreview(null)}>Cancel Gospel import</button></div></section>}
    </section>
  </div>;
}

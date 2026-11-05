import { useEffect, useRef, useState } from 'react';
import { assetUrl, getBook, getManifest, getQuran } from '../data';
import { stableStringify } from '../editorial';
import { requirePermission } from '../permissions';
import type { Edition, Locale, Reference } from '../types';
import { downloadPrivateFile } from '../workspace/shared';
import CoverageExplorer from './CoverageExplorer';
import { MAX_PACKAGE_BYTES, mergeDraftImport, newEditorialDraft, parseWorkbenchPackage, previewDraftImport, pruneHistory, reviewPackage, reviseDraft, workbenchBackup, writingDiff } from './model';
import type { DraftWriting, EditorialDraft, WorkbenchState } from './model';
import { bibleSnapshot, quranSnapshot, sourceLabel, sourceReference, verifyDraftSources, verifyWorkbenchSources } from './source-core';
import { useWorkbench, useWorkbenchGuard } from './useWorkbench';
import './editorial-workbench.css';

async function getNotice(edition: Edition): Promise<string> {
  const path = edition.noticePath;
  if (!path || !/^[A-Za-z0-9][A-Za-z0-9._-]*\/NOTICE\.txt$/.test(path) || !path.startsWith(`${edition.id}/`)) throw new Error('The edition notice path is unavailable or invalid.');
  const response = await fetch(assetUrl(`data/editions/${path}`));
  if (!response.ok || response.headers.get('content-type')?.includes('text/html')) throw new Error('The complete publisher notice is not downloaded. Reconnect before preparing this source.');
  const text = await response.text();
  if (text.length > 30000) throw new Error('The publisher notice exceeds the supported draft package size.');
  return text;
}
const sourceAccess = { getBook, getManifest, getQuran, requirePermission, getNotice };
export default function EditorialWorkbench({ reference, locale, onOpenReference }: { reference: Reference; locale: Locale; onOpenReference: (ref: Reference) => void }) {
  const workspace = useWorkbench(), [tab, setTab] = useState<'coverage' | 'drafts' | 'acquisition'>('coverage');
  const [draft, setDraft] = useState<EditorialDraft | null>(null), [baseline, setBaseline] = useState<EditorialDraft | null>(null), [correction, setCorrection] = useState('');
  const [kind, setKind] = useState<EditorialDraft['kind']>('paraphrase'), [surah, setSurah] = useState(1), [first, setFirst] = useState(1), [last, setLast] = useState(1);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [verified, setVerified] = useState(false);
  const [incoming, setIncoming] = useState<WorkbenchState | null>(null), [filter, setFilter] = useState('');
  const locked = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const dirty = !!draft && (!workspace.state?.drafts.some(row => row.id === draft.id) || stableStringify(draft.writing) !== stableStringify(baseline?.writing) || draft.privateNotes !== baseline?.privateNotes);
  useWorkbenchGuard(dirty, busy || workspace.busy);
  const sourceKey = draft ? stableStringify(draft.sources) : '';
  useEffect(() => {
    let active = true; setVerified(false);
    if (draft) void verifyDraftSources(draft, sourceAccess).then(() => { if (active) setVerified(true); }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Source verification failed.'); });
    return () => { active = false; };
    // Verification depends on immutable sources and draft kind, not author keystrokes.
  }, [sourceKey, draft?.kind]);
  async function run(action: () => Promise<void>) {
    if (locked.current || workspace.busy) return; locked.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : 'The requested workbench operation failed.'); }
    finally { locked.current = false; if (alive.current) setBusy(false); }
  }
  function leaveDraft() { return !dirty || window.confirm('Discard the unsaved author draft? Save or download your private writing first.'); }
  function choose(value: EditorialDraft) { if (!leaveDraft()) return; setBaseline(value); setDraft(value); setCorrection(''); setError(''); setNotice(''); }
  function patch(patch: Partial<DraftWriting>) { setDraft(current => current ? { ...current, writing: { ...current.writing, ...patch } } : current); }
  async function create() {
    if (!leaveDraft()) return;
    await run(async () => {
      const sources = [await bibleSnapshot(reference, sourceAccess, kind === 'paraphrase' ? 'studyParaphrase' : 'display')];
      if (kind === 'comparison') sources.push(await quranSnapshot(surah, first, last, sourceAccess));
      const created = newEditorialDraft(kind, sources, locale); setBaseline(created); setDraft(created); setCorrection(''); setNotice('Draft opened. Save it to keep it on this device.');
    });
  }
  function materialize(reason = correction): EditorialDraft {
    if (!baseline || !draft) throw new Error('Open an author draft first.');
    return reviseDraft(baseline, draft.writing, draft.privateNotes, reason);
  }
  async function save() {
    await run(async () => {
      const next = materialize(correction || (!workspace.state?.drafts.some(row => row.id === draft?.id) ? 'Initial author draft' : ''));
      await verifyDraftSources(next, sourceAccess);
      if (await workspace.commit(state => ({ ...state, drafts: [...state.drafts.filter(row => row.id !== next.id), next] }))) { setBaseline(next); setDraft(next); setCorrection(''); setNotice('Editorial draft saved privately. Human review remains pending.'); }
    });
  }
  async function exportReview() { await run(async () => { const value = materialize(correction || 'Working copy prepared for human review'); await verifyDraftSources(value, sourceAccess, true); downloadPrivateFile(`editorial-review-${value.id}.json`, reviewPackage(value), 'application/json'); setNotice('Draft review package downloaded. Private author notes are excluded. No approval or publication was performed.'); }); }
  async function preview(file: File | undefined) {
    setIncoming(null); if (!file) return;
    await run(async () => { if (file.size > MAX_PACKAGE_BYTES) throw new Error('Choose a draft package smaller than 12 MB.'); const value = parseWorkbenchPackage(await file.text()); await verifyWorkbenchSources(value, sourceAccess); setIncoming(value); setNotice('Package structure, references, exact text, checksums and current source permissions validated. Review the import counts before saving.'); });
  }
  const previewCounts = workspace.state && incoming ? previewDraftImport(workspace.state, incoming) : null;
  const changes = draft ? writingDiff(draft.original, draft.writing) : [];
  return <div className="page tool-page editorial-workbench">
    <div className="page-heading"><span className="eyebrow">SOURCE INVENTORY · PRIVATE EDITORIAL PREPARATION</span><h1>Coverage and editorial workbench</h1><p>Inspect real source coverage and prepare source-linked drafts for human review.</p></div>
    {locale !== 'en' && <p className="availability-note">Workbench controls currently use English. The writing language is recorded separately; no translation or native-language review is implied.</p>}
    <div className="button-row" aria-label="Editorial workbench sections">{([['coverage','Coverage explorer'],['drafts','Private author drafts'],['acquisition','Acquisition research']] as const).map(([value, label]) => <button key={value} className={tab === value ? 'primary' : 'secondary'} aria-pressed={tab === value} onClick={() => setTab(value)}>{label}</button>)}</div>
    <p className="availability-note">These are preparation tools. Authenticated reviewer access is not configured here. Human approval and publication remain controlled by the existing verified reviewer registry and publication checks.</p>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {tab !== 'drafts' ? <CoverageExplorer acquisitionOnly={tab === 'acquisition'} onOpenReference={onOpenReference}/> : <fieldset className="editorial-fields" disabled={busy || workspace.busy}>
      <p role="status">{workspace.status}</p>{workspace.error && <div role="alert"><p>{workspace.error}</p><button className="secondary" disabled={busy || workspace.busy} onClick={() => { if (leaveDraft()) { setDraft(null); setBaseline(null); void workspace.reload(); } }}>Reload saved drafts</button></div>}
      <section className="panel"><h2>Start from installed sources</h2><p>Selected Bible passage: {reference.bookId} {reference.chapter}:{reference.verse}{reference.endVerse && reference.endVerse !== reference.verse ? `–${reference.endVerse}` : ''} · {reference.editionId || 'eng-web'}.</p>
        <div className="editorial-controls"><label>Draft type<select value={kind} onChange={event => setKind(event.target.value as EditorialDraft['kind'])}><option value="paraphrase">Bible study paraphrase</option><option value="comparison">Bible–Quran comparison proposal</option></select></label>{kind === 'comparison' && <><label>Quran surah<input type="number" min="1" max="114" value={surah} onChange={event => setSurah(Number(event.target.value))}/></label><label>First ayah<input type="number" min="1" max="286" value={first} onChange={event => setFirst(Number(event.target.value))}/></label><label>Last ayah<input type="number" min={first} max="286" value={last} onChange={event => setLast(Number(event.target.value))}/></label></>}</div>
        {kind === 'comparison' && <p className="muted">Choose the exact Quran evidence to inspect. The app does not infer a match or assign a relationship. Quran wording stays unchanged and is not offered as a paraphrase source.</p>}
        <button className="primary" disabled={busy || workspace.busy || !workspace.state} onClick={() => void create()}>Create source-linked draft</button>
      </section>
      <div className="editorial-layout"><aside className="panel"><h2>Saved author drafts</h2><label>Find saved drafts<input value={filter} onChange={event => setFilter(event.target.value)}/></label>{workspace.state?.drafts.length === 0 && <p>No author drafts saved yet.</p>}<div className="editorial-draft-list">{workspace.state?.drafts.filter(row => `${row.writing.title} ${row.kind} ${row.writing.locale}`.toLowerCase().includes(filter.toLowerCase())).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(row => <button className="secondary" aria-pressed={draft?.id === row.id} key={row.id} disabled={busy || workspace.busy} onClick={() => choose(row)}>{row.writing.title}<small>{row.kind} · {row.writing.locale} · unreviewed</small></button>)}</div></aside>
        {draft ? <section className="panel editorial-editor" aria-label="Author draft editor"><h2>{draft.kind === 'comparison' ? 'Comparison proposal' : 'Study paraphrase draft'}</h2><p><strong>Unreviewed author draft.</strong> This is your study writing, not source Scripture or an approved interpretation.</p>
          <label>Editorial draft title<input maxLength={200} value={draft.writing.title} onChange={event => patch({ title: event.target.value })}/></label>
          <div className="editorial-controls"><label>Writing language<select value={draft.writing.locale} onChange={event => patch({ locale: event.target.value as Locale })}><option value="en">English</option><option value="de">German</option><option value="yo">Yorùbá</option><option value="pcm">Nigerian Pidgin</option></select></label><label>Authoring origin<select value={draft.writing.origin} onChange={event => patch({ origin: event.target.value as DraftWriting['origin'] })}><option value="human_authored">Written by me</option><option value="ai_assisted">AI assisted writing</option></select></label><label>Study register<select value={draft.writing.register} onChange={event => patch({ register: event.target.value as DraftWriting['register'] })}><option value="plain">Plain study language</option><option value="genz">Gen Z study register</option><option value="pidgin_study">Pidgin study register</option></select></label></div>
          {draft.kind === 'comparison' && <><label>Claim or proposition<input maxLength={2000} value={draft.writing.proposition} onChange={event => patch({ proposition: event.target.value })}/></label><label>Author-proposed relationship<select value={draft.writing.proposedRelationship} onChange={event => patch({ proposedRelationship: event.target.value as DraftWriting['proposedRelationship'] })}><option value="">Not assigned</option><option value="shared_claim">Proposed shared claim</option><option value="differing_claim">Proposed differing claim</option><option value="mixed">Proposed mixed relationship</option><option value="thematic">Proposed thematic connection</option></select></label><p className="muted">This proposal has no review status. A human reviewer must assess the cited passages, scope and tradition before any public relationship can be assigned.</p></>}
          <label>{draft.kind === 'comparison' ? 'Draft explanation' : 'Draft paraphrase'}<textarea rows={7} maxLength={30000} value={draft.writing.text} onChange={event => patch({ text: event.target.value })}/></label>
          <label>Evidence, interpretive limits and review questions<textarea rows={4} maxLength={10000} value={draft.writing.evidenceNotes} onChange={event => patch({ evidenceNotes: event.target.value })}/></label>
          <label>Private author notes<textarea rows={4} maxLength={30000} value={draft.privateNotes} onChange={event => setDraft(current => current ? { ...current, privateNotes: event.target.value } : current)}/></label><p className="muted">Private notes stay in device storage and private backups. They are excluded from draft review packages.</p>
          <label>Reason for this correction<input maxLength={1000} value={correction} onChange={event => setCorrection(event.target.value)} placeholder="Required for changes to a saved draft"/></label>
          <div className="button-row"><button className="primary" disabled={busy || workspace.busy || !verified} onClick={() => void save()}>Save editorial draft</button><button className="secondary" disabled={busy || workspace.busy} onClick={() => { const text = `${draft.writing.title}\nUNREVIEWED AUTHOR DRAFT\n\n${draft.writing.text}\n\nEvidence notes\n${draft.writing.evidenceNotes}\n\nPRIVATE AUTHOR NOTES\n${draft.privateNotes}\n\nSource references (quotation text excluded)\n${draft.sources.map(sourceLabel).join('\n')}`; downloadPrivateFile(`private-editorial-writing-${draft.id}.txt`, text, 'text/plain'); }}>Download private writing</button></div>
          <details open><summary>Immutable source evidence</summary>{!verified ? <p>Verifying current source identity and permissions. Quotations remain hidden until verification succeeds.</p> : draft.sources.map(source => <article className="editorial-source" key={`${source.editionId}:${source.workId}:${source.chapter}:${source.start}`}><h3>{sourceLabel(source)}</h3><div lang={source.corpus === 'quran' ? 'en' : undefined}>{source.units.map(unit => <p key={unit.number}><sup>{unit.number}</sup> {unit.text}</p>)}</div><p className="source-credit">{source.attribution}</p><details><summary>Checksums, reference identity and full notice</summary><p>{source.referenceSystemId}</p><ul>{source.conditions.map((condition, index) => <li key={index}>{condition}</li>)}</ul>{source.notice && <pre className="editorial-notice">{source.notice}</pre>}<p className="editorial-checksum">Edition revision: {source.editionSha256}</p>{source.units.map(unit => <p className="editorial-checksum" key={unit.number}>Unit {unit.number}: {unit.sha256}</p>)}</details><a href={source.sourceUrl} target="_blank" rel="noreferrer">Publisher source</a> · <a href={source.licenseUrl} target="_blank" rel="noreferrer">License evidence</a>{source.corpus === 'bible' && <button className="secondary" onClick={() => onOpenReference(sourceReference(source))}>Open full Bible context</button>}</article>)}</details>
          <details><summary>Original and edited writing ({changes.length} changed fields)</summary><p>Original author writing is retained independently from immutable source quotations. All changes are drafts.</p>{changes.length ? changes.map(change => <div className="editorial-diff" key={change.field}><h3>{change.field}</h3><div><h4>Original draft</h4><pre>{change.before || '(empty)'}</pre></div><div><h4>Current draft</h4><pre>{change.after || '(empty)'}</pre></div></div>) : <p>No changes from the original draft.</p>}</details>
          <details><summary>Local correction history ({draft.history.length}/40)</summary>{draft.historyPrunedAt && <p>Earlier correction history was deliberately cleared on {draft.historyPrunedAt}. Original writing is retained.</p>}{draft.history.length === 0 && <p>No saved corrections retained.</p>}{draft.history.map((entry, index) => <article key={`${entry.at}:${index}`}><h3>{entry.reason}</h3><p>{entry.at}</p>{writingDiff(entry.before, entry.after).map(change => <div key={change.field}><strong>{change.field}</strong><p>Before: {change.before || '(empty)'}</p><p>After: {change.after || '(empty)'}</p></div>)}</article>)}<button className="secondary" disabled={busy || workspace.busy || dirty || !draft.history.length} onClick={() => { if (window.confirm('Clear saved correction history for this draft? Download a private backup first. Original writing and current writing will be retained.')) void run(async () => { const next = pruneHistory(draft); if (await workspace.commit(state => ({ ...state, drafts: state.drafts.map(row => row.id === next.id ? next : row) }))) { setBaseline(next); setDraft(next); setNotice('Older correction history cleared on this device.'); } }); }}>Clear older correction history</button></details>
          <details><summary>Prepare for human review</summary><p>The downloadable JSON contains the current unreviewed draft, exact source evidence and public correction history. Private author notes are excluded. It is a handoff package for an editor; it cannot be directly published or imported as an approval.</p><button className="secondary" disabled={busy || workspace.busy || !verified} onClick={() => void exportReview()}>Download draft review package</button></details>
          <button className="secondary" disabled={busy || workspace.busy} onClick={() => { if (window.confirm('Delete this draft, private notes and correction history from this device? Previously downloaded files are separate.')) void run(async () => { if (await workspace.commit(state => ({ ...state, drafts: state.drafts.filter(row => row.id !== draft.id) }))) { setDraft(null); setBaseline(null); setNotice('Author draft deleted from this device.'); } }); }}>Delete editorial draft</button>
        </section> : <section className="panel"><h2>Private preparation</h2><p>Select a saved draft or create one from the current Bible passage. Comparison drafts also require an exact installed Quran passage. Every draft retains its original source revision.</p></section>}
      </div>
      <section className="panel"><h2>Backup, restore and retention</h2><p>Drafts are stored in this browser only, without account sync or automatic deletion. Anyone with access to this browser profile can read them. Clearing browser data can remove them. Up to 80 drafts and 40 corrections per draft are retained; older history is cleared only on your instruction.</p><p>Private backups contain saved source quotations, writing and private author notes. Save unsaved changes first. Downloaded files remain outside app deletion controls.</p>
        <div className="button-row"><button className="secondary" disabled={busy || workspace.busy || !workspace.state || dirty} onClick={() => void run(async () => { if (!workspace.state) return; await verifyWorkbenchSources(workspace.state, sourceAccess, true); downloadPrivateFile('editorial-private-backup.json', workbenchBackup(workspace.state), 'application/json'); setNotice('Saved private editorial backup downloaded. Keep it somewhere private.'); })}>Download private editorial backup</button></div>
        <label>Preview editorial package<input type="file" accept="application/json,.json" disabled={busy || workspace.busy || !workspace.state} onChange={event => { void preview(event.target.files?.[0]); event.currentTarget.value = ''; }}/></label>
        {incoming && previewCounts && <div className="availability-note"><p>Validated preview: {previewCounts.added} new drafts, {previewCounts.identical} identical records, {previewCounts.conflicts} conflicting records. Conflicts import as new copies; saved drafts are preserved.</p><button className="primary" disabled={busy || workspace.busy || dirty} onClick={() => void run(async () => { await verifyWorkbenchSources(incoming, sourceAccess); if (await workspace.commit(state => mergeDraftImport(state, incoming))) { setIncoming(null); setNotice('Validated editorial drafts imported. Existing drafts were retained.'); } })}>Import validated copies</button><button className="secondary" onClick={() => setIncoming(null)}>Cancel import</button></div>}
        <button className="secondary" disabled={busy || workspace.busy || !workspace.state?.drafts.length} onClick={() => { if (window.confirm('Delete all editorial drafts, private notes and correction history from this device? This cannot delete previously downloaded files.')) void run(async () => { if (await workspace.commit(state => ({ ...state, drafts: [] }))) { setDraft(null); setBaseline(null); setIncoming(null); setNotice('All saved editorial drafts deleted from this device.'); } }); }}>Delete all editorial drafts</button>
      </section>
    </fieldset>}
  </div>;
}

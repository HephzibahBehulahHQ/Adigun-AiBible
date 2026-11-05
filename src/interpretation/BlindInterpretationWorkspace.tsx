import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { getBook, getManifest, sourceCredit } from '../data';
import type { Edition, Locale, Reference } from '../types';
import { downloadPrivateFile } from '../workspace/shared';
import { blindChallenge } from './challenges';
import { challengePassage, MAX_HISTORY, MAX_NOTEBOOK_BYTES, MAX_REASONING, MAX_REFLECTIONS, newBlindReflection, parseInterpretationBackup, reflectionExport, revealReflection, reviseReflection, validateReflectionSource } from './model';
import type { BlindReflection, InterpretationNotebook } from './model';
import SourcePassage from './SourcePassage';
import { useInterpretationGuard, useInterpretationNotebook } from './useInterpretationNotebook';
import './interpretation.css';

type Passage = ReturnType<typeof challengePassage>;
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const failure = (reason: unknown) => reason instanceof Error ? reason.message : 'The operation could not be completed. Your draft is retained.';
const preference = (reflection: BlindReflection, choice: string) => choice === 'undecided' ? 'Undecided / more evidence needed' : `Reading ${reflection.order.indexOf(choice) + 1}`;

export default function BlindInterpretationWorkspace({ reference, locale = 'en', onOpenReference }: { reference: Reference; locale?: Locale; onOpenReference: (reference: Reference) => void }) {
  const notebook = useInterpretationNotebook();
  const [draft, setDraft] = useState<BlindReflection | null>(null), [baseline, setBaseline] = useState<BlindReflection | null>(null);
  const [result, setResult] = useState<{ key: string; passage?: Passage; error?: string }>();
  const [attempt, setAttempt] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [incoming, setIncoming] = useState<InterpretationNotebook | null>(null), [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const lock = useRef(false), mounted = useRef(true), editor = useRef<HTMLHeadingElement>(null), revealHeading = useRef<HTMLHeadingElement>(null);
  const targetEdition = draft?.editionId || reference.editionId || 'eng-web';
  const key = `${targetEdition}:${blindChallenge.id}:${blindChallenge.version}`;
  const passage = result?.key === key ? result.passage : undefined;
  const loadError = result?.key === key ? result.error : undefined;
  const dirty = !!draft && !same(draft, baseline);
  const pending = busy || notebook.busy;
  useInterpretationGuard(dirty, pending);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    Promise.all([getBook(blindChallenge.passage.bookId, targetEdition), getManifest(targetEdition)]).then(([book, manifest]) => {
      const loaded = challengePassage(book, manifest.edition, blindChallenge);
      if (active) setResult({ key, passage: loaded });
    }).catch(reason => { if (active) setResult({ key, error: failure(reason) }); });
    return () => { active = false; };
  }, [targetEdition, key, attempt]);
  useEffect(() => { if (draft?.id) editor.current?.focus(); }, [draft?.id]);
  useEffect(() => { if (draft?.revealedAt) revealHeading.current?.focus(); }, [draft?.revealedAt]);
  let mismatch = '';
  if (draft && passage) { try { validateReflectionSource(draft, blindChallenge, passage.edition); } catch (reason) { mismatch = failure(reason); } }
  const sourceReady = !!passage && !passage.missing.length && !mismatch;
  const currentResearch = !!draft && draft.challengeId === blindChallenge.id && draft.challengeVersion === blindChallenge.version;
  const revealed = !!draft?.revealedAt;
  function leaveDraft() { return !dirty || window.confirm('Discard the unsaved reflection? Save or download your private writing first.'); }
  function clearEditor() { setDraft(null); setBaseline(null); setExpanded({}); }
  async function run(operation: () => Promise<void>) {
    if (lock.current || notebook.busy) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try { await operation(); } catch (reason) { if (mounted.current) setError(failure(reason)); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  function start() {
    if (pending || !sourceReady || !passage || !notebook.state || !leaveDraft()) return;
    try {
      if (notebook.state.reflections.length >= MAX_REFLECTIONS) throw new Error('This notebook is full. Export a backup and delete an older reflection before starting another.');
      const created = newBlindReflection(blindChallenge, passage.edition);
      setDraft(created); setBaseline(null); setExpanded({}); setError(''); setNotice('Private reflection started. Source order is shuffled and retained with this reflection.');
    } catch (reason) { setError(failure(reason)); }
  }
  function choose(reflection: BlindReflection) {
    if (pending || !leaveDraft()) return;
    setDraft(structuredClone(reflection)); setBaseline(structuredClone(reflection)); setExpanded({}); setError(''); setNotice('Saved reflection opened with its original source order and Bible edition.');
  }
  function edit(field: 'before' | 'after' | 'initialPreference' | 'finalPreference', value: string) {
    setDraft(current => current ? { ...current, [field]: value } : current);
  }
  async function save(reveal = false) {
    if (!draft || !passage || !sourceReady) return;
    await run(async () => {
      const now = new Date().toISOString();
      const writing = reveal ? revealReflection(draft, now) : draft;
      validateReflectionSource(writing, blindChallenge, passage.edition);
      let saved: BlindReflection | undefined;
      const committed = await notebook.commit(state => {
        const previous = state.reflections.find(item => item.id === writing.id);
        if ((baseline && !same(previous, baseline)) || (!baseline && previous)) throw new Error('This saved reflection changed after you opened it. Download your draft, reload saved records, and reopen the current reflection.');
        saved = reviseReflection(previous, writing, now);
        return { ...state, reflections: [...state.reflections.filter(item => item.id !== saved!.id), saved] };
      });
      if (committed && saved && mounted.current) {
        setDraft(saved); setBaseline(saved);
        setNotice(reveal ? 'Reasoning saved before reveal. Authors and associated traditions are now visible; there is no score.' : 'Reflection saved privately on this device.');
      }
    });
  }
  async function remove(id: string) {
    if (pending || !window.confirm('Delete this private reflection and its revision history from this device? Downloaded copies are unaffected.')) return;
    await run(async () => {
      if (await notebook.commit(state => ({ ...state, reflections: state.reflections.filter(item => item.id !== id) }))) {
        if (draft?.id === id) clearEditor();
        setNotice('Private reflection deleted from this device.');
      }
    });
  }
  async function preview(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; setIncoming(null);
    if (!file) return;
    await run(async () => {
      if (file.size > MAX_NOTEBOOK_BYTES) throw new Error('Choose an interpretation backup smaller than 4 MB.');
      const parsed = parseInterpretationBackup(await file.text());
      const editions = new Map<string, Edition>();
      for (const reflection of parsed.reflections) {
        if (!editions.has(reflection.editionId)) editions.set(reflection.editionId, (await getManifest(reflection.editionId)).edition);
        validateReflectionSource(reflection, blindChallenge, editions.get(reflection.editionId)!);
      }
      setIncoming(parsed); setNotice('Backup structure, challenge version and Bible source revisions verified. Review the replacement before restoring.');
    });
  }
  async function restore() {
    if (!incoming || dirty || pending || !window.confirm(`Replace only the private blind interpretation notebook with these ${incoming.reflections.length} saved reflections? Other notebooks are unaffected. An existing reveal cannot be rewound.`)) return;
    await run(async () => {
      if (await notebook.commit(state => ({ ...incoming, revision: state.revision }))) { clearEditor(); setIncoming(null); setNotice('Private interpretation notebook restored.'); }
    });
  }
  function privateText() {
    if (!draft) return;
    downloadPrivateFile(`interpretation-${draft.id}.txt`, `${dirty ? 'UNSAVED WORKING COPY\n\n' : ''}${reflectionExport(draft, blindChallenge)}`, 'text/plain;charset=utf-8');
  }
  return <section className="page tool-page bi-page" aria-labelledby="blind-interpretation-title">
    <header className="page-heading"><span className="eyebrow">READ · REASON · REVEAL · REVISIT</span><h1 id="blind-interpretation-title">Blind interpretation workspace</h1><p>Evaluate two historical readings before seeing their authors and associated traditions. Record your reasons, then return to the passage after the reveal.</p></header>
    <p className="availability-note">AI-assisted research preview · human editorial and tradition review pending. This is an optional reflection exercise, with no right-answer score or denomination score.</p>
    {locale !== 'en' && <p className="availability-note">Exercise controls and research summaries currently use English. Scripture retains the selected source language. No reviewed translation of this exercise is claimed.</p>}
    <p>Two readings cannot represent all Christian traditions or the diversity within them. Source labels are withheld until you deliberately reveal them. This does not make the interpretations anonymous outside this exercise.</p>
    <section className="panel bi-scripture" aria-labelledby="bi-passage-heading"><h2 id="bi-passage-heading">1. Read the passage in context</h2><h3>{blindChallenge.title}</h3><p>{blindChallenge.question}</p>
      {loadError ? <div><p role="alert">{loadError} No alternative edition is substituted.</p><button className="secondary" disabled={pending} onClick={() => setAttempt(value => value + 1)}>Retry challenge source</button></div> : !passage ? <p role="status">Opening the exact selected Bible edition…</p> : <>
        <p className="source-label">{passage.edition.name} · exact source wording</p>
        {passage.missing.length > 0 && <p role="alert">This edition lacks verse number(s) {passage.missing.join(', ')} required by the exercise. Available wording is shown unchanged; a new reflection and source reveal are unavailable.</p>}
        <div lang={passage.edition.language}>{passage.verses.map(verse => <p key={verse.number}><sup>5:{verse.number}</sup> {verse.text}</p>)}</div>
        <details><summary>Surrounding context · Matthew 5:{blindChallenge.contextStart}–{blindChallenge.contextEnd}</summary><div lang={passage.edition.language}>{passage.context.map(verse => <p key={verse.number}><sup>5:{verse.number}</sup> {verse.text}</p>)}</div><p className="muted small">Source numbering is retained, including any gaps in this edition.</p></details>
        <details><summary>Selected Scripture source and attribution</summary><p className="bi-credit">{sourceCredit(passage.edition)}</p><p className="bi-hash">Edition SHA-256: {passage.edition.sha256}</p><a href={passage.edition.sourceUrl} target="_blank" rel="noreferrer">Open Bible publisher source</a></details>
      </>}
      <button className="text-button" disabled={pending} onClick={() => onOpenReference({ ...blindChallenge.passage, editionId: targetEdition })}>Open the whole chapter in the reader</button>
    </section>
    <div className="bi-workspace-actions"><button className="primary" disabled={pending || !sourceReady || !notebook.state} onClick={start}>Start a new private reflection</button>{draft && <button className="secondary" disabled={pending} onClick={() => { if (leaveDraft()) { clearEditor(); setNotice('Reflection closed. Saved records remain in your notebook.'); } }}>Close reflection</button>}</div>
    <p role="status">{notebook.status}</p>{notebook.error && <p role="alert">{notebook.error}</p>}{error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {draft && <section className="bi-reflection" aria-labelledby="bi-editor-heading"><h2 id="bi-editor-heading" tabIndex={-1} ref={editor}>2. Your private reflection</h2><p className="muted small">{draft.editionId} · {draft.challengeVersion} · {revealed ? 'Sources revealed' : 'Source identities withheld'} · {dirty ? 'Unsaved changes' : 'Saved'}</p>
      {(mismatch || !currentResearch) && <p role="alert">{mismatch || 'The original challenge revision is not installed. Saved reasoning is retained without attaching different research.'} You can download the private writing or delete the record.</p>}
      {currentResearch && !mismatch && <div className="bi-readings">{draft.order.map((sourceId, index) => {
        const source = blindChallenge.sources.find(item => item.id === sourceId);
        if (!source) return null;
        return <article className="panel bi-reading" key={sourceId} aria-labelledby={`bi-reading-${index}`}><h3 id={`bi-reading-${index}`}>Reading {index + 1}</h3><p className="eyebrow">AI-ASSISTED SUMMARY · UNREVIEWED</p><p>{source.summary}</p><blockquote><p>{source.quote}</p></blockquote><p className="muted small">Brief historical source quotation. {revealed ? 'Attribution appears below.' : 'Author, work and tradition appear only after your deliberate reveal.'}</p>
          <details><summary>Questions to test this reading</summary><ul>{source.limits.map(limit => <li key={limit}>{limit}</li>)}</ul><p className="muted small">These are research questions, not an assessment of your answer.</p></details>
          <details onToggle={event => { const open = event.currentTarget.open; setExpanded(current => ({ ...current, [sourceId]: open })); }}><summary>Supporting passages and the writer’s argument</summary>{expanded[sourceId] && source.supporting.map((support, supportIndex) => <section key={`${sourceId}-${supportIndex}`} className="bi-support"><h4>{support.label}</h4><p>{support.reason}</p><SourcePassage reference={support.reference} editionId={draft.editionId} onOpenReference={onOpenReference}/></section>)}</details>
          {revealed && <section className="bi-attribution" aria-label={`Source for Reading ${index + 1}`}><h4>{source.author}</h4><p>{source.tradition}</p><p><cite>{source.title}</cite> · {source.locator}</p><p className="muted small">{source.edition}</p><a href={source.url} target="_blank" rel="noreferrer">Read this writer’s full source</a><details><summary>Excerpt, rights and author-context evidence</summary><p>{source.rights}</p><p className="bi-hash">Short quotation SHA-256: {source.sourceSha256}</p><ul>{source.rightsSources.map(link => <li key={link.url}><a href={link.url} target="_blank" rel="noreferrer">{link.label}</a></li>)}</ul></details></section>}
        </article>;
      })}</div>}
      <fieldset className="panel bi-writing" disabled={pending || !sourceReady || !currentResearch}><legend>Reasoning before source reveal</legend><label htmlFor="bi-before">Before-reveal reasoning</label><textarea id="bi-before" rows={5} maxLength={MAX_REASONING} value={draft.before} readOnly={revealed} aria-describedby="bi-before-help" onChange={event => edit('before', event.target.value)}/><p id="bi-before-help" className="muted small">{revealed ? 'This original reasoning is preserved. Add later thoughts below.' : 'What supports or challenges each reading? Being undecided is welcome. Write a reason before revealing sources.'}</p>
        <label htmlFor="bi-initial-choice">Initial reading preference</label><select id="bi-initial-choice" value={draft.initialPreference} disabled={pending || revealed || !sourceReady || !currentResearch} onChange={event => edit('initialPreference', event.target.value)}><option value="undecided">Undecided / more evidence needed</option>{draft.order.map((sourceId, index) => <option value={sourceId} key={sourceId}>Reading {index + 1}</option>)}</select>
      </fieldset>
      {!revealed && <div className="bi-workspace-actions"><button className="primary" disabled={pending || !sourceReady || !currentResearch || !draft.before.trim() || !notebook.state} onClick={() => void save(true)}>Save reasoning and reveal sources</button><p className="muted small">Your reasoning must save successfully before identities appear. It remains unchanged after reveal.</p></div>}
      {revealed && <section aria-labelledby="bi-reveal-heading"><h2 id="bi-reveal-heading" ref={revealHeading} tabIndex={-1}>3. Revisit after the reveal</h2><p className="availability-note">{blindChallenge.diversityNotice}</p><p>Did the author’s identity affect your judgment? Return to the passage and distinguish textual evidence from familiarity with a tradition.</p><fieldset className="panel bi-writing" disabled={pending || !sourceReady || !currentResearch}><legend>Later reflection</legend><label htmlFor="bi-after">After-reveal reasoning</label><textarea id="bi-after" rows={5} maxLength={MAX_REASONING} value={draft.after} onChange={event => edit('after', event.target.value)}/><label htmlFor="bi-final-choice">Current reading preference</label><select id="bi-final-choice" value={draft.finalPreference} onChange={event => edit('finalPreference', event.target.value)}><option value="undecided">Undecided / more evidence needed</option>{draft.order.map((sourceId, index) => <option value={sourceId} key={sourceId}>Reading {index + 1}</option>)}</select><p className="muted small">No answer is graded. The original reasoning and preference remain in your private record.</p></fieldset></section>}
      <div className="bi-workspace-actions"><button className="primary" disabled={pending || !sourceReady || !currentResearch || !notebook.state || !dirty} onClick={() => void save()}>Save private reflection</button><button className="secondary" onClick={privateText}>Download private writing</button>{baseline && <button className="text-button" disabled={pending} onClick={() => void remove(draft.id)}>Delete this reflection</button>}</div>
      {draft.history.length > 0 && <details className="panel"><summary>Private revision history ({draft.history.length}/{MAX_HISTORY})</summary><p>Previous saved writing is retained. This history records local edits, not independent review or proof of authorship.</p>{draft.history.map((entry, index) => <article className="bi-history" key={`${entry.at}-${index}`}><h3>Saved {new Date(entry.at).toLocaleString()}</h3><p>{entry.revealedAt ? 'After source reveal' : 'Before source reveal'}</p><h4>Earlier before-reveal reasoning</h4><p className="bi-private-text">{entry.before || '(No reasoning saved at that point.)'}</p><p>{preference(draft, entry.initialPreference)}</p>{entry.revealedAt && <><h4>Earlier after-reveal reasoning</h4><p className="bi-private-text">{entry.after || '(No later reasoning saved at that point.)'}</p><p>{preference(draft, entry.finalPreference)}</p></>}</article>)}</details>}
    </section>}
    <section className="panel bi-notebook" aria-labelledby="bi-notebook-heading"><h2 id="bi-notebook-heading">Private notebook, backup and deletion</h2><p>Saved only in this browser profile. No account sync, automatic sharing or model requests. Backups contain private reasoning. Up to {MAX_REFLECTIONS} reflections and {MAX_HISTORY} previous edits per reflection are retained; browser storage may be cleared.</p><p className="muted small">The backup contains saved records only. Download unsaved private writing separately. An imported backup cannot overwrite a later reveal on an existing record.</p>
      <div className="bi-workspace-actions"><button className="secondary" disabled={pending} onClick={() => void notebook.reload()}>Reload saved interpretation records</button><button className="secondary" disabled={pending || !notebook.state || dirty} onClick={() => notebook.state && downloadPrivateFile('adigun-blind-interpretation-backup.json', JSON.stringify(notebook.state, null, 2), 'application/json')}>Download interpretation backup</button></div>
      <label htmlFor="bi-import">Preview interpretation backup</label><input id="bi-import" type="file" accept=".json,application/json" disabled={pending || !notebook.state} onChange={event => void preview(event)}/>
      {incoming && <div className="availability-note"><p>Validated backup: {incoming.reflections.length} reflections. Restoring replaces only this notebook after confirmation. Export your current saved records first if you want to retain them.</p><div className="bi-workspace-actions"><button className="secondary" disabled={pending || dirty || !notebook.state} onClick={() => void restore()}>Replace interpretation notebook from backup</button><button className="text-button" disabled={pending} onClick={() => setIncoming(null)}>Cancel interpretation restore</button></div></div>}
      {notebook.state?.reflections.length === 0 && <p>No saved reflections yet.</p>}
      <ul className="bi-saved-list">{[...(notebook.state?.reflections || [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((reflection, index) => <li key={reflection.id}><button className="secondary" aria-pressed={draft?.id === reflection.id} disabled={pending} onClick={() => choose(reflection)}>Open saved reflection {index + 1}<small>{reflection.editionId} · {reflection.revealedAt ? 'Revealed' : 'Before reveal'} · {new Date(reflection.updatedAt).toLocaleString()}</small></button><button className="text-button" disabled={pending} aria-label={`Delete saved reflection ${index + 1}`} onClick={() => void remove(reflection.id)}>Delete</button></li>)}</ul>
      <button className="text-button" disabled={pending || !notebook.state?.reflections.length} onClick={() => { if (window.confirm('Delete all saved blind interpretation reflections and discard the open draft on this device? Other notebooks and downloaded backups are unaffected.')) void run(async () => { if (await notebook.commit(state => ({ ...state, reflections: [] }))) { clearEditor(); setIncoming(null); setNotice('All blind interpretation reflections deleted from this device.'); } }); }}>Delete all interpretation reflections</button>
    </section>
  </section>;
}

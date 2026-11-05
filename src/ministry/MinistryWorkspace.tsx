import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { getBook, getManifest } from '../data';
import { parseReference } from '../domain';
import { requirePermission } from '../permissions';
import { passageLabel, samePassage } from '../reading-session/model';
import type { Locale, Reference } from '../types';
import { downloadPrivateFile } from '../workspace/shared';
import { calendarOutlines, emptyMinistry, MAX_MINISTRY_BACKUP_BYTES, mergeMinistry, ministryBackup, ministryTemplates, newMinistryOutline, parseMinistryBackup, previewMinistryImport, validateMinistryOutline } from './model';
import type { MinistryOutline, MinistryQuote, MinistrySection, MinistryState } from './model';
import { checkMinistryImportSources, ministryMarkdown, resolveMinistrySource } from './source-core';
import type { MinistrySourcePassage } from './source-core';
import { useMinistry, useMinistryGuard } from './useMinistry';
import './ministry.css';

const sources = { getBook, getManifest, requirePermission };
const clone = <T,>(value: T): T => structuredClone(value);
const fileTitle = (value: string) => value.normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 70) || 'outline';

function Quotation({ quote, onOpenReference }: { quote: MinistryQuote; onOpenReference: (reference: Reference) => void }) {
  const [source, setSource] = useState<MinistrySourcePassage | null>(null), [error, setError] = useState('');
  useEffect(() => {
    let active = true; setSource(null); setError('');
    resolveMinistrySource(quote.passage.reference, sources, quote.passage.sourceSha256).then(value => { if (active) setSource(value); }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Source passage unavailable.'); });
    return () => { active = false; };
  }, [quote.passage]);
  return <div className="ministry-quotation">
    <h4>{passageLabel(quote.passage)} · {quote.passage.editionName}</h4>
    {error ? <p role="alert">{error}</p> : source ? <><blockquote lang={source.edition.language}>{source.verses.map(verse => <p key={verse.number}><sup>{verse.number}</sup> {verse.text}</p>)}</blockquote><p className="ministry-credit">{source.attribution}</p></> : <p role="status">Verifying the saved source revision…</p>}
    <details><summary>Source identity</summary><p>Edition: {quote.passage.reference.editionId}</p><p className="ministry-hash">Revision: {quote.passage.sourceSha256}</p></details>
    <button type="button" className="text-button" onClick={() => onOpenReference(quote.passage.reference)}>Open {passageLabel(quote.passage)} in reader</button>
  </div>;
}

export default function MinistryWorkspace({ reference, locale, onOpenReference }: { reference: Reference; locale: Locale; onOpenReference: (reference: Reference) => void }) {
  const { state, busy: storageBusy, error: storageError, status, reload, commit } = useMinistry();
  const [draft, setDraft] = useState<MinistryOutline | null>(null), [baseline, setBaseline] = useState('');
  const [original, setOriginal] = useState<string | null>(null), [template, setTemplate] = useState('passage');
  const [query, setQuery] = useState(''), [seriesFilter, setSeriesFilter] = useState(''), [referenceInput, setReferenceInput] = useState('');
  const [operationBusy, setOperationBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [incoming, setIncoming] = useState<MinistryState | null>(null), [conflict, setConflict] = useState<'keep-device' | 'use-backup'>('keep-device');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const alive = useRef(true), sequence = useRef(0), importSequence = useRef(0), draftRef = useRef(draft); draftRef.current = draft;
  const busy = storageBusy || operationBusy, dirty = !!draft && JSON.stringify(draft) !== baseline;
  useMinistryGuard(dirty, busy);
  useEffect(() => { alive.current = true; return () => { alive.current = false; sequence.current++; importSequence.current++; }; }, []);
  const begin = (value: MinistryOutline, saved: boolean) => {
    if (busy || (dirty && !window.confirm('Discard the unsaved outline changes?'))) return;
    const copy = clone(value); setDraft(copy); setBaseline(JSON.stringify(copy)); setOriginal(saved ? JSON.stringify(value) : null); setError(''); setMessage('');
  };
  const change = (patch: Partial<MinistryOutline>) => setDraft(value => value ? { ...value, ...patch } : null);
  const sectionChange = (id: string, patch: Partial<MinistrySection>) => setDraft(value => value ? { ...value, sections: value.sections.map(section => section.id === id ? { ...section, ...patch } : section) } : null);
  async function saveDraft() {
    if (!draft || busy) return; setError('');
    try {
      const next = validateMinistryOutline({ ...draft, updatedAt: new Date(Math.max(Date.now(), Date.parse(draft.createdAt))).toISOString() });
      if (await commit(current => {
        const existing = current.outlines.find(item => item.id === next.id);
        if ((original === null && existing) || (original !== null && (!existing || JSON.stringify(existing) !== original))) throw new Error('This outline changed since you opened it. Export your draft, then reopen the saved outline.');
        return { ...current, outlines: existing ? current.outlines.map(item => item.id === next.id ? next : item) : [next, ...current.outlines] };
      })) { if (alive.current) { setDraft(next); setBaseline(JSON.stringify(next)); setOriginal(JSON.stringify(next)); setMessage('Outline saved privately.'); } }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save this outline.'); }
  }
  async function addPassage(input?: string) {
    if (!draft || busy) return;
    const draftId = draft.id, task = ++sequence.current; setOperationBusy(true); setError('');
    try {
      let selected = reference;
      if (input !== undefined) {
        const manifest = await getManifest(reference.editionId || 'eng-web'), parsed = parseReference(input, manifest.books);
        if (!parsed) throw new Error('Enter a valid passage in the selected edition, such as John 3:16–18.');
        selected = { ...parsed, editionId: manifest.edition.id };
      }
      const resolved = await resolveMinistrySource(selected, sources);
      if (!alive.current || task !== sequence.current || draftRef.current?.id !== draftId) return;
      if (draftRef.current.quotes.some(quote => samePassage(quote.passage, resolved.passage))) throw new Error('This exact passage and revision are already in the outline.');
      const quote = { id: `quote-${crypto.randomUUID()}`, passage: resolved.passage };
      setDraft(current => current?.id === draftId ? { ...current, quotes: [...current.quotes, quote] } : current);
      setReferenceInput(''); setMessage('Exact source reference added to the unsaved outline. Link it to a section below.');
    } catch (reason) { if (alive.current && task === sequence.current) setError(reason instanceof Error ? reason.message : 'Could not open this source.'); }
    finally { if (alive.current && task === sequence.current) setOperationBusy(false); }
  }
  async function exportOutline(audience: 'participant' | 'facilitator') {
    if (!draft || busy) return; const task = ++sequence.current; setOperationBusy(true); setError('');
    try {
      const output = await ministryMarkdown(draft, audience, sources);
      if (!alive.current || task !== sequence.current) return;
      downloadPrivateFile(`${fileTitle(draft.title)}-${audience}.md`, output, 'text/markdown;charset=utf-8');
      setMessage(audience === 'participant' ? 'Participant handout downloaded. Private context and facilitator notes are excluded.' : 'Private facilitator edition downloaded. Keep it somewhere you trust.');
    } catch (reason) { if (alive.current && task === sequence.current) setError(reason instanceof Error ? reason.message : 'The export could not verify its sources.'); }
    finally { if (alive.current && task === sequence.current) setOperationBusy(false); }
  }
  function exportDraft() {
    if (!draft) return;
    try { const value = validateMinistryOutline(draft); downloadPrivateFile('adigun-ministry-draft.json', ministryBackup({ ...emptyMinistry(), outlines: [value] }), 'application/json'); setMessage('Draft backup downloaded with private notes. This did not save it to browser storage.'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Complete the outline title before exporting a draft.'); }
  }
  async function readBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file || busy) return;
    const task = ++importSequence.current; setOperationBusy(true); setError(''); setIncoming(null);
    try {
      if (file.size > MAX_MINISTRY_BACKUP_BYTES) throw new Error('Choose a ministry backup smaller than 12 MB.');
      const value = parseMinistryBackup(await file.text());
      await checkMinistryImportSources(value, sources);
      if (alive.current && task === importSequence.current) { setIncoming(value); setConflict('keep-device'); }
    } catch (reason) { if (alive.current && task === importSequence.current) setError(reason instanceof Error ? reason.message : 'Could not validate this backup.'); }
    finally { if (alive.current && task === importSequence.current) setOperationBusy(false); }
  }
  const preview = incoming && state ? previewMinistryImport(state, incoming) : null;
  const visible = state?.outlines.filter(item => (!seriesFilter || item.series === seriesFilter) && `${item.title} ${item.series} ${item.summary}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) || [];
  const calendar = calendarOutlines(state?.outlines || []);
  return <div className="page ministry-page" lang="en">
    <div className="page-heading"><span className="eyebrow">PRIVATE PREPARATION</span><h1>Ministry workspace</h1><p>Prepare a sermon or lesson, keep exact source references, and create separate participant and facilitator editions. Writing stays on this device.</p></div>
    {locale !== 'en' && <p className="availability-note">English interface fallback · native-language review for this tool is pending. Your writing and source passages keep their own languages.</p>}
    <p role="status" aria-live="polite">{status}</p>
    {storageError && <p className="error-message" role="alert">{storageError}</p>}
    {error && <p className="error-message" role="alert">{error}</p>}
    {message && <p className="ministry-message" role="status">{message}</p>}
    <div className="button-row"><button type="button" className="secondary" disabled={busy} onClick={() => { if (!dirty || window.confirm('Reload storage and discard the unsaved draft?')) { setDraft(null); setIncoming(null); void reload(); } }}>Reload ministry storage</button></div>
    {state && <>
      <details className="panel ministry-backup"><summary>Backup, restore and privacy</summary>
        <p>JSON backups include private context and facilitator notes. Source quotations are stored as exact edition and revision references, not copied text. Restoring checks every reference before changing your saved records.</p>
        <div className="button-row"><button type="button" className="secondary" disabled={busy} onClick={() => downloadPrivateFile('adigun-ministry-backup.json', ministryBackup(state), 'application/json')}>Export ministry backup</button><button type="button" className="text-button" disabled={busy} onClick={() => setConfirmDelete(value => !value)}>Delete ministry records</button></div>
        <label>Preview ministry backup<input type="file" accept="application/json,.json" disabled={busy || dirty} onChange={event => void readBackup(event)}/></label>
        {dirty && <p>Save or close your current draft before restoring a backup.</p>}
        {preview && incoming && <section className="ministry-preview" aria-label="Ministry import preview"><h3>Validated import preview</h3><p>{preview.added} new records · {preview.identical} identical duplicates · {preview.conflicts} conflicts. Existing unrelated records are retained.</p>
          {preview.conflicts > 0 && <label>Conflicting records<select value={conflict} onChange={event => setConflict(event.target.value as typeof conflict)}><option value="keep-device">Keep this device’s records</option><option value="use-backup">Use the backup’s records</option></select></label>}
          <div className="button-row"><button type="button" className="primary" disabled={busy || dirty} onClick={async () => { if (await commit(current => mergeMinistry(current, incoming, conflict))) { setIncoming(null); setDraft(null); setMessage('Validated ministry records merged.'); } }}>Merge ministry backup</button><button type="button" className="secondary" disabled={busy} onClick={() => setIncoming(null)}>Cancel import</button></div>
        </section>}
        {confirmDelete && <section className="ministry-preview"><p>Delete all saved ministry outlines and personal templates on this device? Other notes, family files and source downloads are unaffected.</p><div className="button-row"><button type="button" className="danger secondary" disabled={busy} onClick={async () => { if (dirty && !window.confirm('Discard the unsaved ministry draft as well?')) return; if (await commit(current => ({ ...emptyMinistry(), revision: current.revision }))) { setDraft(null); setIncoming(null); setConfirmDelete(false); } }}>Confirm ministry deletion</button><button type="button" className="secondary" onClick={() => setConfirmDelete(false)}>Keep ministry records</button></div></section>}
        <p className="small muted">No account synchronization, public publishing, messaging, assigned readers or background reminders are active here. Browser storage is not encrypted; export backups regularly.</p>
      </details>
      <div className="ministry-layout"><aside className="ministry-index" aria-label="Your ministry preparation">
        <section className="panel"><h2>Prepare an outline</h2><label>Starting structure<select value={template} disabled={busy} onChange={event => setTemplate(event.target.value)}>{ministryTemplates.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button type="button" className="primary" disabled={busy} onClick={() => begin(newMinistryOutline(template), false)}>New outline</button><p className="small muted">Structures supply headings only. All teaching and interpretation are your own writing.</p></section>
        <section className="panel"><h2>Saved outlines</h2><label>Search outlines<input type="search" value={query} onChange={event => setQuery(event.target.value)}/></label><label>Series filter<select value={seriesFilter} onChange={event => setSeriesFilter(event.target.value)}><option value="">All series</option>{[...new Set(state.outlines.map(item => item.series).filter(Boolean))].sort().map(series => <option key={series}>{series}</option>)}</select></label>
          <div className="ministry-list">{visible.map(item => <article key={item.id}><button type="button" className="text-button" disabled={busy} aria-current={draft?.id === item.id ? 'true' : undefined} onClick={() => begin(item, true)}>{item.title}</button><p className="small muted">{item.kind} · {item.series || 'No series'} · {item.scheduledDate || 'Unscheduled'}</p><button type="button" className="text-button danger" disabled={busy} aria-label={`Delete outline ${item.title}`} onClick={async () => { if (!window.confirm(`Delete “${item.title}” from this device?`)) return; if (draft?.id === item.id && dirty && !window.confirm('Discard this outline’s unsaved changes too?')) return; if (await commit(current => ({ ...current, outlines: current.outlines.filter(value => value.id !== item.id) }))) { if (draft?.id === item.id) setDraft(null); } }}>Delete</button></article>)}</div>{!visible.length && <p>No saved outlines match this view.</p>}
        </section>
        <details className="panel"><summary>Series calendar ({calendar.length})</summary><p>Dates and traditions are author-selected planning notes, not an official lectionary or a reminder service.</p><ol className="ministry-calendar">{calendar.map(item => <li key={item.id}><time dateTime={item.scheduledDate}>{item.scheduledDate}</time> · {item.timeZone}<br/><button type="button" className="text-button" disabled={busy} onClick={() => begin(item, true)}>{item.title}</button>{item.series && <span> · {item.series}</span>}</li>)}</ol>{!calendar.length && <p>Add a planned date to a saved outline to place it here.</p>}</details>
        <details className="panel"><summary>Personal templates ({state.templates.length})</summary><p>Templates may include your private notes. They stay inside this workspace and its private backups.</p>{state.templates.map(item => <article className="ministry-template" key={item.id}><h3>{item.title}</h3><div className="button-row"><button type="button" className="secondary" disabled={busy} onClick={() => { const now = new Date().toISOString(); begin({ ...clone(item), id: `outline-${crypto.randomUUID()}`, title: '', series: '', scheduledDate: '', createdAt: now, updatedAt: now }, false); }}>Use template {item.title}</button><button type="button" className="text-button danger" disabled={busy} aria-label={`Delete template ${item.title}`} onClick={() => { if (window.confirm(`Delete template “${item.title}”?`)) void commit(current => ({ ...current, templates: current.templates.filter(value => value.id !== item.id) })); }}>Delete template</button></div></article>)}</details>
      </aside>
      <section className="panel ministry-editor" aria-label="Ministry outline editor">
        {!draft ? <><h2>Your next study begins here</h2><p>Create an outline or open a saved one. Add the selected reader passage, write your own notes, and choose which information belongs in the handout.</p></> : <>
          <h2>{draft.title || 'New outline'}</h2><p className="small muted">{dirty ? 'Unsaved changes' : original ? 'Saved outline' : 'New unsaved outline'} · author’s preparation, not editorial approval</p>
          <fieldset disabled={busy}>
            <label>Outline title<input required maxLength={200} value={draft.title} onChange={event => change({ title: event.target.value })}/></label>
            <div className="ministry-fields"><label>Outline kind<select value={draft.kind} onChange={event => change({ kind: event.target.value as MinistryOutline['kind'] })}><option value="lesson">Lesson</option><option value="sermon">Sermon preparation</option></select></label><label>Writing language tag<input maxLength={40} value={draft.contentLanguage} onChange={event => change({ contentLanguage: event.target.value })}/></label></div>
            <label>Participant introduction<textarea rows={3} maxLength={5000} value={draft.summary} onChange={event => change({ summary: event.target.value })}/></label>
            <details><summary>Series, calendar and tradition settings</summary><label>Series title<input maxLength={200} value={draft.series} onChange={event => change({ series: event.target.value })}/></label><div className="ministry-fields"><label>Planned date<input type="date" value={draft.scheduledDate} onChange={event => change({ scheduledDate: event.target.value })}/></label><label>Calendar timezone<input maxLength={100} value={draft.timeZone} onChange={event => change({ timeZone: event.target.value })}/></label></div><label>Tradition or church-year note<input maxLength={200} value={draft.tradition} onChange={event => change({ tradition: event.target.value })}/></label><p className="small muted">These optional details appear on handouts. Enter only details you intend to share.</p></details>
            <section className="ministry-source-shelf" aria-label="Exact quotation shelf"><h3>Exact source readings</h3><p>Passages remain tied to their original edition and revision. Their wording cannot be edited here.</p><button type="button" className="secondary" disabled={draft.quotes.length >= 80} onClick={() => void addPassage()}>Add selected reader passage</button><label>Additional passage in {reference.editionId || 'eng-web'}<input value={referenceInput} onChange={event => setReferenceInput(event.target.value)} placeholder="John 3:16–18"/></label><button type="button" className="secondary" disabled={!referenceInput.trim() || draft.quotes.length >= 80} onClick={() => void addPassage(referenceInput)}>Add reference</button>
              {draft.quotes.map(quote => <article className="ministry-source-entry" key={quote.id}><Quotation quote={quote} onOpenReference={onOpenReference}/><button type="button" className="text-button danger" aria-label={`Remove reading ${passageLabel(quote.passage)}`} onClick={() => change({ quotes: draft.quotes.filter(item => item.id !== quote.id), sections: draft.sections.map(section => ({ ...section, quoteIds: section.quoteIds.filter(id => id !== quote.id) })) })}>Remove reading</button></article>)}
            </section>
            <h3>Participant outline</h3><p className="small muted">Section writing and linked exact quotations appear in both editions.</p>
            {draft.sections.map((section, index) => <section className="ministry-section" key={section.id}><h4>Section {index + 1}</h4><label>Section {index + 1} heading<input required maxLength={200} value={section.heading} onChange={event => sectionChange(section.id, { heading: event.target.value })}/></label><label>Section {index + 1} writing<textarea rows={4} maxLength={20000} value={section.writing} onChange={event => sectionChange(section.id, { writing: event.target.value })}/></label>
              {draft.quotes.length > 0 && <fieldset className="ministry-links"><legend>Readings for section {index + 1}</legend>{draft.quotes.map(quote => <label key={quote.id} className="ministry-check"><input type="checkbox" checked={section.quoteIds.includes(quote.id)} onChange={event => sectionChange(section.id, { quoteIds: event.target.checked ? [...section.quoteIds, quote.id] : section.quoteIds.filter(id => id !== quote.id) })}/><span>{passageLabel(quote.passage)} · {quote.passage.editionName}</span></label>)}</fieldset>}
              <div className="button-row"><button type="button" className="text-button" disabled={index === 0} aria-label={`Move section ${index + 1} earlier`} onClick={() => { const sections = [...draft.sections]; [sections[index - 1], sections[index]] = [sections[index], sections[index - 1]]; change({ sections }); }}>Move earlier</button><button type="button" className="text-button" disabled={index === draft.sections.length - 1} aria-label={`Move section ${index + 1} later`} onClick={() => { const sections = [...draft.sections]; [sections[index + 1], sections[index]] = [sections[index], sections[index + 1]]; change({ sections }); }}>Move later</button><button type="button" className="text-button danger" disabled={draft.sections.length === 1} aria-label={`Remove section ${index + 1}`} onClick={() => { if ((!section.writing.trim() && !section.quoteIds.length) || window.confirm('Remove this section and its writing from the draft?')) change({ sections: draft.sections.filter(item => item.id !== section.id) }); }}>Remove section</button></div>
            </section>)}
            <button type="button" className="secondary" disabled={draft.sections.length >= 40} onClick={() => change({ sections: [...draft.sections, { id: `section-${crypto.randomUUID()}`, heading: `Section ${draft.sections.length + 1}`, writing: '', quoteIds: [] }] })}>Add outline section</button>
            <section className="ministry-private"><h3>Private preparation</h3><p>These two fields are excluded from the participant handout. They are included in private facilitator exports and JSON backups.</p><label>Private context and source notes<textarea rows={4} maxLength={20000} value={draft.contextNotes} onChange={event => change({ contextNotes: event.target.value })}/></label><label>Private facilitator notes and answers<textarea rows={5} maxLength={30000} value={draft.facilitatorNotes} onChange={event => change({ facilitatorNotes: event.target.value })}/></label></section>
            <div className="button-row ministry-save"><button type="button" className="primary" onClick={() => void saveDraft()}>Save outline</button><button type="button" className="secondary" onClick={() => { if (!dirty || window.confirm('Close the outline and discard unsaved changes?')) setDraft(null); }}>Close outline</button><button type="button" className="secondary" onClick={exportDraft}>Export draft backup</button></div>
            <details><summary>Handouts and reusable template</summary><p>Source permissions and revisions are checked again for every Markdown export. Exporting downloads a file; it does not publish or send it.</p><div className="button-row"><button type="button" className="primary" onClick={() => void exportOutline('participant')}>Download participant handout</button><button type="button" className="secondary" onClick={() => { if (window.confirm('Download the private facilitator edition, including private context and answers?')) void exportOutline('facilitator'); }}>Download private facilitator edition</button><button type="button" className="secondary" disabled={state.templates.length >= 20} onClick={async () => { try { const now = new Date().toISOString(), value = validateMinistryOutline({ ...draft, id: `template-${crypto.randomUUID()}`, scheduledDate: '', createdAt: now, updatedAt: now }); if (await commit(current => ({ ...current, templates: [...current.templates, value] }))) setMessage('Private reusable template saved.'); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save the template.'); } }}>Save as private template</button></div></details>
          </fieldset>
        </>}
      </section></div>
    </>}
  </div>;
}

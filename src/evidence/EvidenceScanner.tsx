import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { bibleEditionIds, getBook, getEditionCatalog, getManifest } from '../data';
import { permissionFor, requirePermission } from '../permissions';
import type { Edition, Reference } from '../types';
import { categoryLabels, MAX_SCAN_REFERENCES, MAX_TRANSCRIPT_LENGTH, scanTranscript } from './scanner';
import type { ScanReport, SermonFinding } from './scanner';
import { buildEvidenceReport, currentReview, validateSession } from './session';
import type { EvidenceSession, FindingReviewStatus } from './session';
import { deleteEvidenceSession, listEvidenceSessions, saveEvidenceSession } from './storage';
import './evidence.css';

interface Props { onNavigate?: (reference: Reference) => void }
interface SourceOption { edition: Edition; allowed: boolean; reason: string }
const freshId = () => `session-${crypto.randomUUID()}`;
const errorText = (error: unknown) => error instanceof Error ? error.message : 'The action could not be completed. Your transcript remains available to export.';
function downloadFile(text: string, name: string, mime: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function EvidenceScanner({ onNavigate }: Props) {
  const [title, setTitle] = useState('');
  const [transcript, setTranscript] = useState('');
  const [report, setReport] = useState<ScanReport | null>(null);
  const [reviews, setReviews] = useState<EvidenceSession['reviews']>({});
  const [editionIds, setEditionIds] = useState(['eng-web']);
  const [sourceOptions, setSourceOptions] = useState<SourceOption[]>([]);
  const [sourceError, setSourceError] = useState('');
  const [sourceRetry, setSourceRetry] = useState(0);
  const [sessionId, setSessionId] = useState(freshId);
  const [createdAt, setCreatedAt] = useState(() => new Date().toISOString());
  const [sessions, setSessions] = useState<EvidenceSession[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [readingFile, setReadingFile] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [reviewFilter, setReviewFilter] = useState<'all' | 'pending' | 'challenge'>('all');
  const request = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const locked = running || saving || readingFile;

  useEffect(() => {
    let active = true;
    listEvidenceSessions().then(items => { if (active) { setSessions(items); setStorageReady(true); } }).catch(problem => { if (active) setStorageError(errorText(problem)); });
    return () => { active = false; request.current?.abort(); };
  }, []);
  useEffect(() => {
    let active = true;
    getEditionCatalog().then(async catalog => {
      const options = await Promise.all(catalog.editions.filter(edition => bibleEditionIds.includes(edition.id)).map(async edition => {
        const decisions = await Promise.all([permissionFor(edition, 'display'), permissionFor(edition, 'searchIndex'), permissionFor(edition, 'documentExport')]);
        const denied = decisions.find(decision => !decision.allowed);
        return { edition, allowed: !denied, reason: denied?.reason || 'Unchanged text may be checked and included with attribution in a report.' };
      }));
      if (active) { setSourceOptions(options); setSourceError(''); }
    }).catch(problem => { if (active) setSourceError(errorText(problem)); });
    return () => { active = false; };
  }, [sourceRetry]);

  function markChanged() { revision.current++; setDirty(true); setError(''); }
  function editTranscript(text: string) {
    markChanged(); request.current?.abort(); setTranscript(text); setReport(null); setStatus('Transcript changed. Check it again to produce current evidence. Previous review notes retain their original evidence binding.');
  }
  function draft(): EvidenceSession {
    return validateSession({ schemaVersion: 1, id: sessionId, title, transcript, createdAt, updatedAt: new Date().toISOString(), editionIds, reviews });
  }
  async function analyze() {
    const controller = new AbortController(); request.current?.abort(); request.current = controller;
    const inputRevision = revision.current;
    setRunning(true); setError(''); setReport(null); setStatus('Opening the checked Scripture source…');
    try {
      const sources = await Promise.all(editionIds.map(async editionId => {
        const manifest = await getManifest(editionId);
        await Promise.all([requirePermission(manifest.edition, 'searchIndex'), requirePermission(manifest.edition, 'documentExport')]);
        return { manifest, book: (id: string) => getBook(id, editionId) };
      }));
      controller.signal.throwIfAborted();
      const result = await scanTranscript(transcript, sources, { signal: controller.signal, onProgress: (complete, total) => { if (!controller.signal.aborted) setStatus(`Checked ${complete} of ${total} reference mentions.`); } });
      if (controller.signal.aborted || revision.current !== inputRevision) return;
      setReport(result); setReviewFilter('all');
      setStatus(result.findings.length ? `Check finished. ${result.findings.length} evidence cards are ready for your review.` : 'No supported book chapter:verse references were detected. Add or correct explicit references in your transcript, then check again.');
      window.requestAnimationFrame(() => resultsHeading.current?.focus());
    } catch (problem) {
      if (!controller.signal.aborted && revision.current === inputRevision) setError(errorText(problem));
    } finally { if (request.current === controller) { setRunning(false); request.current = null; } }
  }
  function cancelCheck() { request.current?.abort(); request.current = null; setRunning(false); setStatus('Check cancelled. The transcript is unchanged.'); }

  async function readFile(event: ChangeEvent<HTMLInputElement>, backup = false) {
    const file = event.currentTarget.files?.[0]; event.currentTarget.value = '';
    if (!file) return;
    if (dirty && !window.confirm('Replace this working transcript? Export or save it first if you need to keep your changes.')) return;
    setReadingFile(true); setError('');
    try {
      if (file.size > (backup ? 4_000_000 : MAX_TRANSCRIPT_LENGTH * 4 + 4096)) throw new Error('This file is too large. Split the transcript into smaller text files.');
      if (!backup && !/\.(txt|srt|vtt)$/i.test(file.name)) throw new Error('Choose a plain .txt, .srt or .vtt transcript. Audio, video, PDF and Word files are not transcribed by this tool.');
      const text = await file.text();
      if (text.includes('\0')) throw new Error('This file is not a supported plain-text transcript.');
      if (backup) {
        let imported: EvidenceSession;
        try { imported = validateSession(JSON.parse(text)); } catch { throw new Error('This file is not a valid Adigun-AiBible transcript backup. Your working transcript was kept.'); }
        revision.current++; setTranscript(imported.transcript); setTitle(imported.title); setReviews(imported.reviews); setEditionIds(imported.editionIds); setSessionId(freshId()); setCreatedAt(imported.createdAt); setReport(null); setDirty(true);
        setStatus('Backup opened as a new unsaved session. Check the transcript again against the installed source before relying on any findings.');
      } else {
        if (text.length > MAX_TRANSCRIPT_LENGTH) throw new Error(`This transcript exceeds ${MAX_TRANSCRIPT_LENGTH.toLocaleString('en')} characters. Split it into sections.`);
        editTranscript(text); setReviews({}); setTitle(file.name.replace(/\.(txt|srt|vtt)$/i, '').slice(0, 160)); setSessionId(freshId()); setCreatedAt(new Date().toISOString());
        setStatus('Text transcript loaded. Correct any errors before checking it. Timestamp text has been preserved.');
      }
    } catch (problem) { setError(errorText(problem)); }
    finally { setReadingFile(false); }
  }
  async function save() {
    if (!storageReady || !transcript.trim()) return;
    const inputRevision = revision.current, session = draft();
    setSaving(true); setError('');
    try {
      await saveEvidenceSession(session);
      setSessions(items => [session, ...items.filter(item => item.id !== session.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      if (revision.current === inputRevision) { setDirty(false); setStatus('Saved on this device. The transcript and your review notes remain until you delete this saved copy.'); }
      else setStatus('An earlier version was saved. Your newest changes still need saving.');
    } catch (problem) { setError(errorText(problem)); }
    finally { setSaving(false); }
  }
  function openSession(session: EvidenceSession) {
    if (dirty && !window.confirm('Open this saved transcript and replace the current unsaved changes?')) return;
    revision.current++; setTranscript(session.transcript); setTitle(session.title); setReviews(session.reviews); setEditionIds(session.editionIds); setSessionId(session.id); setCreatedAt(session.createdAt); setReport(null); setDirty(false); setError('');
    setStatus('Saved transcript opened. Check it again to load current source evidence. Previous review notes apply only when the transcript and source hashes still match.');
  }
  async function deleteSaved(session: EvidenceSession) {
    if (!window.confirm(`Delete the saved copy of “${session.title || 'Untitled transcript'}” from this device? Downloaded exports are separate files.`)) return;
    setSaving(true); setError('');
    try {
      await deleteEvidenceSession(session.id); setSessions(items => items.filter(item => item.id !== session.id));
      if (session.id === sessionId) setDirty(true);
      setStatus('The saved copy was deleted from this device. Any open working transcript and exported files are separate copies.');
    } catch (problem) { setError(errorText(problem)); }
    finally { setSaving(false); }
  }
  function clearDraft() {
    if ((transcript || title) && !window.confirm('Clear the working transcript and its evidence cards? Saved copies remain available below.')) return;
    revision.current++; setTranscript(''); setTitle(''); setReport(null); setReviews({}); setSessionId(freshId()); setCreatedAt(new Date().toISOString()); setDirty(false); setError(''); setStatus('Working transcript cleared. No saved sessions were deleted.');
  }
  function updateReview(finding: SermonFinding, changes: { status?: FindingReviewStatus; note?: string }) {
    if (!report) return;
    markChanged(); setReviews(current => ({ ...current, [finding.id]: { ...currentReview(report, finding, current), ...changes } }));
    setStatus('Personal review changed. Save this session or export a report to keep it.');
  }
  function exportBackup() {
    try { downloadFile(JSON.stringify(draft(), null, 2) + '\n', 'adigun-sermon-transcript-backup.json', 'application/json;charset=utf-8'); setStatus('Transcript backup prepared. This file contains your private transcript and review notes.'); }
    catch (problem) { setError(errorText(problem)); }
  }
  function chooseEdition(editionId: string, selected: boolean) {
    if (!selected && editionIds.length === 1) { setError('Keep at least one edition selected for checking.'); return; }
    if (selected && editionIds.length >= 8) { setError('Choose up to eight editions per check.'); return; }
    markChanged(); setEditionIds(ids => selected ? [...ids, editionId] : ids.filter(id => id !== editionId)); setReport(null);
    setStatus('Checked sources changed. Run another check to compare the selected editions.');
  }
  async function exportReport() {
    if (!report) return;
    setSaving(true); setError('');
    try {
      await Promise.all(report.checkedEditions.map(async edition => requirePermission((await getManifest(edition.id)).edition, 'documentExport')));
      downloadFile(buildEvidenceReport(title, transcript, report, reviews), 'adigun-sermon-evidence-report.txt', 'text/plain;charset=utf-8');
      setStatus('Evidence report prepared with transcript spans, source attribution, limitations and your review notes.');
    } catch (problem) { setError(errorText(problem)); }
    finally { setSaving(false); }
  }
  const shownFindings = report?.findings.filter(finding => reviewFilter === 'all' || currentReview(report, finding, reviews).status === reviewFilter) || [];
  const pendingCount = report?.findings.filter(finding => currentReview(report, finding, reviews).status === 'pending').length || 0;
  const staleReviews = Object.entries(reviews).filter(([id, review]) => { const finding = report?.findings.find(item => item.id === id); return (review.note || review.status !== 'pending') && (!report || !finding || currentReview(report, finding, reviews).evidenceKey !== review.evidenceKey); });
  const sourcesReady = editionIds.every(id => sourceOptions.some(option => option.edition.id === id && option.allowed));

  return <section className="page evidence-workspace" aria-labelledby="evidence-title">
    <header className="page-heading">
      <span className="eyebrow">Scripture Observatory · evidence tools</span>
      <h1 id="evidence-title">Sermon Evidence Scanner</h1>
      <p>Check a text transcript against Scripture, inspect the surrounding passage, and record your own review.</p>
    </header>
    <div className="evidence-scope panel">
      <h2>Local transcript analysis</h2>
      <p>Checks explicit Bible references and nearby double-quoted words against your selected, permitted editions. It does not record or transcribe audio, search every translation, or judge the truth of a sermon’s interpretation.</p>
      <p className="small muted">Your transcript is processed in this browser and is never sent to a model or transcription service. Public Scripture files may be downloaded when needed. Working text stays in memory until you explicitly save it here or export it; saved copies stay on this device until deleted. Other people using this browser profile can access them.</p>
    </div>
    <section className="panel evidence-editor" aria-labelledby="evidence-input-title">
      <h2 id="evidence-input-title">Correct your transcript</h2>
      <label>Session title<input value={title} maxLength={160} disabled={locked} onChange={event => { setTitle(event.target.value); markChanged(); }} /></label>
      <fieldset className="evidence-editions" disabled={locked}><legend>Editions to check</legend>
        <p className="small muted">The first selected edition is the primary comparison. Only installed sources with verified display, indexing and document-export permission can be checked.</p>
        {!sourceOptions.length && !sourceError && <p role="status">Checking available source permissions…</p>}
        {sourceOptions.map(option => <label key={option.edition.id}><span><input type="checkbox" checked={editionIds.includes(option.edition.id)} disabled={!option.allowed && !editionIds.includes(option.edition.id)} onChange={event => chooseEdition(option.edition.id, event.target.checked)} /> {option.edition.name}{editionIds[0] === option.edition.id ? ' · primary' : ''}</span><small>{option.edition.language} · {option.reason}</small></label>)}
        {editionIds.filter(id => !sourceOptions.some(option => option.edition.id === id)).map(id => <p key={id}>Saved selection awaiting availability: {id} <button className="secondary" onClick={() => chooseEdition(id, false)}>Remove {id}</button></p>)}
        {sourceError && <p role="alert">{sourceError}</p>}
        <button className="secondary" onClick={() => setSourceRetry(value => value + 1)}>Refresh edition permissions</button>
      </fieldset>
      <div className="evidence-file-row">
        <label>Open a text transcript<input type="file" accept=".txt,.srt,.vtt,text/plain,text/vtt" disabled={locked} onChange={event => void readFile(event)} /></label>
        <label>Import a transcript backup<input type="file" accept=".json,application/json" disabled={locked} onChange={event => void readFile(event, true)} /></label>
      </div>
      <label htmlFor="sermon-transcript">Transcript</label>
      <textarea id="sermon-transcript" value={transcript} maxLength={MAX_TRANSCRIPT_LENGTH} rows={12} disabled={locked} onChange={event => editTranscript(event.target.value)} aria-describedby="transcript-help" spellCheck />
      <p id="transcript-help" className="small muted">Use references such as John 3:16 or 1 Corinthians 13:4–7. Put quoted Scripture in double quotation marks; identify paraphrases in your own words. Supplied timestamps such as [02:15] are preserved. Checks cover up to {MAX_SCAN_REFERENCES} reference mentions per run.</p>
      <div className="button-row">
        <button className="primary" disabled={locked || !transcript.trim() || !sourcesReady} onClick={() => void analyze()}>Check transcript</button>
        {running && <button className="secondary" onClick={cancelCheck}>Cancel check</button>}
        <button className="secondary" disabled={locked || !storageReady || !transcript.trim()} onClick={() => void save()}>Save on this device</button>
        <button className="secondary" disabled={locked || !transcript.trim()} onClick={exportBackup}>Export transcript backup</button>
        <button className="secondary" disabled={locked || (!transcript && !title)} onClick={clearDraft}>Clear working transcript</button>
      </div>
      <p className="small muted">{transcript.length.toLocaleString()} / {MAX_TRANSCRIPT_LENGTH.toLocaleString()} characters · {dirty ? 'Working changes are not saved.' : transcript ? 'No unsaved text or review changes.' : 'No transcript loaded.'}</p>
    </section>
    <div aria-live="polite" aria-atomic="true">{status && <p className="evidence-status" role="status">{status}</p>}</div>
    {error && <p className="evidence-status danger" role="alert">{error}</p>}
    {storageError && <div className="panel"><p role="alert">{storageError}</p><button className="secondary" disabled={locked} onClick={() => { setStorageError(''); void listEvidenceSessions().then(items => { setSessions(items); setStorageReady(true); }).catch(problem => setStorageError(errorText(problem))); }}>Retry device storage</button></div>}
    {report && <section aria-labelledby="evidence-results-title">
      <div className="evidence-results-heading">
        <div><h2 id="evidence-results-title" ref={resultsHeading} tabIndex={-1}>Evidence cards</h2><p className="small muted">{report.findings.length} checked references · {pendingCount} pending your review</p></div>
        <button className="secondary" disabled={locked} onClick={() => void exportReport()}>Export evidence report</button>
      </div>
      <p className="small muted">Checked source: {report.checkedEditions.map(edition => edition.name).join(', ')}. Different wording is not proof of misquotation. Interpretive, historical and uncited claims need separate research.</p>
      {report.detectedReferences > report.findings.length && <p role="status">Only the first {report.findings.length} of {report.detectedReferences} detected references were checked. Split the transcript to check the remaining references.</p>}
      {!!report.findings.length && <label className="evidence-filter">Review queue<select value={reviewFilter} onChange={event => setReviewFilter(event.target.value as typeof reviewFilter)}><option value="all">All findings</option><option value="pending">Pending my review</option><option value="challenge">Findings I challenged</option></select></label>}
      {!report.findings.length && <p>No evidence cards were generated. This tool does not infer references from unquoted or uncited claims.</p>}
      {!!report.findings.length && !shownFindings.length && <p>No findings match this review filter.</p>}
      {shownFindings.map(finding => {
        const review = currentReview(report, finding, reviews);
        return <article className="panel evidence-card" key={finding.id} aria-labelledby={`${finding.id}-title`}>
          <span className={`evidence-category ${finding.category === 'exact_quotation' ? 'evidence-match' : ''}`}>{categoryLabels[finding.category]}</span>
          <h3 id={`${finding.id}-title`}>{finding.referenceSpan.text}{finding.timestamp ? ` · ${finding.timestamp.label}` : ''}</h3>
          <p className="small muted">Transcript characters {finding.transcriptSpan.start + 1}–{finding.transcriptSpan.end}</p>
          <blockquote className="evidence-transcript">{finding.transcriptSpan.text}</blockquote>
          {finding.quotation && <p className="small"><strong>Words compared:</strong> “{finding.quotation.text}”</p>}
          <p>{finding.explanation}</p>
          {finding.evidence.map(evidence => <section className="evidence-passage" key={evidence.reference.editionId} aria-label={`${evidence.label} in ${evidence.editionName}`}>
            <h4>{evidence.label} <span>· {evidence.editionName}</span></h4>
            <div className="evidence-source-verses">{evidence.verses.map(verse => <p key={verse.number}><sup>{verse.number}</sup>{verse.text}</p>)}</div>
            <details><summary>Read surrounding context</summary><div className="evidence-context">{evidence.context.map(verse => <p key={verse.number}><strong>{verse.number}</strong> {verse.text || 'No main-text wording supplied at this verse position.'}</p>)}</div></details>
            <div className="button-row">{onNavigate && <button className="secondary" onClick={() => { if (!dirty || window.confirm('Open the full chapter? Save or export this working transcript first if you need to keep unsaved changes.')) onNavigate(evidence.reference); }}>Open full chapter</button>}<a href={evidence.sourceUrl} target="_blank" rel="noreferrer">Publisher source</a><a href={evidence.licenseUrl} target="_blank" rel="noreferrer">Source license</a></div>
            <details className="small"><summary>Source attribution and integrity</summary><p>{evidence.attribution} · {evidence.license}</p><p>Passage SHA-256: <code>{evidence.passageHash}</code></p>{evidence.editionHash && <p>Edition source SHA-256: <code>{evidence.editionHash}</code></p>}</details>
          </section>)}
          <details><summary>Uncertainty and checking scope</summary><ul>{finding.uncertainty.map((item, index) => <li key={index}>{item}</li>)}</ul></details>
          <div className="evidence-review">
            <label>My review of {finding.referenceSpan.text}<select value={review.status} disabled={locked} onChange={event => updateReview(finding, { status: event.target.value as FindingReviewStatus })}><option value="pending">Pending my review</option><option value="checked">Checked by me</option><option value="challenge">I challenge this finding</option><option value="dismissed">Dismissed by me</option></select></label>
            <label>My correction or review note<textarea rows={2} maxLength={4000} disabled={locked} value={review.note} onChange={event => updateReview(finding, { note: event.target.value })} /></label>
          </div>
          <p className="small muted">This is your private assessment, not a human editorial approval. Correct the transcript above and run another check to replace an inaccurate finding.</p>
        </article>;
      })}
    </section>}
    {!!staleReviews.length && <details className="panel"><summary>Retained review notes from an earlier check</summary><p className="small muted">These notes refer to previous transcript or source evidence. They are not applied to current findings. They remain in your session backup.</p>{staleReviews.map(([id, review]) => <div key={id}><strong>{id} · {review.status}</strong><p>{review.note || 'No written note.'}</p></div>)}</details>}
    <section className="panel evidence-sessions" aria-labelledby="evidence-saved-title">
      <h2 id="evidence-saved-title">Saved on this device</h2>
      <p className="small muted">Saving is optional. No automatic cloud copy is created. Backups include your private writing; exported files must be deleted separately.</p>
      {!storageReady && !storageError && <p role="status">Opening device storage…</p>}
      {storageReady && !sessions.length && <p>No saved transcript sessions.</p>}
      <ul>{sessions.map(session => <li key={session.id}><div><strong>{session.title || 'Untitled transcript'}</strong><span className="small muted">Updated {new Date(session.updatedAt).toLocaleString()}</span></div><div className="button-row"><button className="secondary" disabled={locked} onClick={() => openSession(session)}>Open {session.title || 'untitled transcript'}</button><button className="secondary danger" disabled={locked} onClick={() => void deleteSaved(session)}>Delete saved copy of {session.title || 'untitled transcript'}</button></div></li>)}</ul>
    </section>
  </section>;
}

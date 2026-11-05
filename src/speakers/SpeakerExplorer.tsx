import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { getBook, getEditionCatalog, getManifest, sourceCredit } from '../data';
import { downloadBlob } from '../media';
import { requirePermission } from '../permissions';
import { getPublication } from '../publication';
import type { Edition, Locale, Manifest, Reference } from '../types';
import { checkSpeakerSource, mergeCorrections, searchPublisherSpeeches, speakerEditorialDraft, validateCorrections } from './model';
import type { CorrectionProposal, PublisherSpeech, SpeakerAnnotation, SpeakerCorrections } from './model';
import { loadPublisherStudy, loadReviewedSpeakers, publisherCoverage } from './source';
import type { PublisherStudy } from './source';
import { useCorrections } from './useCorrections';
import CorrectionForm from './CorrectionForm';
import SpeechCollections from './SpeechCollections';
import type { CollectionCandidate } from './SpeechCollections';
import './speakers.css';

interface Props { reference: Reference; locale: Locale; onOpenReference: (reference: Reference) => void }
const dependencies = { getBook, getManifest, requirePermission };
const label = (reference: Reference) => `${reference.bookId} ${reference.chapter}:${reference.verse}`;

export default function SpeakerExplorer({ reference, locale, onOpenReference }: Props) {
  const [editionId, setEditionId] = useState(reference.editionId || 'eng-web'), [editions, setEditions] = useState<Edition[]>([]), [manifest, setManifest] = useState<Manifest | null>(null);
  const [bookId, setBookId] = useState(''), [query, setQuery] = useState(''), [limit, setLimit] = useState(30), [loading, setLoading] = useState(false), [progress, setProgress] = useState('');
  const [study, setStudy] = useState<{ key: string; data: PublisherStudy } | null>(null), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<PublisherSpeech | null>(null), [importPreview, setImportPreview] = useState<SpeakerCorrections | null>(null), [fileBusy, setFileBusy] = useState(false);
  const [reviewed, setReviewed] = useState<{ key: string; status: string; records: (SpeakerAnnotation & { text: string })[]; blocked: number }>({ key: '', status: 'Loading review publication…', records: [], blocked: 0 });
  const controller = useRef<AbortController | null>(null), generation = useRef(0), store = useCorrections(), fileLock = useRef(false), fileGuard = useRef(false);
  const suggestionTrigger = useRef<HTMLButtonElement | null>(null);
  const [collectionCandidate, setCollectionCandidate] = useState<CollectionCandidate | null>(null), [collectionsBusy, setCollectionsBusy] = useState(false);
  const collectionTrigger = useRef<HTMLButtonElement | null>(null), collectionRequest = useRef(0);
  fileGuard.current = fileBusy || store.busy;
  const key = `${editionId}:${bookId}`, index = publisherCoverage.editions.find(row => row.editionId === editionId), current = study?.key === key ? study.data : null;
  const deferredQuery = useDeferredValue(query), results = useMemo(() => searchPublisherSpeeches(current?.speeches || [], deferredQuery), [current, deferredQuery]);

  useEffect(() => {
    let active = true;
    getEditionCatalog().then(catalog => { if (active) setEditions(catalog.editions.filter(edition => edition.corpus === 'bible')); }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Edition information is unavailable.'); });
    const guard = (event: Event) => { if (fileGuard.current) event.preventDefault(); };
    window.addEventListener('adigun:before-navigation', guard); window.addEventListener('adigun:before-update', guard);
    return () => { active = false; generation.current++; controller.current?.abort(); window.removeEventListener('adigun:before-navigation', guard); window.removeEventListener('adigun:before-update', guard); };
  }, []);
  useEffect(() => {
    let active = true;
    getManifest(editionId).then(value => { if (active) setManifest(value); }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'The source manifest is unavailable.'); });
    void getPublication().then(async publication => {
      if (!publication) { if (active) setReviewed({ key: editionId, status: 'The editorial publication could not be verified. No speaker review is claimed.', records: [], blocked: 0 }); return; }
      const result = await loadReviewedSpeakers(publication, editionId, dependencies);
      if (active) setReviewed({ key: editionId, status: 'verified', ...result });
    }).catch(() => { if (active) setReviewed({ key: editionId, status: 'Reviewed source annotations are unavailable for this edition.', records: [], blocked: 0 }); });
    return () => { active = false; };
  }, [editionId]);

  function clearScan() { generation.current++; controller.current?.abort(); setStudy(null); setLoading(false); setProgress(''); setError(''); setNotice(''); setLimit(30); }
  function switchEdition(next: string) {
    if (!window.dispatchEvent(new Event('adigun:before-navigation', { cancelable: true }))) return;
    clearScan(); setSelected(null); setManifest(null); setBookId(''); setEditionId(next);
  }
  async function load() {
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort; const run = ++generation.current;
    setLoading(true); setError(''); setStudy(null); setLimit(30); setProgress('Checking publisher metadata and source permissions…');
    try {
      const data = await loadPublisherStudy(editionId, bookId, dependencies, abort.signal, (done, total) => { if (run === generation.current) setProgress(`Opened ${done} of ${total} books containing publisher markings.`); });
      if (run === generation.current) { setStudy({ key, data }); setProgress(`Loaded ${data.speeches.length.toLocaleString()} publisher-marked spans from ${data.examinedBooks} books.`); }
    } catch (cause) { if (run === generation.current) setError(cause instanceof Error ? cause.message : 'Publisher speech could not be loaded.'); }
    finally { if (run === generation.current) setLoading(false); }
  }
  function suggest(speech: PublisherSpeech, trigger: HTMLButtonElement) { if (window.dispatchEvent(new Event('adigun:before-navigation', { cancelable: true }))) { suggestionTrigger.current = trigger; setSelected(speech); } }
  function closeCorrection() { setSelected(null); requestAnimationFrame(() => { if (suggestionTrigger.current?.isConnected) suggestionTrigger.current.focus(); }); }
  function collect(speech: PublisherSpeech, trigger: HTMLButtonElement) { collectionTrigger.current = trigger; setCollectionCandidate({ speech, request: ++collectionRequest.current }); }
  function clearCollectionCandidate() { setCollectionCandidate(null); requestAnimationFrame(() => { if (collectionTrigger.current?.isConnected) collectionTrigger.current.focus({ preventScroll: true }); }); }
  async function verifyProposal(proposal: CorrectionProposal) {
    const ref = proposal.annotation.reference, source = await getManifest(ref.editionId), book = await getBook(ref.bookId, ref.editionId);
    const verse = book.chapters.find(chapter => chapter.number === ref.chapter)?.verses.find(verse => verse.number === ref.verse);
    if (!verse) throw new Error(`The source for ${label(ref)} is unavailable. Nothing was imported.`);
    await checkSpeakerSource(proposal.annotation, source.edition, verse.text);
  }
  async function previewImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file || fileLock.current || !store.state) return;
    fileLock.current = true; setFileBusy(true); setError(''); setImportPreview(null); setNotice('');
    try {
      if (file.size > 2_000_000) throw new Error('Choose a correction backup smaller than 2 MB.');
      const incoming = validateCorrections(JSON.parse(await file.text()));
      mergeCorrections(store.state, incoming);
      for (const proposal of incoming.proposals) await verifyProposal(proposal);
      setImportPreview(incoming);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'This backup is invalid. Existing proposals have not been changed.'); }
    finally { fileLock.current = false; setFileBusy(false); }
  }
  async function exportDraft(proposal: CorrectionProposal) {
    if (fileLock.current) return;
    fileLock.current = true; setFileBusy(true); setError('');
    try { await verifyProposal(proposal); downloadBlob(new Blob([JSON.stringify({ schemaVersion: 1, proposalReason: proposal.reason, editorialDraft: speakerEditorialDraft(proposal.annotation) }, null, 2)], { type: 'application/json' }), `Adigun-AiBible-speaker-review-${proposal.id}.json`); setNotice('Downloaded an unapproved editorial draft. Nothing was sent or published.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The source could not be verified for export.'); }
    finally { fileLock.current = false; setFileBusy(false); }
  }

  const reviewedRecords = reviewed.key === editionId ? reviewed.records : [];
  return <div className="page speaker-page" lang="en">
    <header className="page-heading"><span className="eyebrow">EXACT WORDS. VISIBLE EVIDENCE.</span><h1>Speaker Explorer</h1><p>Explore the words marked as Jesus’ speech by a publisher, open their full context, and keep proposed corrections privately. Publisher red letters and independently reviewed speaker assignments are separate layers.</p></header>
    {locale !== 'en' && <p className="speaker-help">(EN fallback) · Speaker-tool controls await reviewed translation. Source wording keeps its edition and language.</p>}
    <section className="panel" aria-label="Publisher speech search">
      <h2>Publisher-marked words of Jesus</h2>
      <div className="speaker-filters"><label>Speech source edition<select value={editionId} onChange={event => switchEdition(event.target.value)}>{editions.length ? editions.map(edition => <option key={edition.id} value={edition.id}>{edition.name} · {(publisherCoverage.editions.find(row => row.editionId === edition.id)?.totalSpans || 0).toLocaleString()} publisher spans</option>) : <option value={editionId}>{editionId}</option>}</select></label><label>Book scope<select value={bookId} onChange={event => { clearScan(); setBookId(event.target.value); }}><option value="">All books with supplied markings</option>{manifest?.edition.id === editionId && manifest.books.map(book => <option key={book.id} value={book.id}>{book.name} · {index?.books.find(row => row.bookId === book.id)?.spans || 0} spans</option>)}</select></label></div>
      <p className="speaker-help">{index ? `${index.totalSpans.toLocaleString()} publisher spans across ${index.totalVerses.toLocaleString()} verses in this imported revision.` : 'No coverage audit is available for this edition.'} Missing markings do not mean that Jesus never speaks in that book. No speech is inferred from keywords or book authorship.</p>
      <div className="speaker-actions"><button type="button" className="primary" disabled={loading || manifest?.edition.id !== editionId} onClick={() => void load()}>Load publisher-marked speech</button>{loading && <button type="button" className="secondary" onClick={() => controller.current?.abort()}>Cancel speech loading</button>}</div>
      {progress && <p role="status">{progress}</p>}
      {current && <><label>Find words in marked speech<input maxLength={200} value={query} onChange={event => { setQuery(event.target.value); setLimit(30); }} placeholder="A phrase within the marked source words"/></label><p className="speaker-help">Phrase matching ignores case and accents. Displayed source text is unchanged. Search covers only the loaded publisher-marked spans.</p><p>{results.length.toLocaleString()} matching spans · showing {Math.min(limit, results.length)}.</p></>}
      {current && !current.speeches.length && <p className="speaker-empty">This imported source supplies no Jesus-speech markings in this scope. Choose an edition with supplied publisher annotations to browse them. This is an annotation-availability state, not a finding that a speaker is absent.</p>}
      {current?.issues.length ? <p className="speaker-warning">{current.issues.length} source-metadata issues were excluded from marked-speech display.</p> : null}
    </section>
    <SpeechCollections candidate={collectionCandidate} onClearCandidate={clearCollectionCandidate} onBusyChange={setCollectionsBusy} onOpenReference={onOpenReference}/>
    <div className="speaker-results">{results.slice(0, limit).map(speech => <article className="panel speaker-result" key={speech.id}>
      <div className="speaker-result-heading"><h3>{speech.bookName} {speech.reference.chapter}:{speech.reference.verse}</h3><span className="speaker-badge">Publisher annotation · not independent review</span></div>
      <blockquote lang={speech.edition.language}>{speech.text}</blockquote><p className="speaker-help">{speech.edition.name} · Marked span {speech.start + 1}–{speech.end}</p>
      <details><summary>Read the complete source verse</summary><p className="speaker-full-verse" lang={speech.edition.language}>{Array.from(speech.fullVerse).slice(0, speech.start).join('')}<mark>{speech.text}</mark>{Array.from(speech.fullVerse).slice(speech.end).join('')}</p></details>
      <div className="speaker-actions"><button type="button" className="secondary" onClick={() => onOpenReference(speech.reference)}>Open full context</button><button type="button" className="secondary" disabled={collectionsBusy} onClick={event => collect(speech, event.currentTarget)}>Collect marked speech</button><button type="button" className="text-button" disabled={!store.state || store.busy} onClick={event => suggest(speech, event.currentTarget)}>Suggest correction</button></div>
    </article>)}</div>
    {results.length > limit && <button type="button" className="secondary" onClick={() => setLimit(value => value + 30)}>Show 30 more marked spans</button>}
    {current && <details className="speaker-source-credit"><summary>Publisher source and revision</summary><pre>{sourceCredit(current.edition)}</pre><p>Source revision: {current.edition.sha256}</p><p>These are publisher-supplied <code>wj</code> spans. No editor approval is inferred from the marker.</p></details>}
    {selected && <CorrectionForm key={selected.id} speech={selected} storageBusy={store.busy || fileBusy} onSave={proposal => store.commit(previous => ({ ...previous, proposals: [...previous.proposals, proposal] }))} onClose={closeCorrection}/>}
    <section className="panel speaker-reviewed" aria-label="Independent speaker review coverage"><h2>Reviewed speaker collections</h2>
      {reviewed.key !== editionId ? <p role="status">Checking reviewed annotations…</p> : reviewed.status !== 'verified' ? <p>{reviewed.status}</p> : <><p>{reviewedRecords.length} independently approved annotations for this edition passed their source checks.</p>{!reviewedRecords.length && <p>Reviewed collections for Moses, individual prophets, apostles, narrators and other speakers are not available yet. The publisher layer above does not establish those assignments.</p>}</>}
      {reviewed.blocked > 0 && <p className="speaker-warning">{reviewed.blocked} published annotations could not be matched to the current source revision and are not displayed.</p>}
      {reviewedRecords.map(annotation => <article key={annotation.id}><h3>{annotation.speakerId} · {label(annotation.reference)}</h3><p>Attribution: {annotation.uncertainty}. {annotation.quotedSpeakerId ? `Quoted speaker: ${annotation.quotedSpeakerId}.` : ''} Audience: {annotation.audience.join(', ') || 'Unspecified'}.</p><blockquote lang={manifest?.edition.language}>{annotation.text}</blockquote><p className="speaker-help">Human review: {annotation.review.reviewerId}, {annotation.review.reviewedAt}.</p><button type="button" className="secondary" onClick={() => onOpenReference(annotation.reference)}>Read reviewed source context</button></article>)}
    </section>
    <section className="panel speaker-private" aria-label="Private speaker corrections"><h2>My correction proposals</h2><p className="speaker-help">Private drafts contain your writing and source identifiers, not a copied Bible corpus. They do not change Scripture, publisher metadata or published review status.</p><p role="status">{store.status}</p>
      {store.error && <p role="alert">{store.error}</p>}
      <div className="speaker-actions"><button type="button" className="secondary" disabled={store.busy || fileBusy} onClick={() => void store.reload()}>Reload private corrections</button>{store.state && <button type="button" className="secondary" disabled={store.busy || fileBusy} onClick={() => downloadBlob(new Blob([JSON.stringify(store.state, null, 2)], { type: 'application/json' }), 'Adigun-AiBible-speaker-corrections.json')}>Download correction backup</button>}</div>
      <label>Restore correction backup<input type="file" accept="application/json,.json" disabled={!store.state || store.busy || fileBusy} onChange={event => void previewImport(event)}/></label>
      {importPreview && <div className="speaker-import-preview"><p>{importPreview.proposals.length} verified draft proposals in this backup. Matching IDs are kept once; a conflicting ID prevents import. Existing proposals are retained.</p><button type="button" className="primary" disabled={store.busy || fileBusy} onClick={async () => { if (await store.commit(previous => mergeCorrections(previous, importPreview))) setImportPreview(null); }}>Merge correction backup</button><button type="button" className="secondary" onClick={() => setImportPreview(null)}>Cancel restore</button></div>}
      {store.state && !store.state.proposals.length && <p>No private corrections saved yet.</p>}
      {store.state?.proposals.map(proposal => <article className="speaker-proposal" key={proposal.id}><h3>{label(proposal.annotation.reference)} · {proposal.annotation.speakerId}</h3><p className="speaker-badge">Private draft · human approval pending</p><p className="speaker-proposal-reason">{proposal.reason}</p><p className="speaker-help">{proposal.annotation.reference.editionId} · characters {proposal.annotation.start + 1}–{proposal.annotation.end} · {proposal.annotation.uncertainty}</p><div className="speaker-actions"><button type="button" className="secondary" onClick={() => onOpenReference(proposal.annotation.reference)}>Open proposal source</button><button type="button" className="secondary" disabled={fileBusy || store.busy} onClick={() => void exportDraft(proposal)}>Export draft for review</button><button type="button" className="text-button" disabled={fileBusy || store.busy} onClick={() => { if (window.confirm('Delete this private correction? Download a backup first if you want to keep it.')) void store.commit(previous => ({ ...previous, proposals: previous.proposals.filter(item => item.id !== proposal.id) })); }}>Delete correction</button></div></article>)}
    </section>
    {error && <p role="alert" className="speaker-error">{error}</p>}{notice && <p role="status">{notice}</p>}
  </div>;
}

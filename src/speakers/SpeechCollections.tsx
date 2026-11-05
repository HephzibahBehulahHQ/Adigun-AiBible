import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { getBook, getManifest, sourceCredit } from '../data';
import { downloadBlob } from '../media';
import { requirePermission } from '../permissions';
import type { Reference } from '../types';
import type { PublisherSpeech } from './model';
import { MAX_SPEECH_COLLECTIONS, MAX_SPEECH_COLLECTION_BACKUP_BYTES, mergeSpeechCollections, moveSpeechEntry, parseSpeechCollectionsBackup, previewSpeechCollectionsImport, speechCollectionsBackup, validateSpeechCollection } from './collection-model';
import type { SpeechCollection, SpeechCollectionsState, SpeechPin } from './collection-model';
import { checkSpeechCollectionSources, loadPinnedSpeech, pinPublisherSpeech } from './collection-source';
import { useSpeechCollectionGuard, useSpeechCollections } from './useSpeechCollections';

export interface CollectionCandidate { speech: PublisherSpeech; request: number }
interface Props {
  candidate: CollectionCandidate | null;
  onClearCandidate: () => void;
  onBusyChange: (busy: boolean) => void;
  onOpenReference: (reference: Reference) => void;
}
interface RestorePreview { incoming: SpeechCollectionsState; baseline: string; counts: { added: number; identical: number; conflicts: number } }
type Removal = { kind: 'collection'; row: SpeechCollection; index: number } | { kind: 'entry'; before: SpeechCollection; after: SpeechCollection };
const dependencies = { getBook, getManifest, requirePermission };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const referenceLabel = (pin: SpeechPin) => `${pin.bookName} ${pin.reference.chapter}:${pin.reference.verse}`;
const changedAt = (row: SpeechCollection) => new Date(Math.max(Date.now(), Date.parse(row.updatedAt) + 1)).toISOString();

export default function SpeechCollections({ candidate, onClearCandidate, onBusyChange, onOpenReference }: Props) {
  const store = useSpeechCollections();
  const [active, setActive] = useState<SpeechCollection | null>(null), [title, setTitle] = useState('');
  const [opened, setOpened] = useState<PublisherSpeech | null>(null), [removed, setRemoved] = useState<Removal | null>(null);
  const [preview, setPreview] = useState<RestorePreview | null>(null), [conflict, setConflict] = useState<'' | 'keep-device' | 'use-backup'>('');
  const [working, setWorking] = useState(false), [preparing, setPreparing] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [contextRequest, setContextRequest] = useState<{ reference: Reference; sequence: number } | null>(null);
  const task = useRef<{ id: number; controller: AbortController; writing: boolean } | null>(null), sequence = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null), nameInput = useRef<HTMLInputElement>(null), speechHeading = useRef<HTMLHeadingElement>(null);
  const dirty = title !== (active?.title || ''), blocked = working || store.busy;
  const savedActive = store.state?.collections.find(row => row.id === active?.id);
  const stale = !!active && !!store.state && !same(active, savedActive);
  const previewStale = !!preview && !!store.state && preview.baseline !== JSON.stringify(store.state.collections);
  useSpeechCollectionGuard(dirty, working || store.saving);
  useEffect(() => { onBusyChange(blocked); }, [blocked, onBusyChange]);
  useEffect(() => () => { sequence.current++; task.current?.controller.abort(); }, []);
  useEffect(() => {
    if (candidate) { heading.current?.focus({ preventScroll: true }); heading.current?.scrollIntoView({ block: 'start' }); }
  }, [candidate]);
  useEffect(() => { if (opened) speechHeading.current?.focus({ preventScroll: true }); }, [opened]);
  useEffect(() => {
    if (!contextRequest || blocked) return;
    setContextRequest(null);
    if (contextRequest.sequence === sequence.current && !task.current) onOpenReference(contextRequest.reference);
  }, [contextRequest, blocked, onOpenReference]);

  async function run<T>(work: (signal: AbortSignal, check: () => void, commit: typeof store.commit) => Promise<T>): Promise<T | null> {
    if (task.current || store.busy) return null;
    const operation = { id: ++sequence.current, controller: new AbortController(), writing: false };
    task.current = operation; setWorking(true); setPreparing(true); setError(''); setNotice('');
    const check = () => { if (operation.controller.signal.aborted || operation.id !== sequence.current) throw new Error('Speech source check cancelled. Saved collections and your draft are unchanged.'); };
    const commit: typeof store.commit = async change => {
      check(); operation.writing = true; setPreparing(false);
      return store.commit(change);
    };
    try { const result = await work(operation.controller.signal, check, commit); check(); return result; }
    catch (reason) { if (operation.id === sequence.current) setError(reason instanceof Error ? reason.message : 'The collection action could not be completed.'); return null; }
    finally { if (operation.id === sequence.current) { task.current = null; setWorking(false); setPreparing(false); } }
  }
  function cancel() {
    if (!task.current || task.current.writing) return;
    task.current.controller.abort(); sequence.current++; task.current = null;
    setWorking(false); setPreparing(false); setNotice('Speech source check cancelled. Saved collections, the draft and any earlier restore preview are unchanged.');
  }
  function assertRow(state: SpeechCollectionsState, row: SpeechCollection) {
    if (!same(state.collections.find(value => value.id === row.id), row)) throw new Error('This collection changed since you opened it. Your name draft is retained. Open the saved version or save the name as a new collection.');
  }
  function mayReplace() { return !task.current && !store.busy && (!dirty || window.confirm('Discard this unsaved collection name? Download the draft first if you need to keep it.')); }
  function open(row: SpeechCollection | null) {
    if (!mayReplace()) return;
    setActive(row); setTitle(row?.title || ''); setOpened(null); setError('');
    requestAnimationFrame(() => nameInput.current?.focus({ preventScroll: true }));
  }
  function adopt(next: SpeechCollectionsState, id: string, replaceTitle = false) {
    const row = next.collections.find(value => value.id === id) || null;
    setActive(row); if (replaceTitle) setTitle(row?.title || '');
  }
  async function saveName(asNew = false) {
    const previous = active, now = new Date().toISOString(), id = !previous || asNew ? `speech-${crypto.randomUUID()}` : previous.id;
    const next = await run(async (_signal, _check, commit) => {
      const row = validateSpeechCollection({ id, title: title.trim(), entries: previous?.entries || [], createdAt: !previous || asNew ? now : previous.createdAt, updatedAt: !previous || asNew ? now : changedAt(previous) });
      return commit(state => {
        if (previous && !asNew) assertRow(state, previous);
        return { ...state, collections: previous && !asNew ? state.collections.map(value => value.id === id ? row : value) : [...state.collections, row] };
      });
    });
    if (next) { adopt(next, id, true); setNotice(previous && !asNew ? 'Collection name saved on this device.' : 'Private collection created. Add publisher-marked speech from the results below.'); }
  }
  async function addSpeech() {
    if (!active || !candidate) return;
    const target = active, request = candidate.request, speech = candidate.speech;
    const next = await run(async (signal, check, commit) => {
      const pin = await pinPublisherSpeech(speech, dependencies, signal); check();
      return commit(state => {
        assertRow(state, target);
        if (target.entries.some(value => value.id === pin.id)) throw new Error('This exact marked span is already in the collection. Nothing was added twice.');
        return { ...state, collections: state.collections.map(row => row.id === target.id ? { ...row, entries: [...row.entries, pin], updatedAt: changedAt(row) } : row) };
      });
    });
    if (next) { adopt(next, target.id); if (candidate.request === request) onClearCandidate(); setNotice('Exact publisher-marked span added. The collection contains source references; it does not create an editorial review.'); }
  }
  async function move(pin: SpeechPin, delta: -1 | 1) {
    if (!active) return;
    const row = active;
    const next = await run(async (_signal, _check, commit) => commit(state => {
      assertRow(state, row);
      return { ...state, collections: state.collections.map(value => value.id === row.id ? { ...moveSpeechEntry(value, pin.id, delta), updatedAt: changedAt(value) } : value) };
    }));
    if (next) { adopt(next, row.id); setNotice('Speech order saved.'); }
  }
  async function removeEntry(pin: SpeechPin) {
    if (!active) return;
    const before = active;
    const next = await run(async (_signal, _check, commit) => commit(state => {
      assertRow(state, before);
      return { ...state, collections: state.collections.map(row => row.id === before.id ? { ...row, entries: row.entries.filter(value => value.id !== pin.id), updatedAt: changedAt(row) } : row) };
    }));
    if (next) { const after = next.collections.find(row => row.id === before.id)!; setRemoved({ kind: 'entry', before, after }); adopt(next, before.id); if (opened?.id === pin.id) setOpened(null); setNotice('Saved speech removed. Undo is available until another removal.'); }
  }
  async function deleteCollection() {
    if (!active || !mayReplace() || !window.confirm('Delete this private speech collection? You can undo the last removal while this view stays open.')) return;
    const row = active; let index = 0;
    const next = await run(async (_signal, _check, commit) => commit(state => {
      assertRow(state, row); index = state.collections.findIndex(value => value.id === row.id);
      return { ...state, collections: state.collections.filter(value => value.id !== row.id) };
    }));
    if (next) { setRemoved({ kind: 'collection', row, index }); setActive(null); setTitle(''); setOpened(null); setNotice('Private collection deleted. Undo is available.'); }
  }
  async function undo() {
    if (!removed) return;
    const removal = removed;
    const next = await run(async (_signal, _check, commit) => commit(state => {
      if (removal.kind === 'entry') {
        if (!same(state.collections.find(row => row.id === removal.after.id), removal.after)) throw new Error('The collection changed after removal. Undo would overwrite newer work, so nothing was changed. Your saved backup remains available.');
        return { ...state, collections: state.collections.map(row => row.id === removal.after.id ? { ...removal.before, updatedAt: changedAt(row) } : row) };
      }
      if (state.collections.some(row => row.id === removal.row.id)) throw new Error('A collection with this identity already exists. Undo did not overwrite it.');
      const collections = [...state.collections]; collections.splice(Math.min(removal.index, collections.length), 0, removal.row);
      return { ...state, collections };
    }));
    if (next) {
      if (removal.kind === 'entry' && active?.id === removal.after.id && same(active, removal.after)) adopt(next, removal.after.id);
      setRemoved(null); setNotice('Last removal restored. Your current name draft is unchanged.');
    }
  }
  async function read(pin: SpeechPin, context = false) {
    if (task.current || store.busy) return;
    setOpened(null);
    const speech = await run(async (signal, check) => { const result = await loadPinnedSpeech(pin, dependencies, signal); check(); return result; });
    if (!speech) return;
    if (context) setContextRequest({ reference: speech.reference, sequence: sequence.current });
    else { setOpened(speech); setNotice('Saved source revision, full verse and publisher markings verified.'); }
  }
  function downloadBackup() {
    if (!store.state) return;
    try { downloadBlob(new Blob([speechCollectionsBackup(store.state)], { type: 'application/json' }), 'Adigun-AiBible-speech-collections.json'); setNotice('Saved collection metadata downloaded. Unsaved names and Scripture text are excluded.'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Collection backup could not be prepared.'); }
  }
  function downloadDraft() {
    const lines = [title || 'Untitled speech collection', '', 'PRIVATE DRAFT · user-entered name and saved source references', 'This text file is recovery material, not an importable source-verified backup.', '', ...(active?.entries || []).map(pin => `${referenceLabel(pin)} · ${pin.editionName}\nUnicode code points ${pin.start + 1}–${pin.end} · publisher wj marking\nEdition SHA-256: ${pin.editionSha256}\nFull verse SHA-256: ${pin.sourceTextHash}`)];
    try { downloadBlob(new Blob([lines.join('\n\n')], { type: 'text/plain;charset=utf-8' }), 'Adigun-AiBible-speech-collection-draft.txt'); setNotice('Collection name draft and saved source references downloaded. Nothing was saved in the app.'); }
    catch { setError('Draft download was unavailable. Keep this view open and copy your collection name.'); }
  }
  async function prepareRestore(incoming: SpeechCollectionsState) {
    if (!store.state) return;
    const baseline = JSON.stringify(store.state.collections), counts = previewSpeechCollectionsImport(store.state, incoming);
    const result = await run(async (signal, check) => { await checkSpeechCollectionSources(incoming, dependencies, signal); check(); return { incoming, baseline, counts }; });
    if (result) { setPreview(result); setConflict(''); setNotice('Backup sources verified. Review the import before changing saved collections.'); }
  }
  async function chooseBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file || !store.state) return;
    const current = store.state;
    const result = await run(async (signal, check) => {
      if (file.size > MAX_SPEECH_COLLECTION_BACKUP_BYTES) throw new Error('Choose a speech collection backup no larger than 2 MiB.');
      const raw = await file.text(); check();
      const incoming = parseSpeechCollectionsBackup(raw), counts = previewSpeechCollectionsImport(current, incoming);
      await checkSpeechCollectionSources(incoming, dependencies, signal); check();
      return { incoming, baseline: JSON.stringify(current.collections), counts };
    });
    if (result) { setPreview(result); setConflict(''); setNotice('Backup sources verified. Review the import before changing saved collections.'); }
  }
  async function restore() {
    if (!preview || preview.counts.conflicts && !conflict) return;
    const prepared = preview;
    const next = await run(async (signal, check, commit) => {
      await checkSpeechCollectionSources(prepared.incoming, dependencies, signal); check();
      return commit(state => {
        if (JSON.stringify(state.collections) !== prepared.baseline) throw new Error('Saved collections changed after this preview. Refresh the restore preview before merging.');
        return mergeSpeechCollections(state, prepared.incoming, conflict || 'keep-device');
      });
    });
    if (next) { setPreview(null); setOpened(null); setNotice('Collection backup merged. An open name draft is retained; reopen a changed saved collection before editing it.'); }
  }

  return <section className="panel speech-collections" aria-label="Private speech collections">
    <div className="speech-collection-heading"><div><span className="eyebrow">YOUR STUDY, ON THIS DEVICE</span><h2 ref={heading} tabIndex={-1}>My speech collections</h2></div><span className="speaker-badge">Private selection · publisher annotations</span></div>
    <p className="speaker-help">Keep named, ordered selections of exact publisher-marked spans. Your names stay on this device. Collections do not assign new speakers or claim independent review. Backups contain references and source fingerprints, not a copied Bible.</p>
    <p role="status">{store.status}</p>{store.error && <p role="alert">{store.error}</p>}
    <div className="speech-collection-layout">
      <div className="speech-collection-list"><h3>Saved collections</h3>
        {store.state && !store.state.collections.length && <p className="speaker-help">No collections yet. Name one, then collect a marked span from the results.</p>}
        <ul>{store.state?.collections.map(row => <li key={row.id}><button type="button" className={row.id === active?.id ? 'secondary selected' : 'text-button'} aria-label={`Open collection ${row.title}`} aria-current={row.id === active?.id ? 'true' : undefined} disabled={blocked} onClick={() => open(row)}><span>{row.title}</span><small>{row.entries.length} saved spans</small></button></li>)}</ul>
        <button type="button" className="secondary" disabled={blocked} onClick={() => open(null)}>New speech collection</button>
      </div>
      <div className="speech-collection-editor">
        <form onSubmit={event => { event.preventDefault(); void saveName(); }}><label>Collection name<input ref={nameInput} maxLength={160} value={title} disabled={blocked} onChange={event => setTitle(event.target.value)}/></label>
          <p className="speaker-help">{dirty ? 'Unsaved name. Save or download the draft before leaving.' : active ? 'This name matches the opened saved collection.' : 'Choose a name for your private selection.'}</p>
          <div className="speaker-actions"><button type="submit" className="primary" disabled={blocked || !store.state || (!active && store.state.collections.length >= MAX_SPEECH_COLLECTIONS)}>{active ? 'Save collection name' : 'Create collection'}</button>{active && <button type="button" className="secondary" disabled={blocked || !store.state || store.state.collections.length >= MAX_SPEECH_COLLECTIONS} onClick={() => void saveName(true)}>Save name as new collection</button>}</div>
        </form>
        {stale && <div className="speaker-warning"><p>This collection changed since you opened it. Your name draft is retained. Reopen the saved version, or save the name and existing references as a new collection.</p><button type="button" className="secondary" disabled={blocked} onClick={() => open(savedActive || null)}>Open saved version</button></div>}
        {candidate && <section className="speech-collection-candidate" aria-label="Speech to collect"><h3>Add a marked span</h3><p>{candidate.speech.bookName} {candidate.speech.reference.chapter}:{candidate.speech.reference.verse} · {candidate.speech.edition.name}</p><p className="speaker-help">Publisher <code>wj</code> marking · characters {candidate.speech.start + 1}–{candidate.speech.end}. {active ? `Destination: ${active.title}.` : 'Create or open a saved collection first.'}</p><div className="speaker-actions"><button type="button" className="primary" disabled={blocked || !active || !store.state} onClick={() => void addSpeech()}>Add marked speech</button><button type="button" className="text-button" disabled={blocked} onClick={onClearCandidate}>Cancel adding speech</button></div></section>}
        {active && <><h3>Ordered speech selection</h3>{!active.entries.length && <p className="speaker-help">This collection has no saved spans. Use Collect marked speech on a publisher result below.</p>}
          <ol className="speech-collection-entries">{active.entries.map((pin, index) => <li className="speech-collection-entry" data-speech-id={pin.id} key={pin.id}><h4>{referenceLabel(pin)}</h4><p className="speaker-help">{pin.editionName} · characters {pin.start + 1}–{pin.end} · publisher marking</p><div className="speaker-actions"><button type="button" className="secondary" disabled={blocked} onClick={() => void read(pin)}>Read saved speech</button><button type="button" className="text-button" disabled={blocked || index === 0} onClick={() => void move(pin, -1)}>Move speech earlier</button><button type="button" className="text-button" disabled={blocked || index === active.entries.length - 1} onClick={() => void move(pin, 1)}>Move speech later</button><button type="button" className="text-button" disabled={blocked} onClick={() => void removeEntry(pin)}>Remove saved speech</button></div></li>)}</ol>
          <button type="button" className="text-button" disabled={blocked} onClick={() => void deleteCollection()}>Delete collection</button>
        </>}
      </div>
    </div>
    {opened && <section className="speech-collection-source" aria-label="Saved speech and context"><h3 ref={speechHeading} tabIndex={-1}>{opened.bookName} {opened.reference.chapter}:{opened.reference.verse}</h3><span className="speaker-badge">Publisher annotation · not independent review</span><blockquote lang={opened.edition.language}>{opened.text}</blockquote><h4>Complete source verse</h4><p className="speaker-full-verse" lang={opened.edition.language}>{Array.from(opened.fullVerse).slice(0, opened.start).join('')}<mark>{opened.text}</mark>{Array.from(opened.fullVerse).slice(opened.end).join('')}</p><details><summary>Saved source and publisher provenance</summary><pre>{sourceCredit(opened.edition)}</pre><p>Source revision: {opened.edition.sha256}</p><p>Exact publisher <code>wj</code> boundaries in Unicode code points. This is your private selection of publisher metadata.</p></details><div className="speaker-actions"><button type="button" className="secondary" disabled={blocked} onClick={() => { const pin = active?.entries.find(value => value.id === opened.id); if (pin) void read(pin, true); }}>Open saved speech context</button><button type="button" className="text-button" disabled={blocked} onClick={() => setOpened(null)}>Close saved speech</button></div></section>}
    <div className="speaker-actions"><button type="button" className="secondary" disabled={blocked} onClick={() => void store.reload()}>Reload saved collections</button><button type="button" className="secondary" disabled={!store.state} onClick={downloadBackup}>Download collection backup</button><button type="button" className="secondary" onClick={downloadDraft}>Download collection draft</button>{removed && <button type="button" className="secondary" disabled={blocked || !store.state} onClick={() => void undo()}>Undo last removal</button>}</div>
    <label>Restore collection backup<input type="file" accept="application/json,.json" disabled={blocked || !store.state} onChange={event => void chooseBackup(event)}/></label>
    {preview && <section className="speaker-import-preview" aria-label="Speech collection restore preview"><h3>Review collection restore</h3><p>{preview.counts.added} new · {preview.counts.identical} identical · {preview.counts.conflicts} conflicting collections. Existing collections are retained. Source wording and publisher markings were checked; no review approval is imported.</p>{preview.counts.conflicts > 0 && <label>Restore conflicts<select value={conflict} disabled={blocked} onChange={event => setConflict(event.target.value as typeof conflict)}><option value="">Choose for conflicting collection IDs</option><option value="keep-device">Keep the device version</option><option value="use-backup">Use the backup version</option></select></label>}{previewStale && <p className="speaker-warning">Saved collections changed. Refresh this preview before merging.</p>}<div className="speaker-actions"><button type="button" className="primary" disabled={blocked || previewStale || !!preview.counts.conflicts && !conflict} onClick={() => void restore()}>Merge collection backup</button><button type="button" className="secondary" disabled={blocked} onClick={() => void prepareRestore(preview.incoming)}>Refresh restore preview</button><button type="button" className="text-button" disabled={blocked} onClick={() => setPreview(null)}>Cancel restore</button></div></section>}
    {preparing && <div className="speaker-actions"><p role="status">Checking saved source identities…</p><button type="button" className="secondary" onClick={cancel}>Cancel source check</button></div>}
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <p className="speaker-help">For offline reading, download the source book in Settings first. Collection backups do not contain Scripture or download an edition automatically. Browser storage is best effort; keep a backup. Public curated collections, new speaker assignments, schedules and audio playlists remain separate features.</p>
  </section>;
}

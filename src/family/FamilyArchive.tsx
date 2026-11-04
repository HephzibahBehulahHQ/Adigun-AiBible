import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Edition, Reference } from '../types';
import { getBook, getEditionCatalog, getManifest } from '../data';
import { parseReference, refKey } from '../domain';
import { emptyFamilyArchive, familyBackupSize, familyCategories, familyFingerprint, filterFamilyItems, MAX_FAMILY_TEXT, parseCaptions, prepareFamilyAttachment, validateFamilyItem } from './model';
import type { FamilyAttachment, FamilyCategory, FamilyFilter, FamilyItem, FamilyPassage } from './model';
import { familyBackup, mergeFamilyArchive, previewFamilyBackup, summarizeFamilyImport } from './backup';
import type { FamilyConflictPolicy, FamilyImportPreview } from './backup';
import { useFamilyArchive } from './useFamilyArchive';
import { useFamilyGuard } from './useFamilyGuard';
import FamilyMedia, { downloadFamilyBlob, familySize } from './FamilyMedia';
import FamilyRecorder from './FamilyRecorder';
import './family.css';

const categoryLabels: Record<FamilyCategory, string> = { memory: 'Written memory', testimony: 'Testimony', explanation: 'Verse explanation', family_record: 'Family photograph or document' };
interface FamilyDraft {
  title: string; person: string; occurredOn: string; category: FamilyCategory; collection: string; topics: string;
  body: string; transcript: string; captionsVtt: string; passages: FamilyPassage[]; attachment?: FamilyAttachment;
  basis: FamilyItem['consent']['basis']; grantedBy: string; consentNote: string; consentConfirmed: boolean;
  stewardNote: string; visibility: FamilyItem['visibility'];
}
const blankDraft = (): FamilyDraft => ({ title: '', person: '', occurredOn: '', category: 'memory', collection: '', topics: '', body: '', transcript: '', captionsVtt: '', passages: [], basis: 'own_work', grantedBy: '', consentNote: '', consentConfirmed: false, stewardNote: '', visibility: 'private' });
const referenceInput = (ref: Reference) => `${ref.bookId} ${ref.chapter}:${ref.verse}${ref.endVerse && ref.endVerse !== ref.verse ? `-${ref.endVerse}` : ''}`;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'This operation could not be completed.';

export default function FamilyArchive({ reference, onOpenReference }: { reference: Reference; onOpenReference: (reference: Reference) => void }) {
  const archive = useFamilyArchive();
  const [draft, setDraft] = useState<FamilyDraft>(blankDraft);
  const [editing, setEditing] = useState<FamilyItem | null>(null);
  const [dirty, setDirty] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [fileBusy, setFileBusy] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [formGeneration, setFormGeneration] = useState(0);
  const [editions, setEditions] = useState<Edition[]>([]);
  const [passageText, setPassageText] = useState(() => referenceInput(reference));
  const [passageEdition, setPassageEdition] = useState(reference.editionId || 'eng-web');
  const [filter, setFilter] = useState<FamilyFilter>({ query: '', person: '', collection: '', from: '', to: '', showHidden: false });
  const [limit, setLimit] = useState(20);
  const [preview, setPreview] = useState<FamilyImportPreview | null>(null);
  const [importError, setImportError] = useState('');
  const [conflicts, setConflicts] = useState<FamilyConflictPolicy>('keep-device');
  const [deleteItem, setDeleteItem] = useState<string | null>(null);
  const [deleteAll, setDeleteAll] = useState(false);
  const fileGeneration = useRef(0);
  const importGeneration = useRef(0);
  const mounted = useRef(true);
  const busy = archive.busy || fileBusy || backupBusy || linkBusy;
  useFamilyGuard(dirty, busy, recording);

  useEffect(() => {
    mounted.current = true;
    void getEditionCatalog().then(catalog => { if (mounted.current) setEditions(catalog.editions.filter(edition => edition.corpus === 'bible')); }).catch(() => { /* Passage linking reports exact source errors when requested. */ });
    return () => { mounted.current = false; fileGeneration.current++; importGeneration.current++; };
  }, []);

  function updateDraft(patch: Partial<FamilyDraft>) { setDraft(previous => ({ ...previous, ...patch })); setDirty(true); setFormError(''); }
  function updateFilter(patch: Partial<FamilyFilter>) { setFilter(previous => ({ ...previous, ...patch })); setLimit(20); }
  function clearForm() {
    fileGeneration.current++; setDraft(blankDraft()); setEditing(null); setDirty(false); setFormError(''); setFileBusy(false);
    setFormGeneration(value => value + 1); setPassageText(referenceInput(reference)); setPassageEdition(reference.editionId || 'eng-web');
  }
  function discardForm() { if (recording || busy) return; if (!dirty || window.confirm('Discard this unsaved family item? Saved archive items will remain.')) clearForm(); }
  function editItem(item: FamilyItem) {
    if (recording || busy || (dirty && !window.confirm('Replace the unsaved form with this saved family item?'))) return;
    fileGeneration.current++;
    setEditing(item);
    setDraft({ title: item.title, person: item.person, occurredOn: item.occurredOn || '', category: item.category, collection: item.collection, topics: item.topics.join(', '), body: item.body, transcript: item.transcript, captionsVtt: item.captionsVtt, passages: item.passages, attachment: item.attachment, basis: item.consent.basis, grantedBy: item.consent.grantedBy, consentNote: item.consent.note, consentConfirmed: true, stewardNote: item.stewardNote, visibility: item.visibility });
    setDirty(false); setFormError(''); setFormGeneration(value => value + 1);
    document.getElementById('family-title')?.focus();
  }

  async function chooseOriginal(file?: File) {
    if (!file || recording || busy) return;
    const run = ++fileGeneration.current;
    setFileBusy(true); setFormError('');
    try {
      const attachment = await prepareFamilyAttachment(file, file.name);
      if (mounted.current && run === fileGeneration.current) updateDraft({ attachment, consentConfirmed: false });
    } catch (error) { if (mounted.current && run === fileGeneration.current) setFormError(errorMessage(error)); }
    finally { if (mounted.current && run === fileGeneration.current) setFileBusy(false); }
  }

  async function chooseCaptions(file?: File) {
    if (!file || busy) return;
    const run = ++fileGeneration.current; setFileBusy(true); setFormError('');
    try {
      if (file.size > MAX_FAMILY_TEXT) throw new Error('Caption files must be 200 KB or smaller.');
      const text = await file.text(); parseCaptions(text);
      if (mounted.current && run === fileGeneration.current) updateDraft({ captionsVtt: text });
    } catch (error) { if (mounted.current && run === fileGeneration.current) setFormError(errorMessage(error)); }
    finally { if (mounted.current && run === fileGeneration.current) setFileBusy(false); }
  }

  async function addPassage() {
    if (busy || recording) return;
    const run = fileGeneration.current; setLinkBusy(true); setFormError('');
    try {
      const manifest = await getManifest(passageEdition);
      const parsed = parseReference(passageText, manifest.books);
      if (!parsed) throw new Error('Enter an existing book, chapter and verse or range, for example John 3:16–18.');
      const ref = { ...parsed, editionId: passageEdition };
      const book = await getBook(ref.bookId, passageEdition);
      const chapter = book.chapters.find(value => value.number === ref.chapter);
      const end = ref.endVerse || ref.verse;
      for (let verse = ref.verse; verse <= end; verse++) if (!chapter?.verses.some(row => row.number === verse && row.text.trim())) throw new Error(`Verse ${verse} has no source text in this edition. Choose a range containing available text.`);
      const label = `${book.name} ${ref.chapter}:${ref.verse}${end === ref.verse ? '' : `–${end}`} · ${manifest.edition.name}`;
      if (!mounted.current || run !== fileGeneration.current) return;
      if (draft.passages.length >= 30) throw new Error('A family item can link up to 30 passages.');
      if (draft.passages.some(link => refKey(link.reference) === refKey(ref))) throw new Error('This passage is already linked.');
      updateDraft({ passages: [...draft.passages, { reference: ref, label, ...(manifest.edition.sha256 ? { sourceSha256: manifest.edition.sha256 } : {}) }] });
    } catch (error) { if (mounted.current && run === fileGeneration.current) setFormError(errorMessage(error)); }
    finally { if (mounted.current && run === fileGeneration.current) setLinkBusy(false); }
  }

  async function saveItem(event: FormEvent, asNew = false) {
    event.preventDefault();
    if (busy || recording) return;
    setFormError(''); setNotice('');
    try {
      if (!draft.consentConfirmed) throw new Error('Confirm that you may keep and back up this item before saving it.');
      const now = new Date().toISOString();
      const samePermission = editing && editing.consent.basis === draft.basis && editing.consent.grantedBy === draft.grantedBy.trim() && editing.consent.note === draft.consentNote && editing.attachment?.sha256 === draft.attachment?.sha256;
      const item = validateFamilyItem({ schemaVersion: 1, id: editing && !asNew ? editing.id : crypto.randomUUID(), title: draft.title.trim(), person: draft.person.trim(), occurredOn: draft.occurredOn || null, category: draft.category, collection: draft.collection.trim(), topics: draft.topics.split(',').map(topic => topic.trim()).filter(Boolean), body: draft.body, transcript: draft.transcript, captionsVtt: draft.captionsVtt, passages: draft.passages, ...(draft.attachment ? { attachment: draft.attachment } : {}), consent: { basis: draft.basis, grantedBy: draft.grantedBy.trim(), confirmedAt: samePermission ? editing.consent.confirmedAt : now, note: draft.consentNote }, stewardNote: draft.stewardNote, visibility: draft.visibility, createdAt: editing && !asNew ? editing.createdAt : now, updatedAt: now });
      const saved = await archive.commit(previous => {
        if (editing && !asNew) {
          const original = previous.items.find(value => value.id === editing.id);
          if (!original || familyFingerprint(original) !== familyFingerprint(editing)) throw new Error('This item changed or was deleted after you opened it. Save this form as a new item, or reopen the current saved item before editing.');
        }
        return { ...previous, items: [...previous.items.filter(value => value.id !== item.id), item] };
      });
      if (saved) { clearForm(); setNotice(item.visibility === 'hidden' ? 'Family item saved and hidden from the normal list. Enable “Show hidden items” to find it.' : 'Family item saved. Its original files and your wording stay on this device.'); }
    } catch (error) { setFormError(errorMessage(error)); }
  }

  async function exportBackup(item?: FamilyItem) {
    if (!archive.state || busy || recording) return;
    setBackupBusy(true); setNotice('Checking originals and preparing your private backup…');
    try {
      const blob = await familyBackup(item ? { ...archive.state, items: [item] } : archive.state);
      if (mounted.current) { downloadFamilyBlob(blob, `adigun-family-${item ? 'item' : 'archive'}-${new Date().toISOString().slice(0, 10)}.json`); setNotice('Your private backup download is ready. It contains saved writing, metadata and original files. Keep it somewhere you trust.'); }
    } catch (error) { if (mounted.current) setNotice(errorMessage(error)); }
    finally { if (mounted.current) setBackupBusy(false); }
  }

  async function readBackup(file?: File) {
    if (!file || !archive.state || busy || recording) return;
    const run = ++importGeneration.current; setBackupBusy(true); setImportError(''); setPreview(null);
    try {
      const next = await previewFamilyBackup(archive.state, file);
      if (mounted.current && run === importGeneration.current) { setPreview(next); setConflicts('keep-device'); }
    } catch (error) { if (mounted.current && run === importGeneration.current) setImportError(errorMessage(error)); }
    finally { if (mounted.current && run === importGeneration.current) setBackupBusy(false); }
  }

  const items = archive.state?.items || [];
  const matching = useMemo(() => filterFamilyItems(items, filter), [items, filter]);
  const people = [...new Set(items.map(item => item.person))].sort((a, b) => a.localeCompare(b));
  const collections = [...new Set(items.map(item => item.collection).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const importSummary = preview && archive.state ? summarizeFamilyImport(archive.state, preview.items) : null;
  const savedBytes = items.reduce((total, item) => total + (item.attachment?.size || 0), 0);

  return <div className="page family-page">
    <header className="page-heading"><span className="eyebrow">Keep the voices. Remember the story.</span><h1>Family Legacy Bible</h1><p>Preserve your family’s memories, testimonies and original recordings beside the passages that matter to you.</p></header>
    <section className="family-intro"><p><strong>Private to this browser.</strong> No recordings, photographs or writing are uploaded. Anyone with access to this browser profile may read them; local storage is not an encrypted vault.</p><p className="family-help">Browser cleanup or device loss can remove this copy. Export backups regularly. Family invitations, shared access and account recovery require a connected service and are not available here.</p><details><summary>Access, consent and recovery</summary><p>This app stores files in its own database on the shared GitHub Pages origin. Another compromised application on that same origin could access them. Use a separate, trusted browser profile for sensitive material.</p><p>Keep only work and recordings you are authorized to preserve. Hidden items are omitted from the normal list, without a password or permission boundary. Deleting an item removes this app’s device copy; it cannot revoke files already downloaded or shared elsewhere.</p><p>Steward notes record your wishes and recovery instructions. They do not grant another person technical access. Original voices are preserved without cloning or generating new messages.</p></details></section>
    <div className="family-status"><p role="status" aria-live="polite">{archive.status}</p><button type="button" className="secondary" disabled={busy || recording} onClick={() => void archive.reload()}>Reload saved items</button></div>
    {archive.error && <p className="family-error" role="alert">{archive.error}</p>}
    {notice && <p className="family-notice" role="status">{notice}</p>}
    {archive.state && <>
      <div className="family-stats"><span><strong>{items.length}</strong> saved {items.length === 1 ? 'item' : 'items'}</span><span><strong>{people.length}</strong> named {people.length === 1 ? 'person' : 'people'}</span><span><strong>{savedBytes ? familySize(savedBytes) : '0 bytes'}</strong> original files</span></div>
      <details className="family-card family-backup"><summary>Back up, restore or delete this archive</summary>
        <p>Backups include original files, hidden items, writing and consent records. They are unencrypted private JSON files. Unsaved form changes are not included. Reader notes and the personal workspace have separate backups.</p>
        <p className="family-help">Full backup size: {familySize(familyBackupSize(items))}. Limit: 128 MiB per archive; 32 MiB per original file. You can also back up individual saved items.</p>
        <div className="button-row"><button type="button" className="secondary" disabled={busy || recording} onClick={() => void exportBackup()}>Download family backup</button></div>
        <label>Preview family backup<input type="file" accept="application/json,.json" disabled={busy || recording} onChange={event => { void readBackup(event.target.files?.[0]); event.target.value = ''; }} /></label>
        {importError && <p className="family-error" role="alert">{importError}</p>}
        {importSummary && <section className="family-import" aria-label="Family import preview"><h3>Import preview</h3><p>{importSummary.added} new items · {importSummary.identical} identical duplicates · {importSummary.conflicts} conflicting items. Original file bytes: {importSummary.fileBytes ? familySize(importSummary.fileBytes) : 'none'}. All included files passed their checksum checks.</p><p className="family-help">Import merges records. It does not delete saved entries or change your current unsaved form.</p>{importSummary.conflicts > 0 && <label>Conflicting family record IDs<select aria-label="Conflicting family record IDs" disabled={busy} value={conflicts} onChange={event => setConflicts(event.target.value as FamilyConflictPolicy)}><option value="keep-device">Keep this device’s saved items</option><option value="use-import">Use the backup’s conflicting items</option></select></label>}<div className="button-row"><button type="button" className="primary" disabled={busy || recording} onClick={async () => { if (await archive.commit(previous => mergeFamilyArchive(previous, importSummary.items, conflicts))) { setPreview(null); setNotice('Previewed items were merged into the family archive.'); } }}>Import previewed family items</button><button type="button" disabled={busy} onClick={() => setPreview(null)}>Cancel import</button></div></section>}
        <button type="button" className="text-button danger" disabled={busy || recording} onClick={() => setDeleteAll(value => !value)}>Delete all family items</button>
        {deleteAll && <div className="family-import"><h3>Delete this device’s family archive?</h3><p>This removes every saved family item and original file, including hidden items, and clears the open form. Downloaded copies, reader notes and other apps are unaffected. Recovery requires your own backup.</p><div className="button-row"><button type="button" className="secondary danger" disabled={busy || recording} onClick={async () => { if (await archive.commit(previous => ({ ...emptyFamilyArchive(), revision: previous.revision }))) { clearForm(); setPreview(null); setDeleteAll(false); setDeleteItem(null); setNotice('The saved family archive and open form were removed from this app on this device.'); } }}>Permanently delete family archive</button><button type="button" disabled={busy} onClick={() => setDeleteAll(false)}>Keep family archive</button></div></div>}
      </details>
      <div className="family-columns">
        <form className="family-card family-editor" onSubmit={event => void saveItem(event)}>
          <h2>{editing ? 'Edit family item' : 'Add a family memory'}</h2>
          <p className="family-help">Your family’s own contribution. It is kept separately from source Scripture.</p>
          <fieldset disabled={busy}>
            <label htmlFor="family-title">Title<input id="family-title" required maxLength={200} value={draft.title} onChange={event => updateDraft({ title: event.target.value })} /></label>
            <div className="family-fields"><label>Person or speaker<input required maxLength={200} value={draft.person} onChange={event => updateDraft({ person: event.target.value })} /></label><label>Recording or event date (optional)<input type="date" value={draft.occurredOn} onChange={event => updateDraft({ occurredOn: event.target.value })} /></label></div>
            <div className="family-fields"><label>Kind of contribution<select aria-label="Kind of contribution" value={draft.category} onChange={event => updateDraft({ category: event.target.value as FamilyCategory })}>{familyCategories.map(category => <option key={category} value={category}>{categoryLabels[category]}</option>)}</select></label><label>Collection (optional)<input maxLength={120} value={draft.collection} onChange={event => updateDraft({ collection: event.target.value })} /></label></div>
            <label>Topics, separated by commas<input maxLength={2400} value={draft.topics} onChange={event => updateDraft({ topics: event.target.value })} /></label>
            <label>Memory, testimony or explanation<textarea aria-label="Memory, testimony or explanation" rows={6} maxLength={MAX_FAMILY_TEXT} value={draft.body} onChange={event => updateDraft({ body: event.target.value })} /></label>
            <details className="family-editor-details"><summary>Link passages ({draft.passages.length})</summary><p className="family-help">Links preserve their edition identity. Source Scripture is not copied into your private backup.</p><label>Passage edition<select aria-label="Passage edition" value={passageEdition} onChange={event => setPassageEdition(event.target.value)}>{editions.length ? editions.map(edition => <option key={edition.id} value={edition.id}>{edition.name}</option>) : <option value={passageEdition}>{passageEdition}</option>}</select></label><label>Passage reference<input maxLength={100} value={passageText} onChange={event => setPassageText(event.target.value)} /></label><button type="button" className="secondary" disabled={recording} onClick={() => void addPassage()}>{linkBusy ? 'Checking passage…' : 'Add passage link'}</button>{draft.passages.map((link, index) => <div className="family-link" key={`${refKey(link.reference)}-${index}`}><span>{link.label}</span><button type="button" aria-label={`Remove passage link ${link.label}`} onClick={() => updateDraft({ passages: draft.passages.filter((_, position) => position !== index) })}>Remove</button></div>)}</details>
            <details className="family-editor-details"><summary>Original file or voice recording{draft.attachment ? ' · 1 attached' : ' (optional)'}</summary>
              <label>Upload original file<input key={`file-${formGeneration}`} type="file" disabled={recording} accept=".jpg,.jpeg,.png,.webp,.gif,.mp3,.wav,.ogg,.webm,.m4a,.pdf,.txt,.docx,.odt" onChange={event => { void chooseOriginal(event.target.files?.[0]); event.target.value = ''; }} /></label>
              <p className="family-help">Photos: JPG, PNG, WebP, GIF. Audio: MP3, WAV, OGG, WebM, M4A. Documents: PDF, TXT, DOCX, ODT. One original per item; use a collection to group several files.</p>
              {draft.attachment && <><FamilyMedia attachment={draft.attachment} title={draft.title || 'Unsaved family original'} captionsVtt={draft.captionsVtt} /><button type="button" className="text-button" disabled={recording} onClick={() => updateDraft({ attachment: undefined, consentConfirmed: false })}>Remove original from this form</button><p className="family-help">An existing saved original is removed only when you save these changes.</p></>}
              <FamilyRecorder key={`recorder-${formGeneration}`} disabled={busy} onActiveChange={setRecording} onReady={attachment => updateDraft({ attachment, consentConfirmed: false })} />
            </details>
            <details className="family-editor-details"><summary>Transcript and timed captions</summary><label>Transcript<textarea aria-label="Transcript" rows={5} maxLength={MAX_FAMILY_TEXT} value={draft.transcript} onChange={event => updateDraft({ transcript: event.target.value })} /></label><p className="family-help">Enter or correct your own transcript. No automated transcription service receives this recording.</p><label>Import WebVTT captions<input type="file" accept=".vtt,text/vtt" onChange={event => { void chooseCaptions(event.target.files?.[0]); event.target.value = ''; }} /></label><label>WebVTT captions<textarea aria-label="WebVTT captions" rows={5} maxLength={MAX_FAMILY_TEXT} spellCheck={false} value={draft.captionsVtt} onChange={event => updateDraft({ captionsVtt: event.target.value })} /></label><p className="family-help">Use a WEBVTT header and timed cues. Captions appear beside original audio; the full transcript stays available as text.</p></details>
            <details className="family-editor-details"><summary>Visibility and archive steward</summary><label>Device visibility<select aria-label="Device visibility" value={draft.visibility} onChange={event => updateDraft({ visibility: event.target.value as FamilyItem['visibility'] })}><option value="private">Show in my private archive</option><option value="hidden">Hide from the normal archive list</option></select></label><label>Steward and recovery note<textarea aria-label="Steward and recovery note" rows={3} maxLength={4000} value={draft.stewardNote} onChange={event => updateDraft({ stewardNote: event.target.value })} /></label><p className="family-help">Record whom you trust and where you keep backups. This note does not create an invitation or grant technical access.</p></details>
            <section className="family-consent"><h3>Permission to preserve this item</h3><label>Permission basis<select aria-label="Permission basis" value={draft.basis} onChange={event => updateDraft({ basis: event.target.value as FamilyItem['consent']['basis'], consentConfirmed: false })}><option value="own_work">My own writing or recording</option><option value="permission">Permission from the owner or speaker</option></select></label><label>Permission confirmed by<input required maxLength={200} value={draft.grantedBy} onChange={event => updateDraft({ grantedBy: event.target.value, consentConfirmed: false })} /></label><label>Permission details (optional)<textarea aria-label="Permission details (optional)" rows={2} maxLength={4000} value={draft.consentNote} onChange={event => updateDraft({ consentNote: event.target.value })} /></label><label className="family-check"><input type="checkbox" checked={draft.consentConfirmed} onChange={event => updateDraft({ consentConfirmed: event.target.checked })} /><span>I am authorized to keep and back up this item, including its original file.</span></label></section>
            {formError && <p className="family-error" role="alert">{formError}</p>}
            <div className="button-row"><button type="submit" className="primary" disabled={recording}>{editing ? 'Save family changes' : 'Save family item'}</button>{editing && <button type="button" className="secondary" disabled={recording} onClick={event => void saveItem(event, true)}>Save as new family item</button>}<button type="button" disabled={recording} onClick={discardForm}>{editing ? 'Close editor' : 'Clear form'}</button></div>
            <p className="family-help" role="status">{recording ? 'Finish or cancel the recording before saving.' : dirty ? 'This form has unsaved changes.' : editing ? 'The saved item is open for editing.' : 'Nothing in this form is saved until you choose Save family item.'}</p>
          </fieldset>
        </form>
        <section className="family-library" aria-labelledby="family-library-title"><h2 id="family-library-title">Your saved archive</h2>
          <div className="family-card family-filters"><label>Search people, passages, topics or writing<input type="search" value={filter.query} onChange={event => updateFilter({ query: event.target.value })} /></label><div className="family-fields"><label>Filter by person<select aria-label="Filter by person" value={filter.person} onChange={event => updateFilter({ person: event.target.value })}><option value="">Everyone</option>{people.map(person => <option key={person} value={person}>{person}</option>)}</select></label><label>Filter by collection<select aria-label="Filter by collection" value={filter.collection} onChange={event => updateFilter({ collection: event.target.value })}><option value="">Every collection</option>{collections.map(collection => <option key={collection} value={collection}>{collection}</option>)}</select></label></div><div className="family-fields"><label>From event date<input type="date" value={filter.from} onChange={event => updateFilter({ from: event.target.value })} /></label><label>To event date<input type="date" value={filter.to} onChange={event => updateFilter({ to: event.target.value })} /></label></div><label className="family-check"><input type="checkbox" checked={filter.showHidden} onChange={event => updateFilter({ showHidden: event.target.checked })} /><span>Show hidden items</span></label><p className="family-help">Search ignores accents and letter case. Original names and wording are preserved. Date filters use the recorded event date; undated items are excluded while a date filter is active.</p>{filter.from && filter.to && filter.from > filter.to && <p className="family-error" role="alert">The start date is after the end date.</p>}</div>
          <p className="family-meta" role="status">{matching.length} {matching.length === 1 ? 'item matches' : 'items match'} your filters.</p>
          <div className="family-items">{matching.slice(0, limit).map(item => <article className="family-card family-item" key={item.id}>
            <p className="family-meta">{categoryLabels[item.category]} · {item.visibility === 'hidden' ? 'Hidden on this device' : 'Private on this device'}</p><h3>{item.title}</h3><p className="family-person">{item.person}{item.occurredOn && <> · <time dateTime={item.occurredOn}>{item.occurredOn}</time></>}</p>
            {item.collection && <p className="family-meta">Collection: {item.collection}</p>}{item.topics.length > 0 && <p className="family-meta">Topics: {item.topics.join(', ')}</p>}
            {item.body && <p className="family-writing">{item.body.length > 400 ? `${item.body.slice(0, 400)}…` : item.body}</p>}
            <div className="family-passages">{item.passages.map((link, index) => <button key={`${refKey(link.reference)}-${index}`} type="button" className="text-button" onClick={() => onOpenReference(link.reference)}>{link.label}</button>)}</div>
            <details><summary>Open original and full details</summary>{item.body.length > 400 && <p className="family-writing">{item.body}</p>}{item.attachment && <FamilyMedia attachment={item.attachment} title={item.title} captionsVtt={item.captionsVtt} />}{item.transcript && <section><h4>Transcript</h4><p className="family-writing">{item.transcript}</p></section>}{item.captionsVtt && <button type="button" className="text-button" onClick={() => downloadFamilyBlob(new Blob([item.captionsVtt], { type: 'text/vtt' }), 'family-captions.vtt')}>Download captions</button>}<h4>Consent record</h4><p className="family-help">{item.consent.basis === 'own_work' ? 'Own work' : 'Permission from owner or speaker'} · confirmed by {item.consent.grantedBy} on {new Date(item.consent.confirmedAt).toLocaleDateString()}.</p>{item.consent.note && <p className="family-writing">{item.consent.note}</p>}{item.stewardNote && <><h4>Steward and recovery note</h4><p className="family-writing">{item.stewardNote}</p></>}<p className="family-meta">Saved {new Date(item.updatedAt).toLocaleString()}</p></details>
            <div className="button-row"><button type="button" className="secondary" disabled={busy || recording} aria-label={`Edit family item: ${item.title}`} onClick={() => editItem(item)}>Edit</button><button type="button" className="secondary" disabled={busy || recording} onClick={() => void exportBackup(item)}>Back up this item</button><button type="button" disabled={busy || recording || (dirty && editing?.id === item.id)} onClick={() => void archive.commit(previous => ({ ...previous, items: previous.items.map(value => value.id === item.id ? { ...value, visibility: value.visibility === 'hidden' ? 'private' : 'hidden', updatedAt: new Date().toISOString() } : value) }))}>{item.visibility === 'hidden' ? 'Show in archive' : 'Hide item'}</button><button type="button" className="danger" disabled={busy || recording} aria-label={`Delete family item: ${item.title}`} onClick={() => setDeleteItem(item.id)}>Delete</button></div>
            {deleteItem === item.id && <div className="family-import"><p>Delete “{item.title}” and its original file from this device? Exported copies remain. {editing?.id === item.id ? 'The open form for this item will also be cleared.' : ''}</p><div className="button-row"><button type="button" className="secondary danger" disabled={busy || recording} onClick={async () => { if (await archive.commit(previous => ({ ...previous, items: previous.items.filter(value => value.id !== item.id) }))) { if (editing?.id === item.id) clearForm(); setDeleteItem(null); } }}>Confirm item deletion</button><button type="button" disabled={busy} onClick={() => setDeleteItem(null)}>Keep item</button></div></div>}
          </article>)}</div>
          {!matching.length && <div className="family-empty"><h3>{items.length ? 'No items match these filters.' : 'Your archive begins with a real memory.'}</h3><p>{items.length ? 'Clear filters or enable hidden items to see more saved records.' : 'Write a memory or add an authorized original. Your own memories and files will appear here after you save them.'}</p></div>}
          {matching.length > limit && <button type="button" className="secondary" onClick={() => setLimit(value => value + 20)}>Show 20 more items</button>}
        </section>
      </div>
    </>}
  </div>;
}

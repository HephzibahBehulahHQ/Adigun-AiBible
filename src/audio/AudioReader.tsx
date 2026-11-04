import { useEffect, useRef, useState } from 'react';
import { BookOpen, Headphones, Pause, Play, Square } from 'lucide-react';
import { getEditionCatalog, getManifest, sourceCredit } from '../data';
import type { Edition, Manifest, Reference, Verse } from '../types';
import { AUDIO_QUEUE_LIMIT, audioBackup, audioReferenceLabel, moveAudioEntry, parseAudioBackup, removeAudioEntry, validateAudioEntry } from './model';
import type { AudioCursor, AudioEntry, AudioState } from './model';
import { loadAudioState, saveAudioState } from './storage';
import { browserSpeechDriver, languageKey, ListeningPlayer, matchingVoices, voiceKey } from './player';
import type { ListeningVoice, PlaybackState } from './player';
import { loadListeningEntry, prepareListeningPassage, verifyListeningBackup } from './source';
import '../tools.css';
import './audio.css';

const idle: PlaybackState = { phase: 'idle', message: 'Add passages, then choose Play queue. Audio never starts automatically.', cursor: null, sleepAt: null };
function downloadBackup(state: AudioState) {
  const url = URL.createObjectURL(new Blob([audioBackup(state)], { type: 'application/json' })); const link = document.createElement('a');
  link.href = url; link.download = `Adigun-AiBible-listening-${new Date().toISOString().slice(0, 10)}.json`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function AudioReader({ reference, onOpenReference }: { reference: Reference; onOpenReference: (ref: Reference) => void }) {
  const [state, setState] = useState<AudioState | null>(null); const stateRef = useRef<AudioState | null>(null);
  const [storageError, setStorageError] = useState(''); const [saveStatus, setSaveStatus] = useState('Opening private listening storage…'); const [saving, setSaving] = useState(false);
  const chain = useRef<Promise<void>>(Promise.resolve()); const pending = useRef(0); const blocked = useRef(false); const mounted = useRef(false);
  const [editions, setEditions] = useState<Edition[]>([]); const [manifest, setManifest] = useState<Manifest | null>(null);
  const [editionId, setEditionId] = useState(reference.editionId || 'eng-web'); const [bookId, setBookId] = useState(reference.bookId); const [chapter, setChapter] = useState(reference.chapter);
  const [first, setFirst] = useState(reference.verse); const [last, setLast] = useState(reference.endVerse ?? reference.verse); const [repeats, setRepeats] = useState(1); const [alternate, setAlternate] = useState('');
  const [formBusy, setFormBusy] = useState(false); const [formError, setFormError] = useState(''); const [notice, setNotice] = useState('');
  const [playback, setPlayback] = useState<PlaybackState>(idle); const [voices, setVoices] = useState<ListeningVoice[]>([]); const [supported, setSupported] = useState(false); const [allowNetwork, setAllowNetwork] = useState(false); const [online, setOnline] = useState(navigator.onLine);
  const player = useRef<ListeningPlayer | null>(null); const onPosition = useRef<(cursor: AudioCursor) => void>(() => {});
  const [transcript, setTranscript] = useState<{ edition: Edition; verses: Verse[] } | null>(null); const [transcriptError, setTranscriptError] = useState('');
  const [imported, setImported] = useState<AudioState | null>(null); const [importError, setImportError] = useState(''); const [checkingImport, setCheckingImport] = useState(false); const importGeneration = useRef(0);
  const active = ['loading', 'playing', 'paused'].includes(playback.phase); const unavailable = !state || !!storageError; const locked = active || saving || formBusy || unavailable;

  function commit(update: (previous: AudioState) => AudioState, message = 'Listening changes saved on this device.'): Promise<boolean> {
    pending.current++; setSaving(true); let success = false;
    const operation = chain.current.then(async () => {
      if (!stateRef.current || blocked.current) return;
      const previous = stateRef.current;
      try {
        const next = await saveAudioState(update(previous), previous.revision); stateRef.current = next; success = true;
        if (mounted.current) { setState(next); setSaveStatus(message); }
      } catch (error) {
        blocked.current = true;
        if (mounted.current) { setStorageError(error instanceof Error ? error.message : 'Listening changes were not saved.'); setSaveStatus('Not saved. Keep this tab open and download your last saved backup.'); player.current?.stop('Playback stopped because listening progress could not be saved. Reload saved data to continue.'); }
      }
    }).finally(() => { pending.current--; if (mounted.current) setSaving(pending.current > 0); });
    chain.current = operation; return operation.then(() => success);
  }
  onPosition.current = cursor => { void commit(previous => ({ ...previous, cursor }), 'Listening position saved on this device.'); };

  useEffect(() => {
    mounted.current = true; let alive = true;
    void loadAudioState().then(value => { if (alive) { stateRef.current = value; setState(value); setSaveStatus('Listening queue and bookmarks stay on this device.'); } }).catch(error => { if (alive) { blocked.current = true; setStorageError(error.message); setSaveStatus('Listening storage is unavailable.'); } });
    void getEditionCatalog().then(value => { if (alive) setEditions(value.editions.filter(edition => edition.corpus === 'bible')); }).catch(error => { if (alive) setFormError(error.message); });
    const driver = browserSpeechDriver(); setSupported(!!driver);
    if (driver) player.current = new ListeningPlayer(driver, loadListeningEntry, value => { if (mounted.current) setPlayback(value); }, cursor => onPosition.current(cursor));
    const refresh = () => { if (driver) { setVoices(driver.voices()); player.current?.voicesChanged(); } };
    const connection = () => { setOnline(navigator.onLine); player.current?.connectionChanged(); };
    const leaving = () => { player.current?.stop('Playback stopped when this page was left.'); };
    refresh(); if (driver) window.speechSynthesis.addEventListener('voiceschanged', refresh);
    window.addEventListener('online', connection); window.addEventListener('offline', connection); window.addEventListener('pagehide', leaving);
    return () => { alive = false; mounted.current = false; importGeneration.current++; player.current?.dispose(); player.current = null; if (driver) window.speechSynthesis.removeEventListener('voiceschanged', refresh); window.removeEventListener('online', connection); window.removeEventListener('offline', connection); window.removeEventListener('pagehide', leaving); };
  }, []);
  const routeKey = `${reference.editionId}:${reference.bookId}:${reference.chapter}:${reference.verse}:${reference.endVerse}`; const previousRoute = useRef(routeKey);
  useEffect(() => { if (previousRoute.current !== routeKey) { player.current?.stop('Playback stopped because the selected passage changed.'); previousRoute.current = routeKey; } }, [routeKey]);
  useEffect(() => { let current = true; setManifest(null); setFormError(''); void getManifest(editionId).then(value => { if (current) setManifest(value); }).catch(error => { if (current) setFormError(error.message); }); return () => { current = false; }; }, [editionId]);
  const cursor = playback.cursor || state?.cursor || null; const currentEntry = state?.entries.find(entry => entry.id === cursor?.entryId);
  useEffect(() => { let current = true; setTranscript(null); setTranscriptError(''); if (currentEntry) void prepareListeningPassage(currentEntry.ref, currentEntry.sourceSha256).then(value => { if (current) setTranscript(value); }).catch(error => { if (current) setTranscriptError(error.message); }); return () => { current = false; }; }, [currentEntry?.id, currentEntry?.sourceSha256]);

  async function reload() {
    player.current?.stop(); await chain.current; setStorageError('');
    try { const value = await loadAudioState(); stateRef.current = value; setState(value); blocked.current = false; setSaveStatus('Saved listening data reloaded.'); setPlayback(idle); }
    catch (error) { blocked.current = true; setStorageError(error instanceof Error ? error.message : 'Listening storage could not be opened.'); }
  }
  async function add(chapterOnly = false) {
    if (locked || !manifest) return; setFormBusy(true); setFormError(''); setNotice('');
    try {
      const max = manifest.books.find(book => book.id === bookId)?.verseCounts[chapter - 1]; if (!max) throw new Error('Choose an available book and chapter.');
      const ref: Reference = { bookId, chapter, verse: chapterOnly ? 1 : first, endVerse: chapterOnly ? max : last, editionId };
      const targets = [editionId, ...(alternate && alternate !== editionId ? [alternate] : [])]; const additions: AudioEntry[] = [];
      for (const target of targets) {
        const targetRef = { ...ref, editionId: target }; const source = await prepareListeningPassage(targetRef);
        additions.push(validateAudioEntry({ id: crypto.randomUUID(), ref: targetRef, editionName: source.edition.name, language: source.edition.language, sourceSha256: source.edition.sha256, repeats }));
      }
      const saved = await commit(previous => { if (previous.entries.length + additions.length > AUDIO_QUEUE_LIMIT) throw new Error(`A queue holds up to ${AUDIO_QUEUE_LIMIT} passages. Remove an entry before adding more.`); return { ...previous, entries: [...previous.entries, ...additions] }; });
      if (saved) setNotice(`${additions.length === 2 ? 'Both editions added in listening order' : 'Passage added'}: ${audioReferenceLabel(ref)}. Playback waits for you.`);
    } catch (error) { setFormError(error instanceof Error ? error.message : 'The passage could not be added.'); } finally { setFormBusy(false); }
  }
  function play(from?: AudioCursor | null) { if (!state || saving || unavailable || !player.current || active) return; void player.current.start(state.entries, state.settings, allowNetwork, from === undefined ? state.cursor : from); }
  async function bookmark() {
    if (!currentEntry || !cursor || unavailable || saving) return;
    const ref = { bookId: currentEntry.ref.bookId, chapter: currentEntry.ref.chapter, verse: cursor.verse, editionId: currentEntry.ref.editionId };
    const saved = await commit(previous => {
      if (previous.bookmarks.length >= 1000) throw new Error('Remove an audio bookmark before adding more.');
      if (previous.bookmarks.some(bookmark => bookmark.sourceSha256 === currentEntry.sourceSha256 && bookmark.ref.bookId === ref.bookId && bookmark.ref.chapter === ref.chapter && bookmark.ref.verse === ref.verse && bookmark.ref.editionId === ref.editionId)) return previous;
      return { ...previous, bookmarks: [{ id: crypto.randomUUID(), ref, editionName: currentEntry.editionName, sourceSha256: currentEntry.sourceSha256, createdAt: new Date().toISOString() }, ...previous.bookmarks] };
    });
    if (saved) setNotice(`Audio bookmark saved for ${audioReferenceLabel(ref)}.`);
  }
  async function previewBackup(file: File | undefined) {
    const generation = ++importGeneration.current; setImported(null); setImportError(''); setCheckingImport(false); if (!file) return; setCheckingImport(true);
    try { if (file.size > 2_000_000) throw new Error('The listening backup exceeds the 2 MB limit.'); const preview = await verifyListeningBackup(parseAudioBackup(await file.text())); if (generation === importGeneration.current) setImported(preview); }
    catch (error) { if (generation === importGeneration.current) setImportError(error instanceof Error ? error.message : 'The backup could not be read.'); }
    finally { if (generation === importGeneration.current) setCheckingImport(false); }
  }
  const currentBook = manifest?.books.find(book => book.id === bookId); const maxVerse = currentBook?.verseCounts[chapter - 1] || 176;
  const languages = [...new Set([...(state?.entries.map(entry => languageKey(entry.language)) || []), languageKey(manifest?.edition.language || 'en')])];

  return <div className="page tool-page audio-page">
    <header className="page-heading"><span className="eyebrow">LISTEN AT YOUR PACE</span><h1><Headphones size={28} aria-hidden="true" /> Audio reader</h1><p>Build a private listening queue from installed source editions. This reader uses your browser’s reported voices; recorded narration and Quran recitation are separate collections.</p></header>
    <p className="audio-save-status" role="status">{saving ? 'Saving listening changes…' : saveStatus}</p>
    {storageError && <div className="availability-note" role="alert"><p>{storageError}</p><button type="button" className="secondary" disabled={saving || active} onClick={() => void reload()}>Reload saved listening data</button></div>}
    {notice && <p role="status">{notice}</p>}
    <div className="audio-layout">
      <section className="panel audio-builder" aria-labelledby="audio-add-title"><h2 id="audio-add-title">Add to your queue</h2><p className="muted">Source wording and speech permission are checked when you add a passage and again before playback.</p>
        <form onSubmit={event => { event.preventDefault(); void add(); }}>
          <label>Listening edition<select aria-label="Listening edition" value={editionId} disabled={locked} onChange={event => { setEditionId(event.target.value); if (alternate === event.target.value) setAlternate(''); }}>{!editions.length && <option value={editionId}>{editionId}</option>}{editions.map(edition => <option key={edition.id} value={edition.id}>{edition.name}</option>)}</select></label>
          <label>Listening book<select aria-label="Listening book" value={bookId} disabled={locked || !manifest} onChange={event => { setBookId(event.target.value); setChapter(1); setFirst(1); setLast(1); }}>{!manifest && <option value={bookId}>{bookId}</option>}{manifest?.books.map(book => <option key={book.id} value={book.id}>{book.name}</option>)}</select></label>
          <div className="audio-fields"><label>Listening chapter<input required type="number" min="1" max={currentBook?.chapters || 150} value={chapter} disabled={locked} onChange={event => { setChapter(Number(event.target.value)); setFirst(1); setLast(1); }} /></label><label>First verse<input required type="number" min="1" max={maxVerse} value={first} disabled={locked} onChange={event => setFirst(Number(event.target.value))} /></label><label>Last verse<input required type="number" min={first} max={maxVerse} value={last} disabled={locked} onChange={event => setLast(Number(event.target.value))} /></label></div>
          <div className="audio-fields"><label>Passage repetitions<select aria-label="Passage repetitions" value={repeats} disabled={locked} onChange={event => setRepeats(Number(event.target.value))}>{[1, 2, 3, 5, 10].map(value => <option key={value} value={value}>{value} {value === 1 ? 'time' : 'times'}</option>)}</select></label><label>Then another edition<select aria-label="Then another edition" value={alternate} disabled={locked} onChange={event => setAlternate(event.target.value)}><option value="">One edition only</option>{editions.filter(edition => edition.id !== editionId).map(edition => <option key={edition.id} value={edition.id}>{edition.name}</option>)}</select></label></div>
          {alternate && <p className="muted">The selected passage plays in the first edition, then in the second. Numbers are matched; this does not certify that two editions divide verses identically.</p>}
          <div className="button-row"><button type="submit" className="primary" disabled={locked || !manifest}>{formBusy ? 'Checking source…' : alternate ? 'Add alternating passages' : 'Add listening passage'}</button><button type="button" className="secondary" disabled={locked || !manifest} onClick={() => void add(true)}>Add whole chapter</button><button type="button" className="text-button" disabled={locked} onClick={() => { setEditionId(reference.editionId || 'eng-web'); setBookId(reference.bookId); setChapter(reference.chapter); setFirst(reference.verse); setLast(reference.endVerse ?? reference.verse); }}>Use reader selection</button></div>
        </form>{formError && <p role="alert">{formError}</p>}
      </section>
      <section className="panel audio-controls" aria-labelledby="audio-play-title"><h2 id="audio-play-title">Listen</h2>
        {!supported && <p className="availability-note">Browser speech is unavailable here. Your queue, bookmarks, and the written reader remain usable.</p>}
        {state && <><div className="audio-fields"><label>Listening speed<select aria-label="Listening speed" value={state.settings.rate} disabled={locked} onChange={event => void commit(previous => ({ ...previous, settings: { ...previous.settings, rate: Number(event.target.value) } }))}>{[0.65, 0.85, 1, 1.2, 1.5, 2].map(value => <option key={value} value={value}>{value}×</option>)}</select></label><label>Sleep timer<select aria-label="Sleep timer" value={state.settings.sleepMinutes} disabled={locked} onChange={event => void commit(previous => ({ ...previous, settings: { ...previous.settings, sleepMinutes: Number(event.target.value) } }))}>{[0, 5, 10, 15, 30, 45, 60, 90].map(value => <option key={value} value={value}>{value ? `${value} minutes` : 'Off'}</option>)}</select></label></div>
          {languages.map(language => { const matches = matchingVoices(voices, language); const selected = state.settings.voices[language] || ''; return <div key={language} className="audio-voice"><label>Voice for {language}<select aria-label={`Voice for ${language}`} disabled={locked || !supported} value={selected} onChange={event => { const selected = event.target.value; setAllowNetwork(false); void commit(previous => { const voiceSelections = { ...previous.settings.voices }; if (selected) voiceSelections[language] = selected; else delete voiceSelections[language]; return { ...previous, settings: { ...previous.settings, voices: voiceSelections } }; }); }}><option value="">Prefer an available local voice</option>{selected && !matches.some(voice => voiceKey(voice) === selected) && <option value={selected}>Previously selected voice is unavailable</option>}{matches.map(voice => <option key={voiceKey(voice)} value={voiceKey(voice)}>{voice.name} · {voice.lang} · {voice.localService ? 'Local (browser-reported)' : 'Network'}</option>)}</select></label>{!matches.length && <p className="audio-voice-missing">No matching {language} voice is reported by this browser. No other language will be substituted.</p>}</div>; })}
          <label className="check-label audio-network"><input type="checkbox" checked={allowNetwork} onChange={event => { player.current?.stop('Playback stopped because network-voice permission changed.'); setAllowNetwork(event.target.checked); }} /><span>Allow network voices to process the scripture in this queue for this visit.</span></label>
          <p className="muted">{online ? 'Network voices need internet and depend on their service.' : 'This device reports it is offline. Network voices will not run.'} Local voices depend on installed device assets. Download source books in Settings before listening offline.</p>
          <div className="button-row audio-transport"><button type="button" className="primary" disabled={!supported || !state.entries.length || locked} onClick={() => play()}><Play size={17} aria-hidden="true" /> Play queue</button><button type="button" className="secondary" disabled={playback.phase !== 'playing' && playback.phase !== 'paused'} onClick={() => playback.phase === 'paused' ? player.current?.resume() : player.current?.pause()}>{playback.phase === 'paused' ? <Play size={17} aria-hidden="true" /> : <Pause size={17} aria-hidden="true" />}{playback.phase === 'paused' ? 'Resume listening' : 'Pause listening'}</button><button type="button" className="secondary" disabled={!active} onClick={() => player.current?.stop()}><Square size={17} aria-hidden="true" /> Stop listening</button><button type="button" className="text-button" disabled={!supported || !state.entries.length || locked} onClick={() => play(null)}>Restart queue</button></div>
          <p role="status" className="audio-playback-status" data-phase={playback.phase}>{playback.message}</p>{playback.sleepAt && <p className="muted">Sleep timer stops playback by {new Date(playback.sleepAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}, even while paused. It requires this page to remain active.</p>}
          <p className="muted">Resume starts at the beginning of the last saved verse. Browser pause/resume varies by device; a failed pause stops playback safely.</p>
        </>}
      </section>
    </div>
    <section className="panel" aria-labelledby="audio-queue-title"><div className="audio-section-heading"><h2 id="audio-queue-title">Listening queue <span className="muted">({state?.entries.length || 0})</span></h2><button className="text-button" type="button" disabled={locked || !state?.entries.length} onClick={() => { setPlayback(idle); void commit(previous => ({ ...previous, entries: [], cursor: null })); }}>Clear queue</button></div>
      {!state?.entries.length ? <p>Add a passage or chapter above. You can alternate languages by placing their editions next to each other.</p> : <ol className="audio-queue">{state.entries.map((entry, index) => <li key={entry.id} className={entry.id === cursor?.entryId ? 'audio-queue-current' : ''}><div><h3>{audioReferenceLabel(entry.ref)}</h3><p>{entry.editionName} · {entry.language} · {entry.repeats} {entry.repeats === 1 ? 'time' : 'times'}</p>{entry.id === cursor?.entryId && <p className="muted">{cursor.completed ? 'Queue finished here' : `Listening position: verse ${cursor?.verse}`}</p>}</div><div className="button-row"><button type="button" className="secondary" disabled={locked || !supported} aria-label={`Play queue from ${audioReferenceLabel(entry.ref)}, item ${index + 1}`} onClick={() => play({ entryId: entry.id, verse: entry.ref.verse, repetition: 0, completed: false })}>Play from here</button><button type="button" className="secondary" disabled={active} aria-label={`Open ${audioReferenceLabel(entry.ref)} in ${entry.editionName}`} onClick={() => onOpenReference(entry.ref)}><BookOpen size={16} aria-hidden="true" /> Read</button><button type="button" className="text-button" disabled={locked || index === 0} aria-label={`Move listening item ${index + 1} up`} onClick={() => void commit(previous => moveAudioEntry(previous, entry.id, -1))}>Move up</button><button type="button" className="text-button" disabled={locked || index === state.entries.length - 1} aria-label={`Move listening item ${index + 1} down`} onClick={() => void commit(previous => moveAudioEntry(previous, entry.id, 1))}>Move down</button><button type="button" className="text-button" disabled={locked} aria-label={`Remove listening item ${index + 1}`} onClick={() => { if (cursor?.entryId === entry.id) setPlayback(idle); void commit(previous => removeAudioEntry(previous, entry.id)); }}>Remove</button></div></li>)}</ol>}
    </section>
    {currentEntry && <section className="panel audio-transcript" aria-labelledby="audio-text-title"><div className="audio-section-heading"><h2 id="audio-text-title">Passage text</h2><button type="button" className="secondary" disabled={unavailable || saving || !cursor} onClick={() => void bookmark()}>Bookmark current verse</button></div><p>{audioReferenceLabel(currentEntry.ref)} · {currentEntry.editionName}</p>{transcriptError && <p role="alert">{transcriptError}</p>}{transcript && <><div lang={transcript.edition.language}>{transcript.verses.map(verse => <p key={verse.number} className={verse.number === cursor?.verse ? 'audio-current-verse' : ''}><span className="audio-verse-number">{verse.number}</span> {verse.text}{verse.number === cursor?.verse && <small className="audio-current-label">{playback.phase === 'playing' ? 'Reading this verse' : 'Current listening position'}</small>}</p>)}</div><details><summary>Source and attribution</summary><p className="source-credit">{sourceCredit(transcript.edition)}</p></details></>}<p className="muted">The marker follows verse playback events. It does not claim word-level timing.</p></section>}
    <section className="panel" aria-labelledby="audio-bookmarks-title"><h2 id="audio-bookmarks-title">Audio bookmarks</h2>{!state?.bookmarks.length ? <p>Save a listening position with “Bookmark current verse.”</p> : <ul className="audio-bookmarks">{state.bookmarks.map(bookmark => <li key={bookmark.id}><div><strong>{audioReferenceLabel(bookmark.ref)}</strong><p>{bookmark.editionName}</p><small>{new Date(bookmark.createdAt).toLocaleString()}</small></div><div className="button-row"><button type="button" className="secondary" disabled={active} onClick={() => onOpenReference(bookmark.ref)}>Open bookmarked verse</button><button type="button" className="text-button" disabled={locked} aria-label={`Remove audio bookmark ${audioReferenceLabel(bookmark.ref)}`} onClick={() => void commit(previous => ({ ...previous, bookmarks: previous.bookmarks.filter(item => item.id !== bookmark.id) }))}>Remove bookmark</button></div></li>)}</ul>}</section>
    <section className="panel"><h2>Listening backup</h2><p>Queues and bookmarks are private device records, not cloud-synchronized. Browser storage is best effort and is not encrypted by this app. Backups contain your listening references and preferences.</p><div className="button-row"><button type="button" className="secondary" disabled={!state || saving} onClick={() => { if (state) downloadBackup(state); }}>Download listening backup</button><label className="audio-import-label">Preview listening backup<input type="file" accept="application/json,.json" disabled={locked} onChange={event => { void previewBackup(event.target.files?.[0]); event.target.value = ''; }} /></label></div>{checkingImport && <p role="status">Checking backup references against installed source revisions…</p>}{importError && <p role="alert">{importError}</p>}{imported && <div className="audio-import-preview"><h3>Replace listening data?</h3><p>This backup has {imported.entries.length} queue entries and {imported.bookmarks.length} audio bookmarks. Replacing affects only this listening workspace; your current queue and audio bookmarks will be replaced. Download a backup first if you need them.</p><div className="button-row"><button type="button" className="secondary" disabled={locked} onClick={async () => { const incoming = imported; if (await commit(previous => ({ ...incoming, revision: previous.revision }), 'Listening backup restored on this device.')) { setImported(null); setPlayback(idle); setNotice('Listening backup restored. Playback remains stopped.'); } }}>Replace listening workspace</button><button type="button" className="text-button" onClick={() => setImported(null)}>Cancel restore</button></div></div>}</section>
  </div>;
}

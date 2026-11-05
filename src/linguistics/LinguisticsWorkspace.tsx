import { useEffect, useMemo, useRef, useState } from 'react';
import { assetUrl, getBook, getManifest } from '../data';
import { stableStringify } from '../editorial';
import { resolveMinistrySource } from '../ministry/source-core';
import type { MinistrySourcePassage } from '../ministry/source-core';
import { requirePermission } from '../permissions';
import { passageLabel } from '../reading-session/model';
import type { Locale, Reference } from '../types';
import { downloadPrivateFile } from '../workspace/shared';
import { getLexicon, lexiconManifest } from './data';
import { searchLexicon } from './lexicon';
import type { DictionaryId, Lexicon, LexiconEntry } from './lexicon';
import { linguisticsBackup, mergeLinguisticsImport, newExperiment, parseLinguisticsBackup, previewLinguisticsImport, validateExperiment } from './model';
import type { LinguisticsState, TranslationExperiment } from './model';
import { resolveExperiment, verifyLinguisticsImport } from './source-core';
import { useLinguistics, useLinguisticsGuard } from './useLinguistics';
import LexiconDownloads from './LexiconDownloads';
import './linguistics.css';

const sourceAccess = { getBook, getManifest, getLexicon, requirePermission };
const languageName = (language: string) => ({ grc: 'Greek', heb: 'Hebrew', arc: 'Aramaic', 'x-pn': 'Proper name (source tag x-pn)' })[language] || language;
export default function LinguisticsWorkspace({ reference, locale, onOpenReference }: { reference: Reference; locale: Locale; onOpenReference: (ref: Reference) => void }) {
  const workspace = useLinguistics(), [tab, setTab] = useState<'lookup' | 'experiments'>('lookup');
  const [lexicons, setLexicons] = useState<Lexicon[]>([]), [loadError, setLoadError] = useState(''), [retry, setRetry] = useState(0), [loading, setLoading] = useState(true);
  const [query, setQuery] = useState(''), [dictionary, setDictionary] = useState(''), [language, setLanguage] = useState(''), [scope, setScope] = useState<'all' | 'lemma' | 'definition'>('all'), [page, setPage] = useState(0), [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<TranslationExperiment | null>(null), [baseline, setBaseline] = useState<TranslationExperiment | null>(null), [context, setContext] = useState<MinistrySourcePassage | null>(null), [experimentEntry, setExperimentEntry] = useState<LexiconEntry | null>(null);
  const [incoming, setIncoming] = useState<LinguisticsState | null>(null), [notice, setNotice] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const locked = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let active = true; setLoading(true); setLoadError('');
    void Promise.allSettled((['greek','hebrew'] as DictionaryId[]).map(getLexicon)).then(results => {
      if (!active) return;
      setLexicons(results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []));
      setLoadError(results.flatMap(result => result.status === 'rejected' ? [result.reason instanceof Error ? result.reason.message : 'A dictionary is unavailable.'] : []).join(' ')); setLoading(false);
    }); return () => { active = false; };
  }, [retry]);
  const entries = useMemo(() => lexicons.flatMap(row => row.entries), [lexicons]);
  const results = useMemo(() => searchLexicon(dictionary ? entries.filter(row => row.dictionary === dictionary) : entries, query, scope, language), [entries, query, dictionary, scope, language]);
  const selected = entries.find(row => row.id === selectedId), descriptor = selected ? lexiconManifest.dictionaries.find(row => row.id === selected.dictionary) : null;
  const dirty = !!draft && (!workspace.state?.experiments.some(row => row.id === draft.id) || stableStringify(draft) !== stableStringify(baseline));
  useLinguisticsGuard(dirty, busy || workspace.busy);
  useEffect(() => {
    let active = true; setContext(null); setExperimentEntry(null);
    if (draft) void resolveExperiment(draft, sourceAccess).then(result => { if (active) { setContext(result.context); setExperimentEntry(result.entry); } }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Original source context unavailable.'); });
    return () => { active = false; };
  }, [draft?.id, draft?.entrySha256, draft?.passage.sourceSha256]);
  async function run(action: () => Promise<void>) {
    if (locked.current || workspace.busy) return; locked.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : 'Translation workspace operation failed.'); }
    finally { locked.current = false; if (alive.current) setBusy(false); }
  }
  const discard = () => !dirty || window.confirm('Discard this unsaved translation exercise? Save or download your private writing first.');
  async function create(entry: LexiconEntry) {
    if (!discard()) return;
    await run(async () => {
      const resolved = await resolveMinistrySource(reference, sourceAccess), lexicon = await getLexicon(entry.dictionary);
      await requirePermission(resolved.edition, 'studyParaphrase');
      const value = newExperiment(entry, lexicon, resolved.passage, locale); setDraft(value); setBaseline(value); setTab('experiments'); setNotice('Private exercise opened. You selected the dictionary entry; no word-to-verse alignment is asserted.');
    });
  }
  function choose(value: TranslationExperiment) { if (discard()) { setDraft(value); setBaseline(value); setNotice(''); setError(''); } }
  function patch(value: Partial<TranslationExperiment>) { setDraft(current => current ? { ...current, ...value } : current); }
  async function save() {
    await run(async () => { if (!draft) return; const next = validateExperiment({ ...draft, updatedAt: new Date().toISOString() }); const resolved = await resolveExperiment(next, sourceAccess); await requirePermission(resolved.context.edition, 'studyParaphrase');
      if (await workspace.commit(state => ({ ...state, experiments: [...state.experiments.filter(row => row.id !== next.id), next] }))) { setDraft(next); setBaseline(next); setNotice('Translation exercise saved privately. Source Scripture remains unchanged.'); } });
  }
  const preview = workspace.state && incoming ? previewLinguisticsImport(workspace.state, incoming) : null;
  function inspectRelated(id: string) { setQuery(id); setDictionary(''); setLanguage(''); setPage(0); setSelectedId(id); if (!entries.some(row => row.id === id)) setNotice(`${id} is cited by the source but is not available in the loaded dictionaries.`); }
  return <div className="page tool-page linguistics-workspace" lang="en"><div className="page-heading"><span className="eyebrow">HISTORICAL LEXICONS · PRIVATE STUDY</span><h1>Original-language study</h1><p>Look up named historical dictionaries and compare your own study wording beside an exact Bible passage.</p></div>
    {locale !== 'en' && <p className="availability-note">Controls and historical dictionary definitions use English. Source lemmas retain their supplied script. Your exercise language is recorded separately.</p>}
    <div className="button-row"><button className={tab === 'lookup' ? 'primary' : 'secondary'} aria-pressed={tab === 'lookup'} onClick={() => setTab('lookup')}>Dictionary lookup</button><button className={tab === 'experiments' ? 'primary' : 'secondary'} aria-pressed={tab === 'experiments'} onClick={() => setTab('experiments')}>Private translation exercises</button></div>
    <p className="availability-note">Strong’s Greek (1890) and Hebrew/Aramaic (1894) dictionaries are historical sources. Their glosses, etymologies and pronunciation spellings need contextual evaluation. A dictionary definition does not establish a correct translation for every occurrence.</p>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {tab === 'lookup' ? <>
      <LexiconDownloads/>
      {loading && <p role="status">Downloading and checking historical dictionary files…</p>}{loadError && <div role="alert"><p>{loadError}</p><button className="secondary" onClick={() => setRetry(value => value + 1)}>Retry dictionary download</button></div>}
      <section className="panel"><h2>Search dictionary entries</h2><div className="linguistics-controls"><label>Find a lexical entry<input value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} placeholder="G26, H2, Greek/Hebrew lemma, transliteration or meaning"/></label><label>Dictionary<select aria-label="Dictionary" value={dictionary} onChange={event => { setDictionary(event.target.value); setPage(0); }}><option value="">Both dictionaries</option><option value="greek">Greek dictionary</option><option value="hebrew">Hebrew / Aramaic dictionary</option></select></label><label>Search fields<select aria-label="Search fields" value={scope} onChange={event => { setScope(event.target.value as typeof scope); setPage(0); }}><option value="all">All supplied fields</option><option value="lemma">Lemma and transliteration</option><option value="definition">Definition and historical renderings</option></select></label><label>Source language tag<select aria-label="Source language tag" value={language} onChange={event => { setLanguage(event.target.value); setPage(0); }}><option value="">All supplied tags</option><option value="grc">Greek</option><option value="heb">Hebrew</option><option value="arc">Aramaic</option><option value="x-pn">Proper names (x-pn)</option></select></label></div>
        <p>{entries.length.toLocaleString('en')} source records loaded · {results.length.toLocaleString('en')} matches. Diacritics can be included or omitted when searching. Unused historical number records remain visible.</p>
        <div className="linguistics-results">{results.slice(page * 25, (page + 1) * 25).map(entry => <button key={entry.id} className="secondary" aria-pressed={selectedId === entry.id} onClick={() => setSelectedId(entry.id)}><strong>{entry.id} · <span dir={entry.dictionary === 'hebrew' ? 'rtl' : 'ltr'}>{entry.lemma || 'No headword supplied'}</span></strong><span>{entry.transliteration}</span><small>{entry.definition || entry.notes || 'No separate definition supplied'}</small></button>)}</div>
        {!loading && !results.length && <p>No installed dictionary entry matches this search. No definition has been generated.</p>}
        <div className="button-row"><button className="secondary" disabled={!page} onClick={() => setPage(value => value - 1)}>Previous entries</button><span>Page {page + 1} of {Math.max(1, Math.ceil(results.length / 25))}</span><button className="secondary" disabled={(page + 1) * 25 >= results.length} onClick={() => setPage(value => value + 1)}>Next entries</button></div>
      </section>
      {selected && descriptor && <section className="panel" aria-label="Selected dictionary entry"><span className="eyebrow">{descriptor.title} · ORIGINAL {descriptor.originalDate}</span><h2>{selected.id} · <span dir={selected.dictionary === 'hebrew' ? 'rtl' : 'ltr'}>{selected.lemma || 'No headword supplied'}</span></h2><p>{languageName(selected.language)} · transliteration: {selected.transliteration || 'not supplied'} · historical pronunciation spelling: {selected.pronunciation || 'not supplied'}.</p>
        <h3>Historical definition</h3><p>{selected.definition || 'This source record has no separate definition.'}</p><h3>Source derivation</h3><p>{selected.derivation || 'No derivation supplied.'}</p><h3>KJV renderings listed by this dictionary</h3><p>{selected.kjvRenderings || 'No rendering list supplied.'}</p><p className="muted">This list describes renderings in the historical dictionary; it is not a concordance or an alignment to the selected Bible edition.</p>
        {selected.lexicalTag && <p>Dictionary headword grammatical tag, reproduced as supplied: <code>{selected.lexicalTag}</code>. This is not morphology for a verse occurrence.</p>}{selected.notes && <><h3>Source notes</h3><p>{selected.notes}</p></>}
        {selected.relatedIds.length > 0 && <div><h3>Cross-references supplied by the dictionary</h3><div className="button-row">{selected.relatedIds.map(id => entries.some(row => row.id === id) ? <button className="secondary" key={id} onClick={() => inspectRelated(id)}>{id}</button> : <span key={id}>{id} (not available)</span>)}</div></div>}
        {selected.lemma && <><p>Current Bible context: {reference.bookId} {reference.chapter}:{reference.verse}{reference.endVerse && reference.endVerse !== reference.verse ? `–${reference.endVerse}` : ''} · {reference.editionId || 'eng-web'}. Attaching this entry is your study choice; no lexical alignment is installed.</p><button className="primary" disabled={busy || workspace.busy || !workspace.state} onClick={() => void create(selected)}>Start private exercise with this entry</button></>}
        <details><summary>Dictionary source, date and checksums</summary><p>{descriptor.attribution}</p><p>{descriptor.digitalEdition} · {descriptor.license}.</p><a href={descriptor.sourceUrl} target="_blank" rel="noreferrer">Pinned source XML</a><p className="linguistics-hash">Source SHA-256: {descriptor.sourceSha256}</p><p className="linguistics-hash">Entry SHA-256: {selected.entrySha256}</p></details>
      </section>}
      <section className="panel"><h2>What these sources support</h2><p>{lexiconManifest.totalRecords.toLocaleString('en')} imported number records from named historical dictionaries. Definitions, supplied transliterations, historical pronunciation spellings, source derivations and lexical cross-references can be inspected.</p><ul>{lexiconManifest.limitations.map(limit => <li key={limit}>{limit}</li>)}</ul><details><summary>Source normalization and permissions</summary><ul>{lexiconManifest.normalization.map(row => <li key={row}>{row}</li>)}</ul>{lexiconManifest.dictionaries.map(row => <p key={row.id}>{row.title}: {row.records.toLocaleString('en')} records, {row.headwords.toLocaleString('en')} supplied headwords. {row.attribution} <a href={row.sourceUrl} target="_blank" rel="noreferrer">Source and public-domain declaration</a>.</p>)}<a href={assetUrl('data/linguistics/NOTICE.txt')} download>Download complete dictionary notices</a></details></section>
    </> : <fieldset className="linguistics-fields" disabled={busy || workspace.busy}><p role="status">{workspace.status}</p>{workspace.error && <div role="alert"><p>{workspace.error}</p><button className="secondary" onClick={() => { if (discard()) { setDraft(null); setBaseline(null); void workspace.reload(); } }}>Reload saved exercises</button></div>}
      <section className="panel"><h2>Saved study experiments</h2>{!workspace.state?.experiments.length && <p>No saved experiments. Select a dictionary headword to start one with the current Bible passage.</p>}<div className="linguistics-saved">{workspace.state?.experiments.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(row => <button className="secondary" aria-pressed={draft?.id === row.id} key={row.id} onClick={() => choose(row)}>{row.title}<small>{row.entryId} · {passageLabel(row.passage)}</small></button>)}</div></section>
      {draft && <section className="panel"><h2>Private translation exercise</h2><p>Your two alternatives are unreviewed study writing. Source Scripture and dictionary definitions remain unchanged.</p><label>Exercise title<input maxLength={200} value={draft.title} onChange={event => patch({ title: event.target.value })}/></label><label>Exercise writing language<select aria-label="Exercise writing language" value={draft.locale} onChange={event => patch({ locale: event.target.value as Locale })}><option value="en">English</option><option value="de">German</option><option value="yo">Yorùbá</option><option value="pcm">Nigerian Pidgin</option></select></label>
        {context && experimentEntry ? <><div className="linguistics-context"><h3>{passageLabel(context.passage)} · {context.edition.name}</h3>{context.verses.map(verse => <p key={verse.number} lang={context.edition.language}><sup>{verse.number}</sup> {verse.text}</p>)}<p className="source-credit">{context.attribution}</p><button className="secondary" onClick={() => onOpenReference(context.passage.reference)}>Open full passage context</button></div><p><strong>Author-selected dictionary entry:</strong> {experimentEntry.id} {experimentEntry.lemma} · {experimentEntry.definition || experimentEntry.notes}. No occurrence alignment is asserted.</p></> : <p>Verifying the original Bible and dictionary revisions before displaying source context…</p>}
        <div className="linguistics-choices"><label>My first wording choice<textarea aria-label="My first wording choice" rows={6} maxLength={20000} value={draft.choiceA} onChange={event => patch({ choiceA: event.target.value })}/></label><label>My second wording choice<textarea aria-label="My second wording choice" rows={6} maxLength={20000} value={draft.choiceB} onChange={event => patch({ choiceB: event.target.value })}/></label></div><label>Private reasoning, grammar questions and uncertainties<textarea aria-label="Private reasoning, grammar questions and uncertainties" rows={5} maxLength={20000} value={draft.notes} onChange={event => patch({ notes: event.target.value })}/></label>
        <div className="button-row"><button className="primary" disabled={!context || !experimentEntry} onClick={() => void save()}>Save translation exercise</button><button className="secondary" onClick={() => downloadPrivateFile(`private-translation-${draft.id}.txt`, `${draft.title}\nPRIVATE USER-WRITTEN EXERCISE — UNREVIEWED\n\nBible reference: ${passageLabel(draft.passage)} · ${draft.passage.editionName}\nDictionary reference: ${draft.entryId}\n\nFIRST WORDING CHOICE\n${draft.choiceA}\n\nSECOND WORDING CHOICE\n${draft.choiceB}\n\nPRIVATE NOTES\n${draft.notes}\n\nSource quotations excluded. This writing is not a new Bible edition.`, 'text/plain')}>Download private exercise writing</button><button className="secondary" onClick={() => { if (window.confirm('Delete this exercise and its private notes from this device? Downloaded files are separate.')) void run(async () => { if (await workspace.commit(state => ({ ...state, experiments: state.experiments.filter(row => row.id !== draft.id) }))) { setDraft(null); setBaseline(null); setNotice('Private translation exercise deleted.'); } }); }}>Delete translation exercise</button></div>
      </section>}
      <section className="panel"><h2>Backup, restore and privacy</h2><p>Experiments and private notes stay in this browser profile until you delete them or clear browser data. There is no account sync. Backups contain your writing and immutable source references, not Bible or dictionary quotation text. Saved experiments are limited to 100 records and an 8 MB restorable backup.</p><button className="secondary" disabled={!workspace.state || dirty} onClick={() => { if (workspace.state) downloadPrivateFile('private-translation-experiments.json', linguisticsBackup(workspace.state), 'application/json'); }}>Download translation backup</button>
        <label>Preview translation backup<input type="file" accept="application/json,.json" disabled={!workspace.state} onChange={event => { const file = event.target.files?.[0]; event.currentTarget.value = ''; setIncoming(null); if (file) void run(async () => { if (file.size > 8_001_000) throw new Error('Choose an experiment backup smaller than 8 MB.'); const value = parseLinguisticsBackup(await file.text()); await verifyLinguisticsImport(value, sourceAccess); setIncoming(value); setNotice('Backup source identities and exact installed references validated. Review the preview before saving.'); }); }}/></label>
        {incoming && preview && <div className="availability-note"><p>{preview.added} new experiments · {preview.identical} identical · {preview.conflicts} conflicts. Conflicts import as separate copies, preserving saved writing.</p><button className="primary" disabled={dirty} onClick={() => void run(async () => { await verifyLinguisticsImport(incoming, sourceAccess); if (await workspace.commit(state => mergeLinguisticsImport(state, incoming))) { setIncoming(null); setNotice('Validated private translation experiments imported.'); } })}>Import validated experiments</button><button className="secondary" onClick={() => setIncoming(null)}>Cancel experiment import</button></div>}
        <button className="secondary" disabled={!workspace.state?.experiments.length} onClick={() => { if (window.confirm('Delete all saved translation experiments and private notes on this device? Backups you downloaded will remain separate.')) void run(async () => { if (await workspace.commit(state => ({ ...state, experiments: [] }))) { setDraft(null); setBaseline(null); setIncoming(null); setNotice('All private translation experiments deleted from this device.'); } }); }}>Delete all translation experiments</button>
      </section>
    </fieldset>}
  </div>;
}

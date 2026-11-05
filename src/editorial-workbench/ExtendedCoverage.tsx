import { useEffect, useRef, useState } from 'react';
import { assetUrl, getBook, getEditionCatalog, getManifest } from '../data';
import { getOfflineManifest } from '../offline';
import type { OfflineManifest } from '../offline';
import { getRightsRegister, requirePermission } from '../permissions';
import type { EditionRightsRegister } from '../edition-rights';
import { getPublication, isValidatedPublication } from '../publication';
import type { PublishedEditorial } from '../publication';
import { validateHistoricalManifest } from '../historical/model';
import type { HistoricalManifest } from '../historical/model';
import { loadReviewedSpeakers } from '../speakers/source';
import { SPEAKER_REVIEW_TAG } from '../speakers/model';
import type { Edition, Manifest } from '../types';
import { buildServiceInventory, catalogOnlyCount, currentCachedInventory, dictionaryInventory, matchedPublisherInventory, offlinePackDefinitions, publisherInventory, verifyOfflinePacks } from './extended-inventory';
import type { CatalogOnlyWork, DictionaryInventory, OfflinePackCoverage, PublisherInventoryRow } from './extended-inventory';
import type { SourceManifest } from '../original-language/model';
import { parseRoute, routeHref } from '../routing';
import './extended-coverage.css';

interface Pilot { id: string; title: string; category: string; status: string }
interface Snapshot {
  editions: Edition[] | null; manifests: Manifest[]; rights: EditionRightsRegister | null;
  publishers: PublisherInventoryRow[] | null; publication: PublishedEditorial | null;
  approvedSpeakers: number | null; blockedSpeakers: number;
  hebrew: SourceManifest | null; historical: HistoricalManifest | null; dictionaries: DictionaryInventory | null;
  contexts: { records: number; books: number; drafts: number } | null;
  pilots: Pilot[] | null; offline: OfflineManifest | null; errors: string[];
}
const empty = (): Snapshot => ({ editions: null, manifests: [], rights: null, publishers: null, publication: null, approvedSpeakers: null, blockedSpeakers: 0, hebrew: null, historical: null, dictionaries: null, contexts: null, pilots: null, offline: null, errors: [] });
const number = (value: number | null | undefined) => value === null || value === undefined ? 'Unknown' : value.toLocaleString('en');
const message = (value: unknown) => value instanceof Error ? value.message : 'The source inventory could not be read.';
async function metadata(path: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(assetUrl(path), { signal });
  if (!response.ok || response.headers.get('content-type')?.includes('text/html')) throw new Error(`${path} is not available. Reconnect or download its source metadata.`);
  return response.json();
}
async function pilots(): Promise<Pilot[]> {
  const [tour, interpretation, decisions, detective] = await Promise.all([import('../time-travel/model'), import('../interpretation/challenges'), import('../workspace/decision-simulation'), import('../workspace/detective-mission')]);
  return [
    { id: tour.athens.id, title: tour.athens.title, category: 'Time travel', status: tour.athens.reviewStatus },
    { id: interpretation.blindChallenge.id, title: interpretation.blindChallenge.title, category: 'Blind interpretation', status: 'Research draft · human review pending' },
    ...decisions.decisionSimulations.map(value => ({ id: value.id, title: value.title, category: 'Decision simulation', status: 'Fictional adult learning exercise · no outcome guarantee' })),
    { id: detective.detectiveMission.id, title: detective.detectiveMission.title, category: 'Detective mission', status: 'Solo reading exercise · no shared mission state' },
  ];
}

export default function ExtendedCoverage({ catalogOnlyWorks }: { catalogOnlyWorks?: readonly CatalogOnlyWork[] }) {
  const [snapshot, setSnapshot] = useState<Snapshot>(empty), [loading, setLoading] = useState(true), [retry, setRetry] = useState(0);
  const [downloads, setDownloads] = useState<OfflinePackCoverage[] | null>(null), [checking, setChecking] = useState(false), [downloadError, setDownloadError] = useState('');
  const [speech, setSpeech] = useState<{ supported: boolean; local: number; network: number } | null>(null);
  const checkAbort = useRef<AbortController | null>(null), inspection = useRef(0), mounted = useRef(false), locked = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const refreshVoices = () => { const supported = 'speechSynthesis' in window; const voices = supported ? window.speechSynthesis.getVoices() : []; setSpeech({ supported, local: voices.filter(voice => voice.localService).length, network: voices.filter(voice => !voice.localService).length }); };
    refreshVoices(); if ('speechSynthesis' in window) window.speechSynthesis.addEventListener('voiceschanged', refreshVoices);
    return () => { mounted.current = false; inspection.current++; checkAbort.current?.abort(); if ('speechSynthesis' in window) window.speechSynthesis.removeEventListener('voiceschanged', refreshVoices); };
  }, []);
  useEffect(() => {
    let active = true; const controller = new AbortController(), next = empty();
    inspection.current++; checkAbort.current?.abort(); locked.current = false; setChecking(false); setDownloads(null); setDownloadError(''); setLoading(true); setSnapshot(empty());
    const source = async (label: string, action: () => Promise<void>) => { try { await action(); } catch (error) { next.errors.push(`${label}: ${message(error)}`); } };
    void Promise.all([
      source('Bible source inventories', async () => { const catalog = await getEditionCatalog(); next.editions = catalog.editions; await Promise.all(catalog.editions.filter(edition => edition.corpus === 'bible').map(edition => source(edition.name, async () => { next.manifests.push(await getManifest(edition.id)); }))); }),
      source('Publisher speaker metadata', async () => { next.publishers = publisherInventory(await metadata('data/speakers/publisher-coverage.json', controller.signal)); }),
      source('Human publication', async () => { const value = await getPublication(); if (!isValidatedPublication(value)) throw new Error('Validated publication is unavailable. Approval counts remain unknown.'); next.publication = value; }),
      source('Edition permissions', async () => { next.rights = await getRightsRegister(); }),
      source('Historical editions', async () => { next.historical = validateHistoricalManifest(await metadata('data/historical/manifest.json', controller.signal)); }),
      source('Hebrew source inventory', async () => { const { HebrewSourceLoader } = await import('../original-language/source'); next.hebrew = await new HebrewSourceLoader(new URL(assetUrl(''), location.href).href).loadManifest(controller.signal); }),
      source('Historical dictionaries', async () => { next.dictionaries = dictionaryInventory(await metadata('data/linguistics/manifest.json', controller.signal)); }),
      source('Context cards', async () => { const { contextRecords } = await import('../context/records'); next.contexts = { records: contextRecords.length, books: new Set(contextRecords.map(record => record.bookId)).size, drafts: contextRecords.filter(record => record.aiReviewStatus === 'AI-assisted draft · human review pending').length }; }),
      source('Installed experience pilots', async () => { next.pilots = await pilots(); }),
      source('Offline build inventory', async () => { next.offline = await getOfflineManifest(assetUrl('')); }),
    ]).then(async () => {
      if (next.publication && next.editions) await source('Approved speaker source verification', async () => {
        const reviewed = await Promise.all(next.editions!.filter(edition => edition.corpus === 'bible').map(edition => loadReviewedSpeakers(next.publication, edition.id, { getManifest, getBook, requirePermission })));
        next.approvedSpeakers = reviewed.reduce((sum, value) => sum + value.records.length, 0); next.blockedSpeakers = reviewed.reduce((sum, value) => sum + value.blocked, 0);
      });
      if (active) { setSnapshot(next); setLoading(false); }
    });
    return () => { active = false; controller.abort(); };
  }, [retry]);

  async function inspectDownloads() {
    if (locked.current || !snapshot.offline || !snapshot.editions) return;
    const controller = new AbortController(), run = ++inspection.current; checkAbort.current = controller; locked.current = true; setChecking(true); setDownloadError(''); setDownloads(null);
    try {
      if (typeof caches === 'undefined') throw new Error('Cache storage is unavailable in this browser. Download coverage is unknown.');
      const inventory = await currentCachedInventory(caches, new URL(assetUrl(''), location.href), snapshot.offline);
      const definitions = offlinePackDefinitions(snapshot.manifests, snapshot.editions, snapshot.historical, snapshot.dictionaries, snapshot.rights);
      const result = await verifyOfflinePacks(definitions, snapshot.offline, inventory, controller.signal);
      if (mounted.current && run === inspection.current) setDownloads(result);
    } catch (error) { if (mounted.current && run === inspection.current) setDownloadError(message(error)); }
    finally { if (run === inspection.current) { locked.current = false; checkAbort.current = null; if (mounted.current) setChecking(false); } }
  }
  const publishers = snapshot.publishers ? matchedPublisherInventory(snapshot.publishers, snapshot.manifests) : null;
  const matched = publishers?.every(row => row.matched), spans = matched ? publishers!.reduce((sum, row) => sum + row.totalSpans, 0) : null;
  const approvedContexts = snapshot.publication?.approvedContent.filter(record => record.kind === 'context' && !record.sourceIds.includes(SPEAKER_REVIEW_TAG)).length;
  const readable = snapshot.historical?.editions.filter(edition => edition.rights.display);
  let catalogs: number | null = null, catalogError = ''; try { catalogs = catalogOnlyCount(catalogOnlyWorks); } catch (error) { catalogError = message(error); }
  const recordedFiles = snapshot.offline ? Object.keys(snapshot.offline.files).filter(path => /\.(mp3|m4a|aac|ogg|opus|wav|flac)$/i.test(path)).length : null;
  return <section className="extended-coverage" aria-labelledby="extended-coverage-title" lang="en">
    <div className="extended-coverage-heading"><div><h2 id="extended-coverage-title">Study content and device coverage</h2><p>Installed sources, independent review and this device’s downloads are counted separately.</p></div><button type="button" className="secondary" disabled={loading || checking} onClick={() => setRetry(value => value + 1)}>Refresh coverage inventories</button></div>
    {loading && <p role="status">Checking public study inventories…</p>}
    {!loading && <p className="extended-coverage-status" role="status">Public coverage inventories checked. Unknown values are not counted as zero.</p>}
    {snapshot.errors.length > 0 && <div role="alert"><h3>Some coverage could not be verified</h3><ul>{snapshot.errors.map(error => <li key={error}>{error}</li>)}</ul><p>Available inventories remain visible. Refresh after restoring access to the missing source.</p></div>}
    <div className="extended-coverage-grid">
      <article className="panel" aria-labelledby="coverage-speakers"><h3 id="coverage-speakers">Speaker annotations</h3><dl><div><dt>Publisher-marked spans</dt><dd>{number(spans)}</dd></div><div><dt>Independent approved spans, source-verified</dt><dd>{number(snapshot.approvedSpeakers)}</dd></div></dl><p>Publisher red-letter metadata does not establish independent human approval. A verse can contain more than one span.</p>{snapshot.blockedSpeakers > 0 && <p role="alert">{number(snapshot.blockedSpeakers)} published annotations have unavailable or changed sources and are excluded.</p>}{publishers && <details><summary>Coverage by exact edition</summary><ul>{publishers.map(row => <li key={row.editionId}><strong>{row.name}</strong>: {row.matched ? `${number(row.totalSpans)} spans in ${number(row.totalVerses)} of ${number(row.sourceUnits)} source verse records` : 'Unknown — source revision or book inventory does not match.'}<small className="extended-coverage-hash">{row.sourceSha256}</small></li>)}</ul></details>}<a href={assetUrl('data/speakers/publisher-coverage.json')}>Publisher coverage inventory</a></article>
      <article className="panel" aria-labelledby="coverage-context"><h3 id="coverage-context">Context cards</h3><dl><div><dt>Draft setting records</dt><dd>{number(snapshot.contexts?.drafts)}</dd></div><div><dt>Books with researched setting records</dt><dd>{number(snapshot.contexts?.books)}</dd></div><div><dt>Published approved context records</dt><dd>{number(approvedContexts)}</dd></div></dl><p>Draft context cards are separate from the surrounding Bible text available throughout the reader. Published context counts exclude speaker annotations and retain the publication’s edition scope.</p>{snapshot.publication && <p className="small muted">Publication edition: {snapshot.publication.editionId}.</p>}</article>
      <article className="panel" aria-labelledby="coverage-historical"><h3 id="coverage-historical">Historical library</h3><dl><div><dt>Readable permitted editions</dt><dd>{number(readable?.length)}</dd></div><div><dt>Imported readable text units</dt><dd>{number(readable?.reduce((sum, edition) => sum + edition.units, 0))}</dd></div><div><dt>External catalog-only records</dt><dd>{number(catalogs)}</dd></div></dl><p>Historical editions are not included in Bible edition totals. External catalogs do not provide an installed text.</p>{catalogs === null && <p className="extended-coverage-unknown">{catalogError || 'The catalog-only inventory was not supplied; no count is inferred.'}</p>}{readable && <details><summary>Imported works and revisions</summary><ul>{readable.map(edition => <li key={edition.id}>{edition.title} · {edition.chapters} chapters · {edition.units} units<small>{edition.sourceRevision} · {edition.transcriptionStatus}</small></li>)}</ul></details>}<a href={assetUrl('data/historical/manifest.json')}>Historical edition inventory</a></article>
      <article className="panel" aria-labelledby="coverage-lexical"><h3 id="coverage-lexical">Historical dictionaries</h3><dl><div><dt>Dictionary number records</dt><dd>{number(snapshot.dictionaries?.totalRecords)}</dd></div><div><dt>Supplied headwords</dt><dd>{number(snapshot.dictionaries?.dictionaries.reduce((sum, row) => sum + row.headwords, 0))}</dd></div><div><dt>Installed dictionaries</dt><dd>{number(snapshot.dictionaries?.dictionaries.length)}</dd></div></dl><p>Dictionary entries are not Bible editions, verse alignments or approved translation alternatives. Unused historical numbers remain included in the record total.</p>{snapshot.dictionaries && <details><summary>Dictionary counts and pinned revision</summary><ul>{snapshot.dictionaries.dictionaries.map(row => <li key={row.id}>{row.title}: {number(row.records)} records · {number(row.headwords)} headwords<small>{Object.entries(row.languageCounts).map(([language, total]) => `${language}: ${number(total)}`).join(' · ')}</small></li>)}</ul><p className="extended-coverage-hash">Source commit: {snapshot.dictionaries.sourceCommit}</p></details>}<a href={assetUrl('data/linguistics/manifest.json')}>Dictionary source inventory</a></article>
      <article className="panel" aria-labelledby="coverage-hebrew"><h3 id="coverage-hebrew">Hebrew and Aramaic source corpus</h3><dl><div><dt>Original-language source books</dt><dd>{number(snapshot.hebrew?.bookCount)}</dd></div><div><dt>Source chapters</dt><dd>{number(snapshot.hebrew?.chapterCount)}</dd></div><div><dt>Source verse records</dt><dd>{number(snapshot.hebrew?.verseCount)}</dd></div></dl><p>This separately numbered source corpus is not an additional translated Bible edition. Supplied lemma and morphology annotations, ketiv and qere retain their source identities; automatic translation alignment and independent linguistic approval are not established.</p>{snapshot.hebrew && <p className="extended-coverage-hash">Pinned source commit: {snapshot.hebrew.sourceRevision}</p>}<p>Verify individual source-book downloads, morphology and complete notices in the source study workspace.</p><a href={routeHref('hebrew-study', parseRoute(location.hash).ref)}>Open Hebrew and Aramaic source study</a></article>
      <article className="panel" aria-labelledby="coverage-pilots"><h3 id="coverage-pilots">Installed experience pilots</h3><dl><div><dt>Named source or learning exercises</dt><dd>{number(snapshot.pilots?.length)}</dd></div></dl><p>This counts content pilots, not all tools or completion of the ten-experience specification. Private family files, user exercises and nearby messages are excluded.</p>{snapshot.pilots && <details><summary>Available pilots and their limits</summary><ul>{snapshot.pilots.map(pilot => <li key={pilot.id}><strong>{pilot.title}</strong><small>{pilot.category} · {pilot.status}</small></li>)}</ul></details>}<p>Generic tools such as retelling, family archives and nearby transport are not counted as authored content packs.</p></article>
      <article className="panel" aria-labelledby="coverage-audio"><h3 id="coverage-audio">Audio and configured services</h3><dl><div><dt>Bundled public recorded-audio files</dt><dd>{number(recordedFiles)}</dd></div><div><dt>Local voices reported by this browser</dt><dd>{speech?.supported ? number(speech.local) : speech ? 'Unavailable' : 'Unknown'}</dd></div><div><dt>Configured connected services in this build</dt><dd>{buildServiceInventory.filter(service => service.configured).length}</dd></div></dl><p>Device speech is not recorded narration. Voice availability can change; a reported local voice is not a physical-device offline test. Private family recordings are not inspected or counted.</p>{speech?.supported && <p className="small muted">{number(speech.network)} network voices are reported separately; none is started by this inventory.</p>}<details><summary>Service configuration</summary><ul>{buildServiceInventory.map(service => <li key={service.id}>{service.title}: {service.configured ? 'Configured; live verification separate' : 'Not configured'}</li>)}</ul><p>These are this build’s capability declarations, not simulated health checks. Nearby device pairing is a separate local transport and does not activate cloud services.</p></details></article>
    </div>
    <section className="panel extended-offline" aria-labelledby="coverage-offline"><h3 id="coverage-offline">Complete offline content on this device</h3><p>Check current app-scoped caches without downloading new content. A complete set requires every source, search and notice file listed for that pack, matching this build’s byte counts and checksums, with current permission. Private data and other apps’ caches are excluded.</p><div className="button-row"><button type="button" className="secondary" disabled={loading || checking || !snapshot.offline || !snapshot.editions} onClick={() => void inspectDownloads()}>Check cached content packs</button>{checking && <button type="button" className="secondary" onClick={() => checkAbort.current?.abort()}>Cancel coverage inspection</button>}</div>{checking && <p role="status">Checking cached source files and notices…</p>}{downloadError && <p role="alert">{downloadError}</p>}{!downloads && !checking && <p>Complete pack count: Unknown until this device’s cache is checked.</p>}{downloads && <><p role="status"><strong>{downloads.filter(row => row.status === 'complete').length} of {downloads.length} known content sets verified complete.</strong> Partial, unknown, blocked and invalid sets are excluded.</p><ul className="extended-offline-list">{downloads.map(row => <li key={row.id}><strong>{row.title}</strong><span className={`extended-pack-state ${row.status}`}>{row.status}</span><p>{row.detail}</p></li>)}</ul></>}{snapshot.offline && <p className="small muted extended-coverage-hash">Content revision: {snapshot.offline.contentVersion}</p>}<p className="small muted">This verifies content files, not an offline application launch or a physical nearby session. Exported Athens HTML files and other files saved outside browser caches cannot be inspected here.</p></section>
  </section>;
}

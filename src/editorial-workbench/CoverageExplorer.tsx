import { useEffect, useState } from 'react';
import ExtendedCoverage from './ExtendedCoverage';
import { historicalCatalog } from '../historical/catalog';
import { assetUrl, getEditionCatalog, getManifest, getQuran } from '../data';
import { decideEditionOperation } from '../edition-rights';
import type { EditionRightsRegister } from '../edition-rights';
import { getRightsRegister } from '../permissions';
import { getPublication } from '../publication';
import type { PublishedEditorial } from '../publication';
import type { Edition, Manifest, Reference } from '../types';
import { bookCoverage, filterAcquisition, validateAcquisition } from './coverage';
import type { AcquisitionInventory } from './coverage';

export default function CoverageExplorer({ acquisitionOnly, onOpenReference }: { acquisitionOnly: boolean; onOpenReference: (ref: Reference) => void }) {
  const [editions, setEditions] = useState<Edition[]>([]), [manifests, setManifests] = useState<Manifest[]>([]), [rights, setRights] = useState<EditionRightsRegister | null>(null);
  const [publication, setPublication] = useState<PublishedEditorial | null>(null), [inventory, setInventory] = useState<AcquisitionInventory | null>(null);
  const [quran, setQuran] = useState<{ edition: Edition; surahs: number; verses: number } | null>(null), [errors, setErrors] = useState<string[]>([]), [loading, setLoading] = useState(true), [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState('eng-web'), [query, setQuery] = useState(''), [page, setPage] = useState(0);
  useEffect(() => {
    let active = true; setLoading(true); setErrors([]); setManifests([]); setPublication(null); setRights(null); setQuran(null); setInventory(null);
    const error = (reason: unknown) => { if (active) setErrors(current => [...current, reason instanceof Error ? reason.message : 'A coverage source could not be loaded.']); };
    void Promise.allSettled([
      getEditionCatalog().then(async catalog => {
        if (active) setEditions(catalog.editions);
        await Promise.allSettled(catalog.editions.filter(edition => edition.corpus === 'bible').map(async edition => {
          try { const manifest = await getManifest(edition.id); if (active) setManifests(current => [...current, manifest]); }
          catch (reason) { error(new Error(`${edition.name}: ${reason instanceof Error ? reason.message : 'Manifest unavailable.'}`)); }
        }));
      }).catch(error),
      getRightsRegister().then(value => { if (active) setRights(value); }).catch(error),
      getPublication().then(value => { if (active) { setPublication(value); if (!value) error(new Error('Validated editorial publication is unavailable. Approval counts cannot be reported.')); } }).catch(error),
      getQuran().then(value => { if (active) setQuran({ edition: value.edition, surahs: value.surahs.length, verses: value.surahs.reduce((sum, surah) => sum + surah.verses.length, 0) }); }).catch(error),
      fetch(assetUrl('data/editions/acquisition-catalog.json')).then(async response => { if (!response.ok) throw new Error('The acquisition inventory is not downloaded.'); const value = validateAcquisition(await response.json()); if (active) setInventory(value); }).catch(error),
    ]).then(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);
  const manifest = manifests.find(row => row.edition.id === selected), rows = manifest ? bookCoverage(manifest, publication) : [];
  const filtered = inventory ? filterAcquisition(inventory, query) : [], visible = filtered.slice(page * 25, (page + 1) * 25);
  return <section className="editorial-coverage" aria-label={acquisitionOnly ? 'Edition acquisition research' : 'Source and editorial coverage'}>
    {loading && <p role="status">Reading installed source inventories and publication evidence…</p>}
    {errors.length > 0 && <div role="alert"><ul>{errors.map((error, index) => <li key={index}>{error}</li>)}</ul><button className="secondary" onClick={() => setRetry(value => value + 1)}>Retry coverage sources</button></div>}
    {!acquisitionOnly ? <>
      <section className="panel"><h2>Installed source coverage</h2><p>Each count belongs to its named edition and reference system. Source text availability, editorial review, and acquisition leads are separate measures.</p>
        <div className="editorial-table"><table><caption>Installed Bible manifests and exact source records</caption><thead><tr><th>Edition</th><th>Books</th><th>Chapters</th><th>Verse records</th><th>Current display permission</th></tr></thead><tbody>
          {editions.filter(edition => edition.corpus === 'bible').map(edition => { const found = manifests.find(row => row.edition.id === edition.id), decision = rights ? decideEditionOperation(rights.editions.find(row => row.editionId === edition.id), 'display', { sourceSha256: edition.sha256, aiProductEnabled: false }) : null;
            return <tr key={edition.id}><th scope="row">{edition.name}<br/><small>{edition.id}</small></th><td>{found?.totals.books ?? 'Unavailable'}</td><td>{found?.totals.chapters ?? 'Unavailable'}</td><td>{found?.totals.verses.toLocaleString('en') ?? 'Unavailable'}</td><td>{decision ? decision.allowed ? 'Permitted with conditions' : decision.reason : 'Not verified'}</td></tr>; })}
        </tbody></table></div>
        {quran && <p><strong>Separate Quran corpus:</strong> {quran.edition.name} · {quran.surahs} surahs · {quran.verses.toLocaleString('en')} ayat. This is not included in Bible edition totals.</p>}
        <p className="muted">Manifest totals count imported verse records. Numbering, omitted source positions, and canons differ across editions; these totals do not establish cross-edition equivalence.</p>
      </section>
      <section className="panel"><h2>Human editorial review</h2>{publication ? <><dl className="editorial-counts"><div><dt>Approved comparison links</dt><dd>{publication.approvedComparisons.length}</dd></div><div><dt>Approved edition passages</dt><dd>{publication.approvedParaphrases.length}</dd></div><div><dt>Other approved study records</dt><dd>{publication.approvedContent.length}</dd></div><div><dt>Unreviewed candidate leads</dt><dd>{publication.backlog.candidateCount}</dd></div></dl><p>Publication scope: {publication.editionId} · {publication.referenceSystemId || 'Reference system not recorded'}. Candidate leads do not establish a relationship or count as approval.</p></> : <p>Validated publication unavailable. No approval total is inferred.</p>}
        <label>Coverage edition<select value={selected} onChange={event => setSelected(event.target.value)}>{editions.filter(row => row.corpus === 'bible').map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        {manifest && <><div className="editorial-table"><table><caption>Comparison review coverage by book · {manifest.edition.name}</caption><thead><tr><th>Book</th><th>Source units</th><th>Unreviewed</th><th>In review</th><th>With links</th><th>No match</th><th>Disputed</th><th>Approved edition passages</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><th scope="row"><button className="secondary" onClick={() => onOpenReference({ editionId: manifest.edition.id, bookId: row.id, chapter: 1, verse: 1 })}>{row.name}</button></th><td>{row.sourceUnits}</td>{(['unreviewed','in_review','reviewed_with_links','reviewed_no_match','disputed'] as const).map(status => <td key={status}>{row.publicationAvailable ? row.counts[status] : 'Unknown'}</td>)}<td>{row.publicationAvailable ? row.paraphrases : 'Unknown'}</td></tr>)}</tbody></table></div><details><summary>Source revision and permission evidence</summary><p className="editorial-checksum">{manifest.edition.sha256}</p><a href={manifest.edition.sourceUrl} target="_blank" rel="noreferrer">Publisher source</a> · <a href={manifest.edition.licenseUrl} target="_blank" rel="noreferrer">Edition license</a>{rights?.editions.filter(row => row.editionId === selected).map(row => <div key={row.editionId}><p>Rights evidence checked {row.verifiedOn}; scope {row.territory.scope}; withdrawn: {row.withdrawn ? 'yes' : 'no'}.</p><ul>{row.conditions.map((condition, index) => <li key={index}>{condition}</li>)}</ul></div>)}</details></>}
        <p className="muted">No-match and disputed results require their own human review; they are not inferred from missing links. This screen provides no combined completion percentage.</p>
      </section>
      <ExtendedCoverage catalogOnlyWorks={historicalCatalog}/>
    </> : <section className="panel"><h2>Acquisition research inventory</h2><p>Provider metadata is a research lead. It is not installed text, a permission grant, or validated Bible coverage.</p>{inventory && <><p>{inventory.records.length} provider-observed records · observed {inventory.observedOn}.</p><details><summary>Inventory evidence and limitations</summary><a href={inventory.source.url} target="_blank" rel="noreferrer">Provider inventory</a><ul>{inventory.source.limitations.map((limit, index) => <li key={index}>{limit}</li>)}</ul></details><label>Search acquisition records<input value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} placeholder="Edition, provider ID, language or revision"/></label><p>{filtered.length} matching research records. Showing {filtered.length ? page * 25 + 1 : 0}–{Math.min((page + 1) * 25, filtered.length)}.</p><div className="editorial-acquisition">{visible.map(row => { const installed = row.installedEditionId && manifests.find(manifest => manifest.edition.id === row.installedEditionId); return <article key={`${row.provider}:${row.providerId}`}><h3>{row.title}</h3><p>{row.languageName} · {row.provider} · {row.providerId} · {row.revision || 'Revision unverified'}</p><p>{installed ? `Separately installed manifest: ${installed.edition.id}` : 'Metadata only; no usable source verified by this record.'}</p><p>Provider record: {row.availability}; coverage {row.coverage}; permissions {row.permissions}.</p><a href={row.sourceUrl} target="_blank" rel="noreferrer">Inspect provider evidence</a></article>; })}</div><div className="button-row"><button className="secondary" disabled={page === 0} onClick={() => setPage(value => value - 1)}>Previous records</button><button className="secondary" disabled={(page + 1) * 25 >= filtered.length} onClick={() => setPage(value => value + 1)}>Next records</button></div></>}</section>}
  </section>;
}

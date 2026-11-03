import { useEffect, useState } from 'react';
import { assetUrl, getEditionCatalog } from './data';
import type { Edition, EditionCatalog, EditionRights } from './types';

const permissions: { key: keyof EditionRights; label: string }[] = [
  { key: 'redistribute', label: 'Redistribution' },
  { key: 'adapt', label: 'Adaptation' },
  { key: 'offline', label: 'Offline storage' },
  { key: 'audio', label: 'Audio use permission' },
  { key: 'export', label: 'Export' },
];
const safeHttps = (url: string | undefined) => {
  if (!url) return undefined;
  try { const parsed = new URL(url); return parsed.protocol === 'https:' ? parsed.href : undefined; }
  catch { return undefined; }
};
const noticeUrl = (edition: Edition) => edition.noticePath &&
  /^[A-Za-z0-9][A-Za-z0-9._-]*\/NOTICE\.txt$/.test(edition.noticePath) &&
  edition.noticePath.startsWith(`${edition.id}/`)
  ? assetUrl(`data/editions/${edition.noticePath}`) : undefined;

export default function EditionSources() {
  const [catalog, setCatalog] = useState<EditionCatalog | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    getEditionCatalog().then(data => { if (active) setCatalog(data); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Edition source details are unavailable.'); });
    return () => { active = false; };
  }, [retry]);

  return <section className="panel" aria-labelledby="edition-sources-title">
    <h2 id="edition-sources-title">Installed editions and sources</h2>
    <p className="muted">Permissions below come from each edition’s catalog. Full notices describe the applicable conditions.</p>
    {error && <div role="alert"><p>{error}</p><button onClick={() => setRetry(value => value + 1)}>Retry edition sources</button></div>}
    {!catalog && !error && <p role="status">Loading edition sources…</p>}
    {catalog?.editions.map(edition => {
      const publisher = (edition as Edition & { publisher?: string }).publisher;
      const notice = noticeUrl(edition);
      const source = safeHttps(edition.sourceUrl);
      const license = safeHttps(edition.licenseUrl);
      const deed = safeHttps(edition.licenseDeedUrl);
      return <article key={edition.id} aria-label={`${edition.name} source details`}>
        <h3>{edition.name}</h3>
        <p className="metadata">{edition.language} · {edition.corpus || 'Corpus not recorded'} · {edition.id}</p>
        {publisher && <p>Publisher: {publisher}</p>}
        <p>{edition.attribution || 'A separate attribution statement is not recorded in this catalog. Consult the source and license below.'}</p>
        <p>License: {edition.license}</p>
        <table><caption>{edition.name} permissions</caption><thead><tr><th scope="col">Use</th><th scope="col">Permission</th></tr></thead><tbody>
          {permissions.map(({ key, label }) => <tr key={key}><th scope="row">{label}</th><td>{edition.rights?.[key] === true ? 'Permitted, subject to license conditions' : edition.rights?.[key] === false ? 'Not permitted' : 'Not recorded'}</td></tr>)}
        </tbody></table>
        {edition.conditions?.length ? <ul>{edition.conditions.map((condition, index) => <li key={index}>{condition}</li>)}</ul> : null}
        <p className="muted">Audio permission describes licensing; it does not indicate an installed recording.</p>
        <div className="button-row">
          {source && <a href={source} target="_blank" rel="noreferrer">{edition.name} publisher source</a>}
          {license && <a href={license} target="_blank" rel="noreferrer">{edition.name} license</a>}
          {deed && <a href={deed} target="_blank" rel="noreferrer">{edition.name} license deed</a>}
          {notice && <a href={notice} download>Download {edition.name} full notice</a>}
        </div>
        {!notice && <p className="muted">No separate notice file is included in this catalog entry; consult its source license.</p>}
      </article>;
    })}
  </section>;
}

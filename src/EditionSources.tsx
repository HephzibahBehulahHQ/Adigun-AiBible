import { useEffect, useState } from 'react';
import { assetUrl, getEditionCatalog } from './data';
import { decideEditionOperation, editionOperations } from './edition-rights';
import { getRightsRegister } from './permissions';
import type { EditionOperation, EditionRightsRegister } from './edition-rights';
import type { Edition, EditionCatalog } from './types';

const operationLabels: Record<EditionOperation, string> = {
  display: 'Read source text', redistribution: 'Redistribution', offline: 'Offline storage',
  searchIndex: 'Search indexing', adaptation: 'Adaptation', translation: 'Translation',
  studyParaphrase: 'Study paraphrases', aiRetrieval: 'AI retrieval', modelTraining: 'Model training',
  tts: 'Text-to-speech', recordedAudio: 'Recorded audio', publicPerformance: 'Public performance',
  imageExport: 'Image export', videoExport: 'Video export', printExport: 'Printing',
  documentExport: 'Document export', peerSharing: 'Peer sharing', commercialUse: 'Commercial use',
};
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
  const [register, setRegister] = useState<EditionRightsRegister | null>(null);
  const [error, setError] = useState('');
  const [rightsError, setRightsError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    setRightsError('');
    setRegister(null);
    getEditionCatalog().then(data => { if (active) setCatalog(data); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Edition source details are unavailable.'); });
    getRightsRegister().then(data => { if (active) setRegister(data); })
      .catch(reason => { if (active) setRightsError(reason instanceof Error ? reason.message : 'Edition permissions could not be verified.'); });
    return () => { active = false; };
  }, [retry]);

  return <section className="panel" aria-labelledby="edition-sources-title">
    <h2 id="edition-sources-title">Installed editions and sources</h2>
    <p className="muted">Permissions are checked separately for each use and source revision. Full notices describe the applicable conditions.</p>
    {error && <div role="alert"><p>{error}</p><button onClick={() => setRetry(value => value + 1)}>Retry edition sources</button></div>}
    {rightsError && <div role="alert"><p>{rightsError}</p><button onClick={() => setRetry(value => value + 1)}>Retry permissions</button></div>}
    {!catalog && !error && <p role="status">Loading edition sources…</p>}
    {catalog?.editions.map(edition => {
      const publisher = (edition as Edition & { publisher?: string }).publisher;
      const notice = noticeUrl(edition);
      const source = safeHttps(edition.sourceUrl);
      const license = safeHttps(edition.licenseUrl);
      const deed = safeHttps(edition.licenseDeedUrl);
      const record = register?.editions.find(row => row.editionId === edition.id);
      const conditions = record?.conditions || edition.conditions;
      return <article key={edition.id} aria-label={`${edition.name} source details`}>
        <h3>{edition.name}</h3>
        <p className="metadata">{edition.language} · {edition.corpus || 'Corpus not recorded'} · {edition.id}</p>
        {publisher && <p>Publisher: {publisher}</p>}
        <p>{edition.attribution || 'A separate attribution statement is not recorded in this catalog. Consult the source and license below.'}</p>
        <p>License: {edition.license}</p>
        <table><caption>{edition.name} permissions</caption><thead><tr><th scope="col">Use</th><th scope="col">Permission</th></tr></thead><tbody>
          {editionOperations.map(operation => {
            const decision = edition.sha256
              ? decideEditionOperation(record, operation, { sourceSha256: edition.sha256, aiProductEnabled: false })
              : { allowed: false, reason: 'This source revision has no verified checksum.' };
            return <tr key={operation}><th scope="row">{operationLabels[operation]}</th><td>{!register
              ? (rightsError ? 'Not verified' : 'Checking permission…')
              : <><strong>{decision.allowed ? 'Permitted with conditions' : 'Unavailable'}</strong><br/>{decision.reason}</>}</td></tr>;
          })}
        </tbody></table>
        {conditions?.length ? <ul>{conditions.map((condition, index) => <li key={index}>{condition}</li>)}</ul> : null}
        {record && <p className="muted">Permission evidence checked: {record.verifiedOn}. Permission does not mean a recording or connected service is installed.</p>}
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

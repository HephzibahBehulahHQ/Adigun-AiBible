import { useState } from 'react';
import { getSupportCountry, officialSupportUrl, supportContactUrl, supportCountries } from './support-resources';
import './tools.css';

export default function SupportResources() {
  const [countryCode, setCountryCode] = useState('');
  const country = getSupportCountry(countryCode);
  return <div className="page tool-page" lang="en">
    <div className="page-heading">
      <span className="eyebrow">PRACTICAL SUPPORT</span>
      <h1>Support resources</h1>
      <p>Find emergency, listening and health services for the country you choose. Seeking professional care is compatible with faith.</p>
    </div>
    <section className="panel" aria-labelledby="support-country-heading">
      <h2 id="support-country-heading">Where do you need support?</h2>
      <p>If someone is in immediate danger, contact local emergency services now.</p>
      <div className="tool-controls">
        <label htmlFor="support-country">Country
          <select aria-label="Country" id="support-country" value={countryCode} onChange={event => setCountryCode(event.target.value)} aria-describedby="support-country-help">
            <option value="">Choose a country</option>
            {supportCountries.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}
          </select>
        </label>
        {country && <button type="button" className="secondary" onClick={() => setCountryCode('')}>Clear country</button>}
      </div>
      <p id="support-country-help" className="small muted">Choose the country where help is needed. This selection stays on this screen; it is not saved or inferred from your location.</p>
      <p role="status" className="small">{country ? `Showing resources for ${country.name}. Check each service’s area of coverage.` : 'No country selected. The initial directory covers Germany, Nigeria, the United Kingdom and the United States.'}</p>
    </section>
    {country && <section aria-label={`Support in ${country.name}`} key={country.code}>
      <h2>{country.name}</h2>
      <div className="tool-grid">{country.resources.map(resource => {
        const source = officialSupportUrl(resource.sourceUrl);
        const call = supportContactUrl('call', resource.callNumber);
        const message = supportContactUrl('text', resource.textNumber);
        return <article className="panel" key={resource.id} aria-labelledby={`${resource.id}-title`}>
          <span className="eyebrow">{resource.kind === 'emergency' ? 'EMERGENCY' : resource.kind === 'listening' ? 'SOMEONE TO TALK TO' : 'HEALTH SERVICES'}</span>
          <h3 id={`${resource.id}-title`}>{resource.name}</h3>
          <p>{resource.description}</p>
          <p className="small muted">Area: {resource.scope}</p>
          <div className="button-row">
            {call && <a className={resource.kind === 'emergency' ? 'primary' : 'secondary'} href={call} aria-label={`Call ${resource.name}: ${resource.callNumber}`}>Call {resource.callNumber}</a>}
            {message && <a className="secondary" href={message} aria-label={`Text ${resource.name}: ${resource.textNumber}`}>Text {resource.textNumber}</a>}
          </div>
          <p className="small" style={{ marginTop: 16 }}>{source ? <a href={source} rel="noreferrer" referrerPolicy="no-referrer">Official source: {resource.sourceName}</a> : 'Official source unavailable.'}</p>
          <p className="small muted">Source checked <time dateTime={resource.checkedOn}>4 November 2026</time>. Contact the provider for current access and availability.</p>
        </article>;
      })}</div>
      <p className="small muted">Call and text links open your device’s calling or messaging app. These are independent services; this directory does not send a request for help or monitor responses.</p>
    </section>}
  </div>;
}

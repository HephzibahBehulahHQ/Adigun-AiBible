import test from 'node:test';
import assert from 'node:assert/strict';
import { getSupportCountry, officialSupportUrl, supportContactUrl, supportCountries } from '../src/support-resources.ts';

test('country selection is explicit; clearing or an unknown country cannot retain emergency contacts', () => {
  assert.equal(getSupportCountry('DE')?.code, 'DE');
  assert.equal(getSupportCountry('US')?.code, 'US');
  for (const value of ['', null, undefined, 'de', 'Germany', 'FR', '__proto__', { code: 'DE' }]) assert.equal(getSupportCountry(value), null);
});

test('official-source navigation rejects scripts, credentials, lookalike hosts and other origins', () => {
  for (const value of ['javascript:alert(1)', 'data:text/html,hello', 'http://gesund.bund.de/notfallnummern', 'https://gesund.bund.de.evil.example/', 'https://gesund.bund.de@evil.example/', 'https://user:secret@gesund.bund.de/', 'https://gesund.bund.de:8080/', '//gesund.bund.de/', ' https://gesund.bund.de/', null]) assert.equal(officialSupportUrl(value), null);
  for (const country of supportCountries) for (const resource of country.resources) {
    assert.equal(officialSupportUrl(resource.sourceUrl), resource.sourceUrl, resource.id);
    assert.ok(resource.checkedOn && resource.sourceName && resource.scope, `${resource.id} needs dated, attributable scope`);
  }
});

test('call and text links cannot inject bodies, extensions, query strings or other protocols', () => {
  assert.equal(supportContactUrl('call', '112'), 'tel:112');
  assert.equal(supportContactUrl('text', '988'), 'sms:988');
  for (const number of [undefined, '988?body=private', '112;ext=123', 'javascript:alert(1)', ' 112', '+', 112, '1234567890123456']) assert.equal(supportContactUrl('call', number), null);
  assert.equal(supportContactUrl('email', '988'), null);
  for (const country of supportCountries) for (const resource of country.resources) {
    if (resource.callNumber) assert.ok(supportContactUrl('call', resource.callNumber), resource.id);
    if (resource.textNumber) assert.ok(supportContactUrl('text', resource.textNumber), resource.id);
  }
});

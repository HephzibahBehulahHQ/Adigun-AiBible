import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
const coverageRoute = '#/editorial-workbench/GEN/1?verse=1&edition=eng-web';
const metric = (scope: Locator, label: string) => scope.getByText(label, { exact: true }).locator('..').locator('dd');
async function openCoverage(page: Page) {
  await page.goto(coverageRoute);
  const region = page.getByRole('region', { name: 'Study content and device coverage', exact: true });
  await expect(region.getByText('Public coverage inventories checked. Unknown values are not counted as zero.', { exact: true })).toBeVisible();
  return region;
}

test('extended coverage separates publisher, draft, approved and installed content with narrow reflow', async ({ page }, testInfo) => {
  const region = await openCoverage(page);
  const speakers = region.getByRole('article', { name: 'Speaker annotations', exact: true });
  await expect(metric(speakers, 'Publisher-marked spans')).toHaveText('2,302');
  await expect(metric(speakers, 'Independent approved spans, source-verified')).toHaveText('0');
  const context = region.getByRole('article', { name: 'Context cards', exact: true });
  await expect(metric(context, 'Draft setting records')).toHaveText('11');
  await expect(metric(context, 'Published approved context records')).toHaveText('0');
  const history = region.getByRole('article', { name: 'Historical library', exact: true });
  await expect(metric(history, 'Readable permitted editions')).toHaveText('1');
  await expect(metric(history, 'Imported readable text units')).toHaveText('189');
  await expect(metric(history, 'External catalog-only records')).toHaveText('3');
  const lexical = region.getByRole('article', { name: 'Historical dictionaries', exact: true });
  await expect(metric(lexical, 'Dictionary number records')).toHaveText('14,298');
  await expect(metric(lexical, 'Supplied headwords')).toHaveText('14,197');
  const hebrew = region.getByRole('article', { name: 'Hebrew and Aramaic source corpus', exact: true });
  await expect(metric(hebrew, 'Original-language source books')).toHaveText('39');
  await expect(metric(hebrew, 'Source chapters')).toHaveText('929');
  await expect(metric(hebrew, 'Source verse records')).toHaveText('23,213');
  const pilots = region.getByRole('article', { name: 'Installed experience pilots', exact: true });
  await expect(metric(pilots, 'Named source or learning exercises')).toHaveText('5');
  await pilots.getByText('Available pilots and their limits', { exact: true }).click();
  await expect(pilots.getByText('Solo reading exercise · no shared mission state', { exact: false })).toBeVisible();
  const audio = region.getByRole('article', { name: 'Audio and configured services', exact: true });
  await expect(metric(audio, 'Bundled public recorded-audio files')).toHaveText('0');
  await expect(metric(audio, 'Configured connected services in this build')).toHaveText('0');
  await speakers.scrollIntoViewIfNeeded();
  const normal = testInfo.outputPath(`extended-coverage-${testInfo.project.name}.png`);
  await page.screenshot({ path: normal, animations: 'disabled' });
  await testInfo.attach('Extended coverage viewport', { path: normal, contentType: 'image/png' });
  await page.setViewportSize({ width: 320, height: 844 });
  await lexical.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const narrow = testInfo.outputPath('extended-coverage-320.png');
  await page.screenshot({ path: narrow, animations: 'disabled' });
  await testInfo.attach('Extended coverage 320px', { path: narrow, contentType: 'image/png' });
});

test('an unavailable dictionary manifest reports unknown while independent inventories remain usable and retry recovers', async ({ page }) => {
  await page.route('**/data/linguistics/manifest.json', route => route.fulfill({ status: 503, contentType: 'text/plain', body: 'Unavailable for this isolated test' }));
  const region = await openCoverage(page), lexical = region.getByRole('article', { name: 'Historical dictionaries', exact: true });
  await expect(metric(lexical, 'Dictionary number records')).toHaveText('Unknown');
  await expect(region.getByRole('alert').filter({ hasText: 'Historical dictionaries:' })).toBeVisible();
  await expect(metric(region.getByRole('article', { name: 'Historical library', exact: true }), 'Readable permitted editions')).toHaveText('1');
  await page.unroute('**/data/linguistics/manifest.json');
  await region.getByRole('button', { name: 'Refresh coverage inventories', exact: true }).click();
  await expect(metric(lexical, 'Dictionary number records')).toHaveText('14,298');
  await expect(region.getByRole('alert')).toHaveCount(0);
});

test('actual historical downloads count only while every cached source and notice matches this build', async ({ page }) => {
  await page.goto('#/library/GEN/1?verse=1&edition=eng-web');
  await page.getByRole('button', { name: /^(Download historical text|Verify historical download)/ }).click();
  await expect(page.getByText('Historical text and source notice downloaded for offline reading.', { exact: true })).toBeVisible();
  const region = await openCoverage(page), offline = region.getByRole('region', { name: 'Complete offline content on this device', exact: true });
  await offline.getByRole('button', { name: 'Check cached content packs', exact: true }).click();
  const didache = offline.getByRole('listitem').filter({ hasText: 'Didache — Lightfoot English transcription' });
  await expect(didache.locator('.extended-pack-state')).toHaveText('complete');
  const changed = await page.evaluate(async () => {
    const base = new URL('/Adigun-AiBible/', location.origin), metadata = await (await fetch(new URL('offline-manifest.json', base))).json();
    const notice = new URL('data/historical/didache-lightfoot-notice.txt', base); let changed = 0;
    for (const name of await caches.keys()) {
      if (name !== `${metadata.cachePrefix}content-${metadata.contentVersion}` && !name.startsWith(`${metadata.cachePrefix}pack-${metadata.contentVersion}-`)) continue;
      const cache = await caches.open(name);
      if (await cache.match(notice)) { await cache.put(notice, new Response('Corrupt source notice in this isolated browser test')); changed++; }
    }
    return changed;
  });
  expect(changed).toBeGreaterThan(0);
  await offline.getByRole('button', { name: 'Check cached content packs', exact: true }).click();
  await expect(didache.locator('.extended-pack-state')).toHaveText('invalid');
  await expect(didache.getByText('A cached file is missing or differs from this build. It is not counted as complete.', { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const base = new URL('/Adigun-AiBible/', location.origin), metadata = await (await fetch(new URL('offline-manifest.json', base))).json();
    for (const name of await caches.keys()) if (name === `${metadata.cachePrefix}content-${metadata.contentVersion}` || name.startsWith(`${metadata.cachePrefix}pack-${metadata.contentVersion}-`)) await (await caches.open(name)).delete(new URL('data/historical/didache-lightfoot-notice.txt', base));
  });
  await offline.getByRole('button', { name: 'Check cached content packs', exact: true }).click();
  await expect(didache.locator('.extended-pack-state')).toHaveText('partial');
  await expect(didache.getByText('2 of 3 required source and notice files are present.', { exact: true })).toBeVisible();
});


test('changed Hebrew inventory remains unknown and cannot borrow counts from another corpus', async ({ page }) => {
  await page.route('**/data/original-language/oshb/manifest.json', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"bookCount":39,"verseCount":23213}' }));
  const region = await openCoverage(page);
  const hebrew = region.getByRole('article', { name: 'Hebrew and Aramaic source corpus', exact: true });
  await expect(metric(hebrew, 'Original-language source books')).toHaveText('Unknown');
  await expect(metric(hebrew, 'Source verse records')).toHaveText('Unknown');
  await expect(region.getByRole('alert').filter({ hasText: 'Hebrew source inventory:' })).toBeVisible();
  await expect(metric(region.getByRole('article', { name: 'Historical dictionaries', exact: true }), 'Dictionary number records')).toHaveText('14,298');
  await page.unroute('**/data/original-language/oshb/manifest.json');
  await region.getByRole('button', { name: 'Refresh coverage inventories', exact: true }).click();
  await expect(metric(hebrew, 'Original-language source books')).toHaveText('39');
  await expect(region.getByRole('alert')).toHaveCount(0);
});

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const canonical = readFileSync(new URL('../data/books/GEN.json', import.meta.url));
const source = JSON.parse(canonical.toString('utf8'));
const firstVerse: string = source.chapters[0].verses[0].text;
const reading = '#/read/GEN/1?verse=1&edition=eng-web';
const bookPath = 'data/books/GEN.json';

// This is intentionally a required artifact gate, not a skip on an accidentally raw build.
test.beforeEach(async ({ request }) => {
  const response = await request.get(bookPath);
  expect(response.ok()).toBe(true);
  const envelope = await response.json();
  expect(envelope.kind, 'Build this browser candidate with ADIGUN_SOURCE_TRANSPORT=gzip-base64-v1').toBe('adigun.source-envelope');
  expect(envelope.decodedSha256).toBe(createHash('sha256').update(canonical).digest('hex'));
});

async function search(page: Page) {
  const input = page.locator('.global-search input');
  await input.fill('In the beginning');
  await input.press('Enter');
  const dialog = page.getByRole('dialog', { name: /Results for/ });
  await expect(dialog.getByText(firstVerse, { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close search', exact: true }).click();
}

test('packaged reader and search survive a complete atomic download and offline reload', async ({ page, context }) => {
  await page.goto(reading);
  await expect(page.locator('#verse-1')).toContainText(firstVerse);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await search(page);
  await page.goto('#/settings/GEN/1?verse=1&edition=eng-web');
  await page.getByRole('button', { name: 'Download complete Bible', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'and its search index are available offline.' })).toBeVisible();
  const retained = await page.evaluate(async () => {
    const base = new URL('/Adigun-AiBible/', location.origin), metadata = await (await fetch(new URL('offline-manifest.json', base))).json();
    for (const name of await caches.keys()) {
      if (!name.startsWith(`${metadata.cachePrefix}pack-${metadata.contentVersion}-`)) continue;
      const cache = await caches.open(name), marker = await cache.match(new URL('__adigun_offline_pack__.json', base));
      if (!marker || !(await marker.json()).paths.includes('data/search-index.json')) continue;
      return { book: (await (await cache.match(new URL('data/books/GEN.json', base)))!.json()).kind, search: (await (await cache.match(new URL('data/search-index.json', base)))!.json()).kind };
    }
    return null;
  });
  expect(retained).toEqual({ book: 'adigun.source-envelope', search: 'adigun.source-envelope' });
  await context.setOffline(true);
  try {
    await page.goto(reading);
    await page.reload();
    await expect(page.locator('#verse-1')).toContainText(firstVerse);
    await search(page);
  } finally { await context.setOffline(false); }
});

test('a corrupt cached envelope fails closed after reload and a fresh source restores reading', async ({ page, context }) => {
  await page.goto(reading);
  await expect(page.locator('#verse-1')).toContainText(firstVerse);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const changed = await page.evaluate(async () => {
    const base = new URL('/Adigun-AiBible/', location.origin), url = new URL('data/books/GEN.json', base);
    const metadata = await (await fetch(new URL('offline-manifest.json', base))).json();
    await fetch(url); // Ensure the controlled worker has retained this public source.
    let changed = 0;
    for (const name of await caches.keys()) {
      if (name !== `${metadata.cachePrefix}content-${metadata.contentVersion}` && !name.startsWith(`${metadata.cachePrefix}pack-${metadata.contentVersion}-`)) continue;
      const cache = await caches.open(name), response = await cache.match(url);
      if (response) { const envelope = await response.json(); envelope.decodedSha256 = '0'.repeat(64); await cache.put(url, Response.json(envelope)); changed++; }
    }
    return changed;
  });
  expect(changed).toBeGreaterThan(0);
  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.getByText('The decoded source checksum does not match its envelope.', { exact: true })).toBeVisible();
    await expect(page.locator('#verse-1')).toHaveCount(0);
  } finally { await context.setOffline(false); }
  await page.evaluate(async () => {
    const base = new URL('/Adigun-AiBible/', location.origin), metadata = await (await fetch(new URL('offline-manifest.json', base))).json();
    for (const name of await caches.keys()) if (name === `${metadata.cachePrefix}content-${metadata.contentVersion}` || name.startsWith(`${metadata.cachePrefix}pack-${metadata.contentVersion}-`)) await (await caches.open(name)).delete(new URL('data/books/GEN.json', base));
  });
  await page.reload();
  await expect(page.locator('#verse-1')).toContainText(firstVerse);
});

test.describe('unsupported browser and raw development compatibility', () => {
  test.use({ serviceWorkers: 'block' });
  test('missing gzip support produces an explicit source error', async ({ page }) => {
    await page.addInitScript(() => { Object.defineProperty(globalThis, 'DecompressionStream', { configurable: true, value: undefined }); });
    await page.goto(reading);
    await expect(page.getByText('This browser cannot decompress scripture. Use a current browser with gzip decompression support.', { exact: true })).toBeVisible();
    await expect(page.locator('#verse-1')).toHaveCount(0);
  });
  test('the same loader accepts canonical raw JSON without gzip support', async ({ page }) => {
    await page.addInitScript(() => { Object.defineProperty(globalThis, 'DecompressionStream', { configurable: true, value: undefined }); });
    await page.route('**/data/books/GEN.json', route => route.fulfill({ status: 200, contentType: 'application/json', body: canonical }));
    await page.goto(reading);
    await expect(page.locator('#verse-1')).toContainText(firstVerse);
  });
});

import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
test.use({ serviceWorkers: 'allow' });

const genesis = JSON.parse(readFileSync(new URL('../data/books/GEN.json', import.meta.url), 'utf8'));
const webEditionName = JSON.parse(readFileSync(new URL('../data/manifest.json', import.meta.url), 'utf8')).edition.name;
const genesisVerse = (chapter: number, verse: number): string => genesis.chapters.find((row: { number: number }) => row.number === chapter).verses.find((row: { number: number }) => row.number === verse).text;

test('concordance counts repeated source words separately from verses, preserves text and opens context', async ({ page }) => {
  await page.goto('#/concordance/GEN/1?verse=3&edition=eng-web');
  await expect(page.getByRole('heading', { name: 'Edition concordance', exact: true })).toBeVisible();
  await page.getByLabel('Concordance scope', { exact: true }).selectOption('book:GEN');
  await page.getByLabel('Source word or phrase', { exact: true }).fill('light');
  await page.getByRole('button', { name: 'Find occurrences', exact: true }).click();
  await expect(page.getByTestId('concordance-occurrences')).toHaveText('11');
  await expect(page.getByTestId('concordance-matching-verses')).toHaveText('8');
  await expect(page.getByTestId('concordance-searched-records')).toHaveText('1,533');
  expect(await page.locator('.concordance-source-text').first().textContent()).toBe(genesisVerse(1, 3));
  await expect(page.locator('.concordance-source-text').first().locator('mark')).toHaveCount(2);
  await page.getByText('Occurrences by book (1)', { exact: true }).click();
  await expect(page.getByRole('row', { name: 'Genesis 11 8', exact: true })).toBeVisible();
  await page.getByLabel('Match mode', { exact: true }).selectOption('phrase');
  await page.getByLabel('Source word or phrase', { exact: true }).fill('let there be light');
  await page.getByRole('button', { name: 'Find occurrences', exact: true }).click();
  await expect(page.getByTestId('concordance-occurrences')).toHaveText('1');
  await expect(page.getByTestId('concordance-matching-verses')).toHaveText('1');
  expect(await page.locator('.concordance-source-text').textContent()).toBe(genesisVerse(1, 3));
  await page.getByRole('button', { name: `Read Genesis 1:3 in ${webEditionName}`, exact: true }).click();
  await expect(page).toHaveURL(/#\/read\/GEN\/1\?verse=3&edition=eng-web$/);
  await expect(page.locator('#verse-3')).toContainText(genesisVerse(1, 3));
});

test('concordance pages extend beyond 100 verses with keyboard focus and 320px reflow', async ({ page }, testInfo) => {
  await page.goto('#/concordance/GEN/1?verse=1&edition=eng-web');
  await page.getByLabel('Source word or phrase', { exact: true }).fill('God');
  await page.getByRole('button', { name: 'Find occurrences', exact: true }).click();
  await expect(page.getByTestId('concordance-matching-verses')).toHaveText('3,553');
  const total = await page.getByTestId('concordance-occurrences').textContent();
  for (let number = 2; number <= 5; number++) {
    await page.getByRole('button', { name: 'Next result page', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.concordance-pagination')).toContainText(`Page ${number} of`);
    await expect(page.getByRole('heading', { name: 'Concordance results', exact: true })).toBeFocused();
  }
  await expect(page.locator('.concordance-matches li')).toHaveCount(25);
  expect(await page.locator('.concordance-source-text').first().textContent()).toBe(genesisVerse(21, 22));
  await expect(page.getByTestId('concordance-occurrences')).toHaveText(total!);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.getByText('Source identity, revision and permissions', { exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('concordance-320.png'), fullPage: false });
  await page.getByLabel('Source word or phrase', { exact: true }).fill('NotAScriptureWord');
  await expect(page.getByTestId('concordance-occurrences')).toHaveCount(0);
  await page.getByRole('button', { name: 'Find occurrences', exact: true }).click();
  await expect(page.getByTestId('concordance-occurrences')).toHaveText('0');
  await expect(page.getByText(/^Verified zero:/)).toBeVisible();
});

test('a complete downloaded edition reopens offline with exact Czech Unicode and complete concordance counts', async ({ page, context }) => {
  test.setTimeout(90_000);
  const id = 'ces-kralicka1613';
  const source = JSON.parse(readFileSync(new URL(`../data/editions/${id}/books/JHN.json`, import.meta.url), 'utf8')).chapters.find((chapter: { number: number }) => chapter.number === 3).verses.find((verse: { number: number }) => verse.number === 16).text;
  await page.goto(`#/settings/JHN/3?verse=16&edition=${id}`);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.getByRole('button', { name: 'Download complete Bible', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'and its search index are available offline.' })).toBeVisible({ timeout: 45_000 });
  await page.goto(`#/concordance/JHN/3?verse=16&edition=${id}`);
  await page.getByLabel('Match mode', { exact: true }).selectOption('phrase');
  await page.getByLabel('Source word or phrase', { exact: true }).fill('Nebo tak Bůh miloval');
  await page.getByRole('button', { name: 'Find occurrences', exact: true }).click();
  await expect(page.getByTestId('concordance-occurrences')).toHaveText('1');
  await context.setOffline(true);
  try {
    await page.reload();
    await page.getByLabel('Match mode', { exact: true }).selectOption('phrase');
    await page.getByLabel('Source word or phrase', { exact: true }).fill('Nebo tak Bůh miloval');
    await page.getByRole('button', { name: 'Find occurrences', exact: true }).click();
    await expect(page.getByTestId('concordance-occurrences')).toHaveText('1');
    await expect(page.getByTestId('concordance-searched-records')).toHaveText('31,172');
    expect(await page.locator('.concordance-source-text').textContent()).toBe(source);
    await page.getByRole('button', { name: /^Read .* 3:16 in Bible Kralická 1613$/ }).click();
    await expect(page.locator('#verse-16')).toContainText(source);
  } finally { await context.setOffline(false); }
});

test.describe('concordance cancellation and unavailable source states', () => {
  test.use({ serviceWorkers: 'block' });
  test('cancelling a pending index prevents stale results and a missing index does not become zero', async ({ page, context }) => {
    let release!: () => void, requested!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { requested = resolve; });
    await context.route('**/data/search-index.json', async route => { requested(); await held; await route.fulfill({ status: 404, body: 'Unavailable test source' }).catch(() => undefined); });
    await page.goto('#/concordance/GEN/1?verse=1&edition=eng-web');
    await page.getByLabel('Source word or phrase', { exact: true }).fill('God');
    await page.getByRole('button', { name: 'Find occurrences', exact: true }).click();
    await started;
    await page.getByRole('button', { name: 'Cancel concordance', exact: true }).click();
    await expect(page.getByRole('status', { name: 'Concordance status', exact: true })).toContainText('cancelled');
    release();
    await expect(page.getByTestId('concordance-occurrences')).toHaveCount(0);
    await page.getByLabel('Source word or phrase', { exact: true }).fill('light');
    await page.getByRole('button', { name: 'Find occurrences', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'source index or inventory is unavailable' })).toBeVisible();
    await expect(page.getByTestId('concordance-occurrences')).toHaveCount(0);
    await expect(page.getByText(/^Verified zero:/)).toHaveCount(0);
  });
});

import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

test.use({ serviceWorkers: 'block' });
const baseline = JSON.parse(readFileSync(new URL('../data/manifest.json', import.meta.url), 'utf8'));
const catalog = JSON.parse(readFileSync(new URL('../data/editions/catalog.json', import.meta.url), 'utf8'));
const editions: { id: string; name: string; language: string }[] = [baseline.edition, ...catalog.editions.filter((edition: { corpus: string }) => edition.corpus === 'bible')];

test('installed catalog exposes every actual source language and all paginated editions at 320px', async ({ page }, testInfo) => {
  await page.goto('#/editions/JHN/3?verse=16&edition=eng-web');
  await expect(page.getByText(`${editions.length} installed Bible text editions`, { exact: false })).toBeVisible();
  const languages = [...new Set(editions.map(edition => edition.language))];
  await expect(page.getByRole('combobox', { name: 'Language', exact: true }).locator('option')).toHaveCount(languages.length + 1);
  const results = page.getByRole('region', { name: 'Installed Bible editions', exact: true });
  for (const language of languages) {
    await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption(language);
    const names: string[] = [];
    while (true) {
      names.push(...await results.getByRole('heading', { level: 2 }).allTextContents());
      const next = page.getByRole('button', { name: 'Next editions', exact: true });
      if (!await next.count() || !await next.isEnabled()) break;
      await next.click();
    }
    expect(names.sort()).toEqual(editions.filter(edition => edition.language === language).map(edition => edition.name).sort());
  }
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('');
  await page.getByLabel('Find an edition', { exact: true }).fill('German');
  await expect(results.getByRole('article')).toHaveCount(editions.filter(edition => edition.language === 'de').length);
  await page.getByLabel('Find an edition', { exact: true }).fill('No edition has this name');
  await expect(page.getByText('No installed edition matches this search and language filter.', { exact: true })).toBeVisible();
  await page.getByLabel('Find an edition', { exact: true }).fill('');
  await expect(results.getByRole('article')).toHaveCount(Math.min(12, editions.length));
  const normal = testInfo.outputPath(`edition-catalog-${testInfo.project.name}.png`);
  await page.screenshot({ path: normal, animations: 'disabled' });
  await testInfo.attach('Expanded catalog', { path: normal, contentType: 'image/png' });
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const narrow = testInfo.outputPath('edition-catalog-320.png');
  await page.screenshot({ path: narrow, animations: 'disabled' });
  await testInfo.attach('Expanded catalog 320px', { path: narrow, contentType: 'image/png' });
});

test('opening another source edition retains the complete selected verse range', async ({ page }) => {
  await page.goto('#/editions/JHN/3?verse=16&end=18&edition=eng-web');
  await page.getByLabel('Find an edition', { exact: true }).fill('eng-bsb');
  await page.getByRole('button', { name: 'Read edition', exact: true }).click();
  await expect(page).toHaveURL(/#\/read\/JHN\/3\?verse=16&end=18&edition=eng-bsb/);
  await expect(page.locator('#verse-18')).toBeVisible();
  await expect(page.locator('.reader')).toContainText('Berean Standard Bible');
});

test('an edition with a shorter numbered chapter cannot silently shorten the selected range', async ({ page }) => {
  // WEB supplies Romans 14:26; the installed BSB chapter ends at 23.
  await page.goto('#/editions/ROM/14?verse=23&end=26&edition=eng-web');
  await page.getByLabel('Find an edition', { exact: true }).fill('eng-bsb');
  await page.getByRole('button', { name: 'Read edition', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'numbered coverage' })).toContainText('the current selection has been retained');
  await expect(page).toHaveURL(/#\/editions\/ROM\/14\?verse=23&end=26&edition=eng-web/);
  expect(await page.evaluate(() => localStorage.getItem('adigun-edition-recent'))).toBeNull();
});

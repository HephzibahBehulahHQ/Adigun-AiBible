import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('Croatian Šarić opens and displays exact source text with the source Esther ID', async ({ page }) => {
  const id = 'hrv-saric';
  const source = JSON.parse(readFileSync(new URL(`../data/editions/${id}/books/GEN.json`, import.meta.url), 'utf8'));
  const expected = source.chapters.find((chapter: { number: number }) => chapter.number === 1)!.verses.find((verse: { number: number }) => verse.number === 1)!.text;

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('#/editions/GEN/1?verse=1&edition=eng-web');
  await page.getByLabel('Find an edition', { exact: true }).fill(id);
  const card = page.getByRole('region', { name: 'Installed Bible editions', exact: true }).getByRole('article');
  await expect(card.getByRole('heading', { name: 'Sveta Biblija · Croatian', exact: true })).toBeVisible();
  await card.getByRole('button', { name: 'Read edition', exact: true }).click();
  await expect(page).toHaveURL(/edition=hrv-saric/);
  await expect(page.locator('.reader-title .eyebrow')).toHaveText('Sveta Biblija · Croatian');
  await expect.poll(async () => (await page.locator('#verse-1 [data-source-run]').allTextContents()).join('')).toBe(expected);
});

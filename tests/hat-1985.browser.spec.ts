import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('Haitian Creole 1985 opens and displays the exact publisher verse text', async ({ page }) => {
  const id = 'hat-1985';
  const source = JSON.parse(readFileSync(new URL(`../data/editions/${id}/books/JHN.json`, import.meta.url), 'utf8'));
  const expected = source.chapters.find((chapter: { number: number }) => chapter.number === 3)!.verses.find((verse: { number: number }) => verse.number === 16)!.text;

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('#/editions/JHN/3?verse=16&edition=eng-web');
  await page.getByLabel('Find an edition', { exact: true }).fill(id);
  const card = page.getByRole('region', { name: 'Installed Bible editions', exact: true }).getByRole('article');
  await expect(card.getByRole('heading', { name: 'Bib La · Haitian Creole 1985', exact: true })).toBeVisible();
  await card.getByRole('button', { name: 'Read edition', exact: true }).click();
  await expect(page).toHaveURL(/edition=hat-1985/);
  await expect(page.locator('.reader-title .eyebrow')).toHaveText('Bib La · Haitian Creole 1985');
  await expect.poll(async () => (await page.locator('#verse-16 [data-source-run]').allTextContents()).join('')).toBe(expected);
});

import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

test('Quran source search supports Boolean operators and surah scope without mixing corpora', async ({ page }) => {
  await page.goto('#/library');
  await page.getByRole('button', { name: 'Open English Quran reader' }).click();
  const form = page.locator('.quran-reader form');
  const query = form.getByRole('searchbox', { name: 'Search English Quran source' });
  await expect(query).toBeVisible();
  await query.fill('Allah AND Gracious');
  await form.getByLabel('Match').selectOption('boolean');
  await form.getByRole('button', { name: 'Search Quran source' }).click();
  const results = page.getByLabel('Quran source search results');
  await expect(results).toContainText('Quran 1:1');
  await form.getByLabel('Search Quran surah').selectOption('2');
  await query.fill('Allah');
  await form.getByRole('button', { name: 'Search Quran source' }).click();
  await expect(results).toContainText('Quran 2:');
  await expect(results).not.toContainText('Quran 1:');
});

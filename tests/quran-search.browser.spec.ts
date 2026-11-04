import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

test('Quran source search supports Boolean operators and surah scope without mixing corpora', async ({ page }) => {
  await page.goto('#/library');
  await page.getByRole('button', { name: 'Open English Quran reader' }).click();
  const form = page.locator('.quran-reader form');
  const query = form.getByRole('searchbox', { name: 'Search English Quran source' });
  await expect(query).toBeVisible();
  await query.fill('Allah AND Gracious');
  await form.getByLabel('Quran search match').selectOption('boolean');
  await form.getByRole('button', { name: 'Search Quran source' }).click();
  const results = page.getByLabel('Quran source search results');
  await expect(results).toContainText('Quran 1:1');
  await form.getByLabel('Search Quran surah').selectOption('2');
  await query.fill('Allah');
  await form.getByRole('button', { name: 'Search Quran source' }).click();
  await expect(results).toContainText('Quran 2:');
  await expect(results).not.toContainText('Quran 1:');

  await page.getByLabel('Name this saved Quran search').fill('Mercy in Surah Two');
  await page.getByRole('button', { name: 'Save search privately' }).click();
  await expect(page.getByRole('status')).toContainText('Search saved privately on this device.');

  await query.fill('gracious');
  await form.getByLabel('Quran search match').selectOption('phrase');
  await form.getByLabel('Search Quran surah').selectOption('');
  await form.getByLabel('Exclude Quran words').fill('worlds');
  await page.getByRole('button', { name: 'Load saved search Mercy in Surah Two' }).click();
  await expect(query).toHaveValue('Allah');
  await expect(form.getByLabel('Quran search match')).toHaveValue('boolean');
  await expect(form.getByLabel('Search Quran surah')).toHaveValue('2');
  await expect(form.getByLabel('Exclude Quran words')).toHaveValue('');

  await page.reload();
  await page.getByRole('button', { name: 'Open English Quran reader' }).click();
  await expect(page.getByRole('button', { name: 'Load saved search Mercy in Surah Two' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete saved search Mercy in Surah Two' }).click();
  await expect(page.getByText('No saved Quran searches yet.')).toBeVisible();
});

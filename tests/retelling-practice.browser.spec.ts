import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

test('self-guided retelling supports replay and saves a private edition-bound entry', async ({ page }) => {
  await page.goto('#/study/JHN/3?verse=16&end=17&edition=eng-web');
  await expect(page.getByRole('heading', { name: 'Personal workspace', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reflections', exact: true }).click();
  await page.getByRole('button', { name: 'Start retelling practice', exact: true }).click();

  const retelling = page.getByLabel('Retell the passage in your own words');
  await retelling.fill('This is my own-word summary of the selected passage.');
  const people = page.getByRole('checkbox', { name: 'Did I retain the key people or participants?' });
  await people.check();
  await page.getByRole('button', { name: 'Replay', exact: true }).click();
  await expect(retelling).toHaveValue('');
  await expect(people).not.toBeChecked();

  await retelling.fill('The passage describes love and trust; this is my own retelling, not a quotation.');
  await people.check();
  await page.getByRole('checkbox', { name: 'Did I retain the key events or actions?' }).check();
  await page.getByRole('checkbox', { name: 'Did I preserve the order or sequence?' }).check();
  await page.getByRole('checkbox', { name: 'Did I retain the main point or message?' }).check();
  await page.getByRole('button', { name: 'Save private retelling', exact: true }).click();

  const title = page.getByRole('heading', { name: 'Retelling practice · JHN 3:16–17 · eng-web', exact: true });
  await expect(title).toBeVisible();
  await expect(page.getByText(/not a score/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Personal workspace', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reflections', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Retelling practice · JHN 3:16–17 · eng-web', exact: true })).toBeVisible();
});

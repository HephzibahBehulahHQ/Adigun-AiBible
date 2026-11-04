import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

test('guided interpretation challenge saves privately against the exact passage and survives reload', async ({ page }) => {
  await page.goto('#/study/JHN/3?verse=16&end=17&edition=eng-web');
  await expect(page.getByRole('heading', { name: 'Personal workspace', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reflections', exact: true }).click();
  await page.getByRole('button', { name: 'Start challenge', exact: true }).click();

  await page.getByLabel(/1\. Observation/).fill('The passage explicitly states the source wording.');
  await page.getByLabel(/2\. Context/).fill('Read the surrounding paragraph before drawing a conclusion.');
  await page.getByLabel(/3\. Alternative readings/).fill('Consider another plausible interpretation.');
  await page.getByLabel(/4\. Uncertainty/).fill('The wider audience context needs more study.');
  await page.getByLabel('Sources considered (optional, one per line)').fill('John 3:15\nA study note I reviewed');

  await page.getByRole('button', { name: 'Save private challenge', exact: true }).click();
  const title = page.getByRole('heading', { name: 'Interpretation challenge · JHN 3:16–17 · eng-web', exact: true });
  await expect(title).toBeVisible();
  await expect(page.getByText('What remains uncertain', { exact: true })).toBeVisible();
  await expect(page.getByText('The wider audience context needs more study.')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Personal workspace', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reflections', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Interpretation challenge · JHN 3:16–17 · eng-web', exact: true })).toBeVisible();
});

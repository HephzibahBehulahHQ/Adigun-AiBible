import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

test('Douay-Rheims opens its source Tobit text from the edition-specific 73-book list', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('#/editions/JHN/3?verse=16&edition=eng-web');
  await page.getByLabel('Find an edition', { exact: true }).fill('eng-douay-rheims1899');
  const card = page.getByRole('region', { name: 'Installed Bible editions', exact: true }).getByRole('article');
  await expect(card.getByRole('heading', { name: 'Douay-Rheims 1899', exact: true })).toBeVisible();
  await expect(card.locator('p.availability-note').first()).toContainText('Douay-Rheims source list · 73 books');
  await card.getByRole('button', { name: 'Read edition', exact: true }).click();
  await expect(page).toHaveURL(/edition=eng-douay-rheims1899/);
  const oldTestamentFilter = page.getByRole('button', { name: 'Old Testament', exact: true });
  await expect(oldTestamentFilter).toBeVisible();
  await oldTestamentFilter.click();
  await expect(page.getByRole('button', { name: 'Tobit' })).toBeVisible();
  await page.getByLabel('Choose book', { exact: true }).selectOption('TOB');
  await expect(page).toHaveURL(/#\/read\/TOB\/1\?/);
  await expect(page.locator('.reader-breadcrumb span').first()).toHaveText('Old Testament');
  await expect(page.locator('.reader')).toContainText('Tobias of the tribe and city of Nephtali');
  await expect(page.locator('.reader')).toContainText('Douay-Rheims 1899');
});

import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

test('Clementine Vulgate advertises its source book list and opens Tobit', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('#/editions/JHN/3?verse=16&edition=eng-web');
  await page.getByLabel('Find an edition', { exact: true }).fill('lat-clementine1598');
  const card = page.getByRole('region', { name: 'Installed Bible editions', exact: true }).getByRole('article');
  await expect(card.getByRole('heading', { name: 'Clementine Vulgate 1598', exact: true })).toBeVisible();
  await expect(card.locator('p.availability-note').first()).toContainText('Clementine Vulgate source list · 73 books');
  await card.getByRole('button', { name: 'Read edition', exact: true }).click();
  await expect(page).toHaveURL(/edition=lat-clementine1598/);
  const oldTestamentFilter = page.getByRole('button', { name: 'Old Testament', exact: true });
  if (await oldTestamentFilter.count()) {
    await oldTestamentFilter.click();
    await expect(page.getByRole('button', { name: 'Tobit' })).toBeVisible();
  }
  await page.getByLabel('Choose book', { exact: true }).selectOption('TOB');
  await expect(page).toHaveURL(/#\/read\/TOB\/1\?/);
  await expect(page.locator('.reader-breadcrumb span').first()).toHaveText('Old Testament');
  await expect(page.locator('.reader')).toContainText('Tobias ex tribu et civitate Nephthali');
  await expect(page.locator('.reader')).toContainText('Clementine Vulgate 1598');
});

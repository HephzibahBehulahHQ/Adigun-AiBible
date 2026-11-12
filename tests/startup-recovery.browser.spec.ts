import { expect, test } from '@playwright/test';

// A missing lazy workspace asset must not leave an empty application root.
// The recovery action must restore a working, genuine source-reader route.
test('failed lazy workspace offers a working reader recovery instead of a blank page', async ({ page }) => {
  const chunk = /\/assets\/GospelWorkspace-[^/]+\.js(?:\?.*)?$/;
  await page.route(chunk, route => route.abort('failed'));
  await page.goto('#/gospels/GEN/1?verse=1&edition=eng-web');
  await expect(page.getByRole('heading', { name: 'This view could not be opened' })).toBeVisible();
  await expect(page.locator('#root')).not.toBeEmpty();
  await expect(page.getByRole('button', { name: 'Reload application' })).toBeEnabled();
  await page.unroute(chunk);
  await page.getByRole('button', { name: 'Open Bible reader' }).click();
  await expect(page.locator('#verse-1 > p')).toBeVisible();
  await expect(page.locator('#verse-1 > p')).not.toBeEmpty();
  await expect(page).toHaveURL(/#\/read\/GEN\/1\?verse=1&edition=eng-web$/);
});

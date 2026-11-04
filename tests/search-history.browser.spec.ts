import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

async function search(page, query: string) {
  const field = page.locator('.global-search input');
  await field.fill(query);
  await field.press('Enter');
  const dialog = page.getByRole('dialog', { name: new RegExp(`Results for.*${query}`, 'i') });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('recent searches persist locally, can be removed individually and cleared deliberately', async ({ page }) => {
  await page.goto('#/read/GEN/1?verse=1&edition=eng-web');
  let dialog = await search(page, 'love');
  const history = dialog.locator('.search-history');
  await expect(history.getByText('Recent searches · this device')).toBeVisible();
  await expect(history.getByText('love', { exact: true })).toBeVisible();

  await page.reload();
  dialog = await search(page, 'peace');
  const restored = dialog.locator('.search-history');
  await expect(restored.getByText('love', { exact: true })).toBeVisible();
  await expect(restored.getByText('peace', { exact: true })).toBeVisible();

  await restored.getByRole('button', { name: 'Remove recent search love', exact: true }).click();
  await expect(restored.getByText('love', { exact: true })).toHaveCount(0);
  await restored.getByRole('button', { name: 'Clear history', exact: true }).click();
  await expect(dialog.locator('.search-history')).toHaveCount(0);
});

import { expect, test } from '@playwright/test';

test('tool directory and keyboard commands preserve the complete passage when opening concordance', async ({ page }) => {
  const query = 'JHN/3?verse=16&end=18&edition=eng-bsb';
  await page.goto(`#/tools/${query}`);
  await page.getByRole('button', { name: 'Open edition concordance', exact: true }).click();
  await expect(page).toHaveURL(/#\/concordance\/JHN\/3\?verse=16&end=18&edition=eng-bsb$/);
  await expect(page.getByRole('heading', { name: 'Edition concordance', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Concordance edition', exact: true })).toHaveValue('eng-bsb');

  await page.goto(`#/read/${query}`);
  await expect(page.locator('#verse-16')).toBeVisible();
  await page.getByRole('button', { name: 'Open command palette', exact: true }).click();
  const commands = page.getByRole('dialog', { name: 'Command palette', exact: true });
  const input = commands.getByLabel('Find a command', { exact: true });
  await input.fill('Edition concordance');
  await input.press('Enter');
  await expect(commands).toHaveCount(0);
  await expect(page).toHaveURL(/#\/concordance\/JHN\/3\?verse=16&end=18&edition=eng-bsb$/);
  await expect(page.getByRole('combobox', { name: 'Concordance edition', exact: true })).toHaveValue('eng-bsb');
});

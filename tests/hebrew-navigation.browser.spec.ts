import { expect, test } from '@playwright/test';

test('Hebrew study navigation preserves the complete independent Bible context', async ({ page }) => {
  const query = 'JHN/3?verse=16&end=18&edition=eng-bsb';
  await page.goto(`#/tools/${query}`);
  await page.getByRole('button', { name: 'Open hebrew and aramaic source study', exact: true }).click();
  await expect(page).toHaveURL(/#\/hebrew-study\/JHN\/3\?verse=16&end=18&edition=eng-bsb$/);
  await expect(page.getByTestId('hebrew-source-reference')).toHaveText('OSHB Gen.1.1');
  await page.goto(`#/read/${query}`);
  await expect(page.locator('#verse-16')).toBeVisible();
  await page.getByRole('button', { name: 'Open command palette', exact: true }).click();
  const commands = page.getByRole('dialog', { name: 'Command palette', exact: true });
  const input = commands.getByLabel('Find a command', { exact: true });
  await input.fill('Hebrew and Aramaic source study');
  await input.press('Enter');
  await expect(commands).toHaveCount(0);
  await expect(page).toHaveURL(/#\/hebrew-study\/JHN\/3\?verse=16&end=18&edition=eng-bsb$/);
  await expect(page.getByTestId('hebrew-source-reference')).toHaveText('OSHB Gen.1.1');
});

import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

test('written retelling is edition-bound, private, editable by deletion and retained across reload', async ({ page }) => {
  await page.goto('#/study/JHN/3?verse=16&edition=eng-web');
  await expect(page.getByRole('heading', { name: 'Personal workspace', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Memorization', exact: true }).click();
  await page.getByRole('button', { name: 'Add to memorization', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Practice this passage', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Write a retelling', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Retell in your own words', exact: true })).toBeVisible();
  await expect(page.getByText(/This is a personal paraphrase exercise, not a verbatim test/)).toBeVisible();
  const retelling = page.getByLabel('My retelling', { exact: true });
  await retelling.fill('My opening thought.');
  await page.getByRole('button', { name: 'Insert optional reflection prompts' }).click();
  await expect(retelling).toHaveValue(/What happens in this passage\?/);
  await expect(retelling).toHaveValue(/^My opening thought\./);
  await page.getByRole('button', { name: 'Insert optional reflection prompts' }).click();
  expect((await retelling.inputValue()).match(/What happens in this passage\?/g)).toHaveLength(1);
  await retelling.fill('The passage describes love shown through giving, not merely words.');
  await page.getByRole('button', { name: 'Save private retelling', exact: true }).click();
  await expect(page.getByLabel('My retelling', { exact: true })).toHaveValue('');

  await page.getByText('Saved retellings (1)', { exact: true }).click();
  await expect(page.getByText('The passage describes love shown through giving, not merely words.', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Memorization', exact: true }).click();
  await page.getByRole('button', { name: 'Write a retelling', exact: true }).click();
  await page.getByText('Saved retellings (1)', { exact: true }).click();
  await expect(page.getByText('The passage describes love shown through giving, not merely words.', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /^Delete retelling from/ }).click();
  await expect(page.getByText('Saved retellings (1)', { exact: true })).toHaveCount(0);
});

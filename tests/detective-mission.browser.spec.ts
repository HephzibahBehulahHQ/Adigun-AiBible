import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

test('Good Samaritan detective mission uses source evidence, retries clues and saves completed progress privately', async ({ page }) => {
  await page.goto('#/study/JHN/3?verse=16&edition=eng-web');
  await expect(page.getByRole('heading', { name: 'Personal workspace', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reflections', exact: true }).click();
  await page.getByRole('button', { name: 'Start detective mission', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Who first asked Jesus a question about inheriting eternal life?' })).toBeVisible();
  await page.getByRole('button', { name: 'Show hint', exact: true }).click();
  await expect(page.getByText(/Start with the opening exchange in Luke 10:25/)).toBeVisible();
  await expect(page.getByText(/LUK 10:25–29/)).toBeVisible();

  await page.getByRole('radio', { name: 'A Roman soldier' }).check();
  await page.getByRole('button', { name: 'Check answer', exact: true }).click();
  await expect(page.locator('.detective-mission p[role="status"]').last()).toContainText('Not yet');
  await page.getByRole('radio', { name: 'A lawyer' }).check();
  await page.getByRole('button', { name: 'Check answer', exact: true }).click();
  await expect(page.locator('.detective-mission p[role="status"]').last()).toContainText('Clue solved');
  await page.getByRole('button', { name: 'Next clue', exact: true }).click();

  const answers = [
    'A priest and a Levite',
    'A Samaritan',
    'He treated the wounds, used his animal and arranged care at an inn',
    'The one who showed mercy'
  ];
  for (let i = 0; i < answers.length; i++) {
    await page.getByRole('radio', { name: answers[i], exact: true }).check();
    await page.getByRole('button', { name: 'Check answer', exact: true }).click();
    await expect(page.locator('.detective-mission p[role="status"]').last()).toContainText('Clue solved');
    if (i < answers.length - 1) await page.getByRole('button', { name: 'Next clue', exact: true }).click();
  }

  await expect(page.getByRole('heading', { name: 'Mission complete', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save private mission result', exact: true }).click();
  const title = page.getByRole('heading', { name: 'Detective mission · The Good Samaritan: follow the evidence', exact: true });
  await expect(title).toBeVisible();
  await expect(page.getByText(/5\/5 evidence clues solved/)).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Personal workspace', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reflections', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Detective mission · The Good Samaritan: follow the evidence', exact: true })).toBeVisible();
});

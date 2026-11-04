import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

test('decision simulation presents consequences, supports replay and saves a private passage-linked reflection', async ({ page }) => {
  await page.goto('#/study/JHN/3?verse=16&edition=eng-web');
  await expect(page.getByRole('heading', { name: 'Personal workspace', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reflections', exact: true }).click();
  await page.getByRole('button', { name: 'Start simulation', exact: true }).click();

  const privateChoice = page.getByRole('radio', { name: /Speak privately with your colleague/ });
  await privateChoice.check();
  await expect(page.getByRole('heading', { name: 'A plausible consequence — not a prediction' })).toBeVisible();
  await expect(page.getByText(/This can preserve cooperation/)).toBeVisible();

  await page.getByRole('button', { name: 'Replay', exact: true }).click();
  await expect(privateChoice).not.toBeChecked();
  await expect(page.getByRole('heading', { name: 'A plausible consequence — not a prediction' })).toHaveCount(0);

  await page.getByRole('radio', { name: /Ask the team to pause and verify/ }).check();
  await page.getByLabel(/What would you verify first/).fill('I would compare the figure with the source record and consider who will rely on the report.');
  await page.getByRole('button', { name: 'Save private reflection', exact: true }).click();

  const title = page.getByRole('heading', { name: 'Decision simulation · The report before the deadline', exact: true });
  await expect(title).toBeVisible();
  await expect(page.getByText(/Fictional learning exercise — not Scripture/)).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Personal workspace', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reflections', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Decision simulation · The report before the deadline', exact: true })).toBeVisible();
});


test('second decision scenario addresses consent and privacy with selected-edition references', async ({ page }) => {
  await page.goto('#/study/JHN/3?verse=16&edition=eng-web');
  await expect(page.getByRole('heading', { name: 'Personal workspace', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reflections', exact: true }).click();
  await page.getByLabel('Decision scenario', { exact: true }).selectOption('private-support');
  await expect(page.getByRole('heading', { name: 'Decision simulation: A request for private details', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start simulation', exact: true }).click();
  await expect(page.getByText(/asks you to keep it private/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Relevant passages in the selected edition' })).toBeVisible();
  await page.getByRole('radio', { name: /Keep the details private and ask the organizer/ }).check();
  await expect(page.getByText(/This protects the confidence/)).toBeVisible();
  await page.getByLabel(/What did your friend actually consent/).fill('I would ask permission and offer support without sharing personal details.');
  await page.getByRole('button', { name: 'Save private reflection', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Decision simulation · A request for private details', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Reflections', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Decision simulation · A request for private details', exact: true })).toBeVisible();
});

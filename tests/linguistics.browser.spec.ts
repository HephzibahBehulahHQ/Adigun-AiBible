import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
test.use({ serviceWorkers: 'allow' });

test('historical lexical lookup preserves Aramaic evidence and private translation exercises', async ({ page }) => {
  await page.goto('#/linguistics/GEN/1?verse=1&end=2&edition=eng-web');
  await expect(page.getByRole('heading', { name: 'Original-language study', exact: true })).toBeVisible();
  await page.getByLabel('Find a lexical entry', { exact: true }).fill('H2');
  await page.getByRole('button', { name: /H2 · אַב/ }).click();
  const entry = page.getByRole('region', { name: 'Selected dictionary entry' });
  await expect(entry.getByText(/Aramaic · transliteration/)).toBeVisible();
  await expect(entry.getByText('{father}', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start private exercise with this entry', exact: true }).click();
  await page.getByLabel('Exercise title', { exact: true }).fill('My language comparison');
  await page.getByLabel('My first wording choice', { exact: true }).fill('My first unreviewed wording');
  await page.getByLabel('My second wording choice', { exact: true }).fill('My second unreviewed wording');
  await page.getByLabel('Private reasoning, grammar questions and uncertainties', { exact: true }).fill('PRIVATE QUESTIONS');
  await expect(page.getByRole('heading', { name: /Genesis 1:1–2 · World English Bible/ })).toBeVisible();
  await page.getByRole('button', { name: 'Save translation exercise', exact: true }).click();
  await expect(page.getByText('Translation exercise saved privately. Source Scripture remains unchanged.', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Private translation exercises', exact: true }).click();
  await page.getByRole('button', { name: /My language comparison/ }).click();
  await expect(page.getByLabel('My first wording choice', { exact: true })).toHaveValue('My first unreviewed wording');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download translation backup', exact: true }).click();
  const downloaded = await downloading, raw = await readFile((await downloaded.path())!, 'utf8'), backup = JSON.parse(raw);
  expect(backup.experiments[0].entryId).toBe('H2'); expect(backup.experiments[0].status).toBe('private_user_exercise'); expect(raw).toContain('PRIVATE QUESTIONS'); expect(raw).not.toContain('In the beginning');
});

test('unused Strong numbers stay explicit and malformed restores keep private writing', async ({ page }) => {
  await page.goto('#/linguistics/GEN/1?verse=1&edition=eng-web');
  await page.getByLabel('Find a lexical entry', { exact: true }).fill('G2717');
  await page.getByRole('button', { name: /G2717 · No headword supplied/ }).click();
  await expect(page.getByRole('region', { name: 'Selected dictionary entry' }).getByText('Not Used', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start private exercise with this entry', exact: true })).toHaveCount(0);
  await page.getByLabel('Find a lexical entry', { exact: true }).fill('H1');
  await page.getByRole('button', { name: /H1 · אָב/ }).click();
  await page.getByRole('button', { name: 'Start private exercise with this entry', exact: true }).click();
  await page.getByLabel('Exercise title').fill('Keep my private exercise');
  await page.getByRole('button', { name: 'Save translation exercise', exact: true }).click();
  await expect(page.getByText('Translation exercise saved privately. Source Scripture remains unchanged.', { exact: true })).toBeVisible();
  await page.getByLabel('Preview translation backup', { exact: true }).setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"kind":"another-app"}') });
  await expect(page.getByRole('alert').filter({ hasText: 'Choose an Adigun' })).toBeVisible();
  await expect(page.getByLabel('Exercise title')).toHaveValue('Keep my private exercise');
  await page.getByLabel('My first wording choice').fill('Unsaved thought');
  expect(await page.evaluate(() => window.dispatchEvent(new Event('adigun:before-update', { cancelable: true })))).toBe(false);
  page.once('dialog', dialog => dialog.dismiss());
  expect(await page.evaluate(() => window.dispatchEvent(new Event('adigun:before-navigation', { cancelable: true })))).toBe(false);
  await page.setViewportSize({ width: 320, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});


test('downloaded lexicons reopen offline with unchanged Aramaic wording and source notices', async ({ page, context }) => {
  await page.goto('#/linguistics/GEN/1?verse=1&edition=eng-web');
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.getByRole('button', { name: /^(Download dictionaries and notices|Verify dictionary downloads)$/ }).click();
  await expect(page.getByText('Both dictionaries and their source notices are verified for offline lookup.', { exact: true })).toBeVisible();
  await context.setOffline(true);
  try {
    await page.reload();
    await page.getByLabel('Find a lexical entry', { exact: true }).fill('H2');
    await page.getByRole('button', { name: /H2 · אַב/ }).click();
    const entry = page.getByRole('region', { name: 'Selected dictionary entry' });
    await expect(entry.getByText('{father}', { exact: true })).toBeVisible();
    await expect(page.getByText('Both historical dictionaries and the complete source notices are downloaded on this device.', { exact: false })).toBeVisible();
  } finally { await context.setOffline(false); }
});

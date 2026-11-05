import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.use({ serviceWorkers: 'block' });

test('ministry preparation preserves exact readings, private notes and participant-only export', async ({ page }) => {
  await page.goto('#/ministry/JHN/3?verse=16&end=17&edition=eng-web');
  await expect(page.getByRole('heading', { name: 'Ministry workspace', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'New outline', exact: true }).click();
  await page.getByLabel('Outline title', { exact: true }).fill('My passage lesson');
  await page.getByLabel('Participant introduction', { exact: true }).fill('Read the chapter together.');
  await page.getByLabel('Private context and source notes').fill('PRIVATE CONTEXT DO NOT SHARE');
  await page.getByLabel('Private facilitator notes and answers').fill('PRIVATE ANSWERS DO NOT SHARE');
  await page.getByRole('button', { name: 'Add selected reader passage', exact: true }).click();
  await expect(page.getByRole('heading', { name: /John 3:16–17 · World English Bible/ })).toBeVisible();
  const section = page.getByRole('group', { name: 'Readings for section 1', exact: true });
  await section.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Save outline', exact: true }).click();
  await expect(page.getByText('Outline saved privately.', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'My passage lesson', exact: true }).click();
  await expect(page.getByLabel('Private facilitator notes and answers')).toHaveValue('PRIVATE ANSWERS DO NOT SHARE');
  await page.getByText('Handouts and reusable template', { exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download participant handout', exact: true }).click();
  const downloaded = await downloadPromise, file = await downloaded.path();
  const text = await readFile(file!, 'utf8');
  expect(text).toContain('World English Bible'); expect(text).toContain('Read the chapter together');
  expect(text).toContain('John 3:16–17'); expect(text).not.toContain('PRIVATE CONTEXT'); expect(text).not.toContain('PRIVATE ANSWERS');
  expect(text).toContain('For God so loved the world');
});

test('malformed ministry restore keeps records; unsaved writing blocks updates and refused navigation', async ({ page }) => {
  await page.goto('#/ministry/GEN/1?verse=1&edition=eng-web');
  await page.getByRole('button', { name: 'New outline', exact: true }).click();
  await page.getByLabel('Outline title', { exact: true }).fill('Preserved local outline');
  await page.getByRole('button', { name: 'Save outline', exact: true }).click();
  await expect(page.getByText('Outline saved privately.', { exact: true })).toBeVisible();
  await page.getByText('Backup, restore and privacy', { exact: true }).click();
  await page.getByLabel('Preview ministry backup', { exact: true }).setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"kind":"another-app"}') });
  await expect(page.getByRole('alert').filter({ hasText: 'Choose an Adigun ministry workspace backup' })).toBeVisible();
  await page.getByLabel('Private facilitator notes and answers').fill('Keep this unsaved thought');
  expect(await page.evaluate(() => window.dispatchEvent(new Event('adigun:before-update', { cancelable: true })))).toBe(false);
  page.once('dialog', dialog => dialog.dismiss());
  expect(await page.evaluate(() => window.dispatchEvent(new Event('adigun:before-navigation', { cancelable: true })))).toBe(false);
  await expect(page.getByLabel('Private facilitator notes and answers')).toHaveValue('Keep this unsaved thought');
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.getByRole('button', { name: 'Save outline', exact: true }).click();
  await expect(page.getByText('Outline saved privately.', { exact: true })).toBeVisible();
});

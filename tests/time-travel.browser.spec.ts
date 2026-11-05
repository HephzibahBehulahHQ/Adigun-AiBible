import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.use({ serviceWorkers: 'block' });
const route = '#/time-travel/ACT/17?verse=16&edition=eng-web';

test('Athens tour keeps source context, keyboard movement and narrow 2D reading usable', async ({ page }) => {
  await page.goto(route);
  await expect(page.getByRole('heading', { name: 'Bible Time Travel', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Selected-edition passage' })).toContainText('World English Bible');
  await expect(page.getByText('AI-assisted research draft · human editorial review pending', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next stop', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Conversations in the marketplace', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Perspective for reading', exact: true }).selectOption('archaeologist');
  await expect(page.getByText(/How do weights, legal records and ballots/)).toBeVisible();
  await page.getByRole('button', { name: 'Open optional 3D walkthrough', exact: true }).click();
  const scene = page.getByRole('region', { name: 'Optional schematic 3D walkthrough' });
  await expect(scene.getByRole('img')).toBeVisible();
  const original = await scene.getByRole('status').textContent();
  await scene.getByRole('img').focus();
  await page.keyboard.press('ArrowUp');
  await expect(scene.getByRole('status')).not.toHaveText(original!);
  await page.keyboard.press('Tab');
  await expect(scene.getByRole('button', { name: 'Walk forward', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Close optional 3D', exact: true }).click();
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.getByRole('button', { name: 'Open Acts 17:17–18 in reader', exact: true }).click();
  await expect(page).toHaveURL(/#\/read\/ACT\/17\?verse=17&end=18&edition=eng-web/);
});

test('Athens study pack includes all four stops and exact selected-edition wording with attribution', async ({ page }) => {
  await page.goto(route);
  await page.getByRole('combobox', { name: 'Source edition', exact: true }).selectOption('deu1912');
  const passage = page.getByRole('region', { name: 'Selected-edition passage' });
  await expect(passage).toContainText('Luther');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Athens study pack', exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('Adigun-AiBible-Athens-deu1912.html');
  const html = await readFile((await download.path())!, 'utf8');
  expect(html).toContain('lang="de"');
  expect(html).toContain('Acts 17:22–34');
  expect(html).toContain('Luther');
  expect(html).toContain('human editorial review pending');
  expect(html).not.toContain('<script');
  await page.getByRole('combobox', { name: 'Time frame', exact: true }).selectOption('archaeology');
  await expect(page.getByText(/ASCSA began its Agora excavation in 1931/)).toBeVisible();
});

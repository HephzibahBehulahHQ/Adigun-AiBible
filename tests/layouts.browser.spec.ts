import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { SavedWorkspaceLayout } from '../src/layouts/model';

const settingsRoute = '#/settings/JHN/3?verse=16&end=17&edition=eng-bsb';
const readerRoute = '#/read/JHN/3?verse=16&end=17&edition=eng-bsb';
const source = JSON.parse(readFileSync(new URL('../data/editions/eng-bsb/books/JHN.json', import.meta.url), 'utf8')) as {
  chapters: { number: number; verses: { number: number; text: string }[] }[];
};
type Backup = { kind: string; version: number; layouts: SavedWorkspaceLayout[] };
const panel = (page: Page) => page.getByRole('region', { name: 'Saved workspace layouts', exact: true });
const entries = (page: Page) => panel(page).locator('.layout-list > li');

// Test requests reach this candidate directly, rather than a prior service-worker installation.
test.use({ serviceWorkers: 'block' });

async function ready(page: Page) {
  await expect(panel(page)).toBeVisible();
  await expect(panel(page)).toHaveAttribute('aria-busy', 'false');
  await expect(panel(page).getByLabel('New layout name', { exact: true })).toBeEnabled();
}
async function openSettings(page: Page) {
  await page.goto(settingsRoute);
  await ready(page);
}
async function save(page: Page, name: string) {
  await panel(page).getByLabel('New layout name', { exact: true }).fill(name);
  await panel(page).getByRole('button', { name: 'Save current layout', exact: true }).click();
  await expect(panel(page).getByRole('status')).toHaveText('Layout saved on this device.');
  await expect(panel(page)).toHaveAttribute('aria-busy', 'false');
}
async function openBackup(page: Page) {
  const details = panel(page).locator('.layout-backup');
  if (await details.getAttribute('open') === null) await details.locator(':scope > summary').click();
}
async function exportBackup(page: Page) {
  await openBackup(page);
  const downloaded = page.waitForEvent('download');
  await panel(page).getByRole('button', { name: 'Export workspace layouts', exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe('adigun-workspace-layouts.json');
  expect(await download.failure()).toBeNull();
  const path = await download.path();
  expect(path).not.toBeNull();
  const buffer = readFileSync(path!);
  return { buffer, backup: JSON.parse(buffer.toString('utf8')) as Backup };
}

test('saved layouts survive reload and apply display choices without changing the BSB range or current locale', async ({ page }) => {
  await openSettings(page);
  const appearance = page.locator('.settings-panel');
  await appearance.getByRole('combobox').first().selectOption('parchment');
  await appearance.getByRole('slider').nth(0).press('End');
  await appearance.getByRole('slider').nth(1).press('End');
  await page.locator('.locale-control select').selectOption('de');
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await save(page, 'Abendstudium');
  await expect(entries(page)).toHaveCount(1);

  await appearance.getByRole('combobox').first().selectOption('night');
  await appearance.getByRole('slider').nth(0).press('Home');
  await appearance.getByRole('slider').nth(1).press('Home');
  await page.locator('.locale-control select').selectOption('yo');
  await expect(page.locator('html')).toHaveAttribute('lang', 'yo');
  await page.reload();
  await ready(page);
  const passageUrl = page.url();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
  await expect(page.locator('html')).toHaveAttribute('lang', 'yo');
  await panel(page).getByRole('button', { name: 'Apply layout Abendstudium', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'parchment');
  await expect(appearance.getByRole('slider').nth(0)).toHaveValue('28');
  await expect(appearance.getByRole('slider').nth(1)).toHaveValue('2.2');
  await expect(page.locator('html')).toHaveAttribute('lang', 'yo');
  await expect(page).toHaveURL(passageUrl);

  await page.goto(readerRoute);
  await expect(page.locator('.reader-title .eyebrow')).toHaveText('Berean Standard Bible');
  await expect(page.locator('html')).toHaveAttribute('lang', 'yo');
  for (const number of [16, 17]) {
    const verse = source.chapters.find(chapter => chapter.number === 3)!.verses.find(verse => verse.number === number)!;
    await expect.poll(async () => (await page.locator(`#verse-${number} [data-source-run]`).allTextContents()).join('')).toBe(verse.text);
    await expect(page.locator(`#verse-${number}`)).toHaveClass(/selected/);
  }
  await expect(page).toHaveURL(/#\/read\/JHN\/3\?verse=16&end=17&edition=eng-bsb$/);
});

test('layout rename, removal undo and JSON restore keep existing data and reject private fields', async ({ page }) => {
  await openSettings(page);
  await save(page, 'Morning study');
  await panel(page).getByRole('button', { name: 'Rename layout Morning study', exact: true }).click();
  await expect(panel(page).getByLabel('Rename layout', { exact: true })).toBeFocused();
  await panel(page).getByLabel('Rename layout', { exact: true }).fill('Night study');
  await panel(page).getByRole('button', { name: 'Save layout name', exact: true }).click();
  await expect(panel(page).getByRole('status')).toHaveText('Layout renamed.');
  await expect(panel(page).getByRole('button', { name: 'Rename layout Night study', exact: true })).toBeFocused();
  const { buffer, backup } = await exportBackup(page);
  expect(Object.keys(backup)).toEqual(['kind', 'version', 'layouts']);
  expect(backup.kind).toBe('adigun-workspace-layouts');
  expect(backup.layouts).toHaveLength(1);
  expect(backup.layouts[0].name).toBe('Night study');
  expect(Object.keys(backup.layouts[0].snapshot)).toEqual(['theme', 'fontSize', 'lineHeight', 'focus', 'inspector', 'inspectorVisible']);

  await panel(page).getByRole('button', { name: 'Remove layout Night study', exact: true }).click();
  await expect(entries(page)).toHaveCount(0);
  await panel(page).getByRole('button', { name: 'Undo removal of Night study', exact: true }).click();
  await expect(panel(page).getByRole('status')).toHaveText('Layout restored.');
  await expect(entries(page)).toHaveCount(1);
  await panel(page).getByRole('button', { name: 'Remove layout Night study', exact: true }).click();
  await expect(entries(page)).toHaveCount(0);

  const input = panel(page).getByLabel('Import workspace layouts', { exact: true });
  await input.setInputFiles({ name: 'workspace-layouts.json', mimeType: 'application/json', buffer });
  await expect(panel(page).getByRole('heading', { name: 'Review layout import', exact: true })).toBeVisible();
  await expect(panel(page).locator('.layout-import-preview')).toContainText('1 new layout to add; 0 existing matches kept.');
  await expect(entries(page)).toHaveCount(0);
  await panel(page).getByRole('button', { name: 'Merge workspace layouts', exact: true }).click();
  await expect(panel(page).getByRole('status')).toHaveText('Imported 1 layout; kept 0 existing matches.');
  await expect(entries(page)).toHaveCount(1);
  await input.setInputFiles({ name: 'same-layouts.json', mimeType: 'application/json', buffer });
  await expect(panel(page).locator('.layout-import-preview')).toContainText('0 new layouts to add; 1 existing match kept.');
  await expect(panel(page).getByRole('button', { name: 'Merge workspace layouts', exact: true })).toBeDisabled();
  await panel(page).getByRole('button', { name: 'Cancel layout import', exact: true }).click();

  const invalid = { ...backup, layouts: backup.layouts.map(layout => ({ ...layout, snapshot: { ...layout.snapshot, reference: { bookId: 'GEN', chapter: 1, verse: 1 } } })) };
  await input.setInputFiles({ name: 'private-field.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(invalid)) });
  await expect(panel(page).getByRole('alert')).toContainText('unsupported fields');
  await expect(panel(page).getByRole('heading', { name: 'Review layout import', exact: true })).toHaveCount(0);
  await expect(entries(page)).toHaveCount(1);
  await page.reload(); await ready(page);
  await expect(entries(page).getByRole('heading', { name: 'Night study', exact: true })).toBeVisible();
  expect((await exportBackup(page)).backup).toEqual(backup);
});

test('a stale window preserves its layout name draft and cannot erase the newer window save', async ({ page, context }) => {
  await openSettings(page);
  const other = await context.newPage();
  try {
    await openSettings(other);
    await save(page, 'First window');
    await panel(other).getByLabel('New layout name', { exact: true }).fill('Second window');
    await panel(other).getByRole('button', { name: 'Save current layout', exact: true }).click();
    await expect(panel(other).getByRole('alert')).toContainText('Another window saved newer layouts.');
    await expect(panel(other).getByLabel('New layout name', { exact: true })).toHaveValue('Second window');
    await expect(panel(other).getByRole('button', { name: 'Save current layout', exact: true })).toBeDisabled();
    await panel(other).getByRole('button', { name: 'Reload layouts', exact: true }).click();
    await ready(other);
    await expect(entries(other).getByRole('heading', { name: 'First window', exact: true })).toBeVisible();
    await expect(panel(other).getByLabel('New layout name', { exact: true })).toHaveValue('Second window');
    await panel(other).getByRole('button', { name: 'Save current layout', exact: true }).click();
    await expect(panel(other).getByRole('status')).toHaveText('Layout saved on this device.');
    await expect(entries(other)).toHaveCount(2);
    await panel(page).getByRole('button', { name: 'Reload layouts', exact: true }).click();
    await ready(page);
    await expect(entries(page)).toHaveCount(2);
    await expect(entries(page).getByRole('heading', { name: 'First window', exact: true })).toBeVisible();
    await expect(entries(page).getByRole('heading', { name: 'Second window', exact: true })).toBeVisible();
  } finally { await other.close(); }
});

test('layout controls, long names and backup inputs reflow at 320 CSS pixels', async ({ page }, testInfo) => {
  await openSettings(page);
  await save(page, 'Yorùbá reading and evening study with family');
  await openBackup(page);
  const widths = testInfo.project.name.includes('mobile') ? [390, 320] : [1440, 320];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await expect(panel(page)).toBeVisible();
    await expect.poll(() => page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth),
      { message: `Saved layouts must fit a ${width}px viewport` }).toBeLessThanOrEqual(1);
    const targets = await panel(page).getByRole('button').evaluateAll(buttons => buttons.filter(button => button.getClientRects().length).map(button => {
      const bounds = button.getBoundingClientRect(); return { width: bounds.width, height: bounds.height };
    }));
    for (const target of targets) { expect(target.width).toBeGreaterThanOrEqual(44); expect(target.height).toBeGreaterThanOrEqual(44); }
    await testInfo.attach(`workspace-layouts-${width}px`, { body: await panel(page).screenshot({ animations: 'disabled' }), contentType: 'image/png' });
  }
});

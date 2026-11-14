import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { ReaderLayoutsState } from '../src/reader-layouts/model';

const databaseName = 'adigun-aibible-reader-layouts';
const passage = '#/read/JHN/3?verse=16&end=17&edition=eng-bsb';
const settingsRoute = '#/settings/JHN/3?verse=16&end=17&edition=eng-bsb';
const john = JSON.parse(readFileSync(new URL('../data/editions/eng-bsb/books/JHN.json', import.meta.url), 'utf8'));
const chapter = john.chapters.find((entry: { number: number }) => entry.number === 3);
const wording = (number: number): string => chapter.verses.find((entry: { number: number }) => entry.number === number).text;
const layouts = (page: Page) => page.getByRole('dialog', { name: 'Saved reader layouts', exact: true });
const palette = (page: Page) => page.getByRole('dialog', { name: 'Command palette', exact: true });
const savedLayout = (page: Page, name: string) => layouts(page).getByRole('article', { name: 'Layout ' + name, exact: true });

// Test storage faults and exact requests independently of the service-worker cache.
test.use({ serviceWorkers: 'block' });

async function expectPassage(page: Page) {
  await expect(page).toHaveURL(url => url.hash === passage);
  for (const number of [16, 17]) {
    await expect.poll(async () => {
      const paragraph = page.locator('.source-paragraph-view');
      const pieces = await paragraph.count()
        ? paragraph.locator('[data-verse="' + number + '"] [data-source-run]')
        : page.locator('#verse-' + number + ' [data-source-run]');
      return (await pieces.allTextContents()).join('');
    }).toBe(wording(number));
  }
}
async function openReader(page: Page) {
  await page.goto(passage);
  await expectPassage(page);
}
async function openLayouts(page: Page) {
  await page.getByRole('button', { name: 'Saved reader layouts', exact: true }).click();
  await expect(layouts(page)).toBeVisible();
  await expect(layouts(page).getByRole('button', { name: 'Save current layout', exact: true })).toBeEnabled();
}
async function closeLayouts(page: Page) {
  await layouts(page).getByRole('button', { name: 'Close saved layouts', exact: true }).click();
  await expect(layouts(page)).toHaveCount(0);
}
async function saveLayout(page: Page, name: string) {
  await layouts(page).getByLabel('Layout name', { exact: true }).fill(name);
  await layouts(page).getByRole('button', { name: 'Save current layout', exact: true }).click();
  await expect(savedLayout(page, name)).toBeVisible();
  await expect(layouts(page).getByRole('status')).toContainText('Saved on this device.');
}
async function readRawLayouts(page: Page): Promise<ReaderLayoutsState> {
  return page.evaluate(name => new Promise<ReaderLayoutsState>((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('layouts', 'readonly');
      const read = tx.objectStore('layouts').get('private');
      tx.oncomplete = () => { db.close(); resolve(read.result); };
      tx.onabort = () => { db.close(); reject(tx.error || new Error('Layout read did not finish.')); };
    };
  }), databaseName);
}
async function writeRawLayouts(page: Page, raw: unknown) {
  await page.evaluate(({ name, raw }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('layouts');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('layouts', 'readwrite');
      tx.objectStore('layouts').put(raw, 'private');
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => { db.close(); reject(tx.error || new Error('Layout seed did not commit.')); };
    };
  }), { name: databaseName, raw });
}
async function exportLayouts(page: Page) {
  const waiting = page.waitForEvent('download');
  await layouts(page).getByRole('button', { name: 'Export layouts', exact: true }).click();
  const download = await waiting, path = await download.path();
  expect(path).not.toBeNull();
  const buffer = readFileSync(path!);
  const backup = JSON.parse(buffer.toString('utf8')) as { kind: string; version: number; state: ReaderLayoutsState };
  expect(backup.kind).toBe('adigun-reader-layouts');
  expect(backup.version).toBe(1);
  return { buffer, backup };
}
async function changeAppearance(page: Page, theme: 'light' | 'night', end: boolean) {
  await page.evaluate(hash => { location.hash = hash; }, settingsRoute);
  await expect(page.getByLabel('Theme', { exact: true })).toBeVisible();
  await page.getByLabel('Theme', { exact: true }).selectOption(theme);
  const size = page.getByRole('slider', { name: /^Reading size/ });
  const spacing = page.getByRole('slider', { name: /^Line spacing/ });
  await size.focus(); await size.press(end ? 'End' : 'Home');
  await spacing.focus(); await spacing.press(end ? 'End' : 'Home');
  await expect(size).toHaveValue(end ? '28' : '16');
  await expect(spacing).toHaveValue(end ? '2.2' : '1.5');
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await page.evaluate(hash => { location.hash = hash; }, passage);
  await expectPassage(page);
}

test('command palette filters real actions, contains keyboard focus, and restores the trigger at 320px', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await openReader(page);
  const trigger = page.getByRole('button', { name: 'Open command palette', exact: true });
  await expect(trigger).toBeVisible();
  await trigger.focus();
  await trigger.press('Enter');
  const input = palette(page).getByLabel('Find a command', { exact: true });
  await expect(input).toBeFocused();
  await input.fill('a command that does not exist');
  await expect(palette(page).getByRole('status')).toContainText('No matching commands.');
  await input.press('Enter');
  await expectPassage(page);
  await expect(palette(page)).toBeVisible();

  const close = palette(page).getByRole('button', { name: 'Close command palette', exact: true });
  await close.focus();
  await close.press('Shift+Tab');
  await expect(input).toBeFocused();
  await input.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(palette(page)).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await page.keyboard.press('Control+k');
  await expect(input).toBeFocused();
  await input.fill('next chapter');
  const next = palette(page).getByRole('button', { name: /^Next chapter\b/ });
  await input.press('ArrowDown');
  await expect(next).toBeFocused();
  await next.press('ArrowUp');
  await expect(input).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
  await palette(page).screenshot({ path: testInfo.outputPath('command-palette-320.png') });
  await input.press('Enter');
  await expect(palette(page)).toHaveCount(0);
  await expect(page).toHaveURL(/#\/read\/JHN\/4\?verse=1(?:&end=1)?&edition=eng-bsb$/);
  await expect(page.locator('.reader-title h1')).toContainText('4');
});

test('named layouts restore appearance and source presentation, preserve the passage, and survive deliberate backup restore', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await openReader(page);
  await changeAppearance(page, 'light', true);
  await page.getByLabel('Reading layout', { exact: true }).selectOption('paragraphs');
  await page.getByLabel('Publisher red letters', { exact: true }).check();
  await page.getByLabel('Publisher headings', { exact: true }).uncheck();
  await page.getByLabel('Publisher notes', { exact: true }).uncheck();
  await expect(page.locator('.source-paragraph-view')).toBeVisible();
  await openLayouts(page);
  await saveLayout(page, 'Quiet reading');
  const stored = await readRawLayouts(page);
  expect(stored.layouts[0].settings).toMatchObject({
    theme: 'light', fontSize: 28, lineHeight: 2.2,
    source: { layout: 'paragraphs', redLetters: true, headings: false, notes: false },
  });
  await savedLayout(page, 'Quiet reading').getByRole('button', { name: 'Rename layout', exact: true }).click();
  const renamed = 'Àlàáfíà study — appearance and source display';
  await layouts(page).getByLabel('New layout name', { exact: true }).fill(renamed);
  await layouts(page).getByRole('button', { name: 'Save layout name', exact: true }).click();
  await expect(savedLayout(page, renamed)).toBeVisible();
  await closeLayouts(page);

  await page.getByLabel('Reading layout', { exact: true }).selectOption('verses');
  await page.getByLabel('Publisher red letters', { exact: true }).uncheck();
  await page.getByLabel('Publisher headings', { exact: true }).check();
  await page.getByLabel('Publisher notes', { exact: true }).check();
  await changeAppearance(page, 'night', false);
  await page.getByRole('button', { name: /^Publisher note [0-9]+ for / }).first().click();
  await expect(page.getByRole('region', { name: 'Publisher source details', exact: true })).toBeVisible();
  await openLayouts(page);
  const beforeApply = page.url();
  await savedLayout(page, renamed).getByRole('button', { name: 'Apply layout', exact: true }).click();
  await expect(layouts(page)).toHaveCount(0);
  await expect(page).toHaveURL(beforeApply);
  await expectPassage(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('.app')).toHaveCSS('--reading-size', '28px');
  await expect(page.locator('.app')).toHaveCSS('--reading-line', '2.2');
  await expect(page.getByLabel('Reading layout', { exact: true })).toHaveValue('paragraphs');
  await expect(page.getByLabel('Publisher red letters', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Publisher headings', { exact: true })).not.toBeChecked();
  await expect(page.getByLabel('Publisher notes', { exact: true })).not.toBeChecked();
  await expect(page.getByRole('region', { name: 'Publisher source details', exact: true })).toHaveCount(0);

  await openLayouts(page);
  const exported = await exportLayouts(page);
  expect(exported.backup.state.layouts).toHaveLength(1);
  expect(exported.backup.state.layouts[0].name).toBe(renamed);
  page.once('dialog', dialog => dialog.accept());
  await savedLayout(page, renamed).getByRole('button', { name: 'Delete layout', exact: true }).click();
  await expect(savedLayout(page, renamed)).toHaveCount(0);
  expect((await readRawLayouts(page)).layouts).toEqual([]);
  await layouts(page).getByLabel('Import layouts backup', { exact: true }).setInputFiles({
    name: 'reader-layouts.json', mimeType: 'application/json', buffer: exported.buffer,
  });
  await expect(layouts(page).getByRole('button', { name: 'Replace saved layouts', exact: true })).toBeEnabled();
  expect((await readRawLayouts(page)).layouts).toEqual([]);
  await layouts(page).getByRole('button', { name: 'Replace saved layouts', exact: true }).click();
  await expect(savedLayout(page, renamed)).toBeVisible();
  expect((await readRawLayouts(page)).layouts).toEqual(exported.backup.state.layouts);
  await page.reload();
  await expectPassage(page);
  await openLayouts(page);
  await expect(savedLayout(page, renamed)).toBeVisible();
  expect((await readRawLayouts(page)).layouts).toEqual(exported.backup.state.layouts);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
  await layouts(page).screenshot({ path: testInfo.outputPath('saved-reader-layouts-320.png') });
});

test('a layout retains linked and independent comparison-pane choices across apply', async ({ page }) => {
  await openReader(page);
  await page.evaluate(() => { location.hash = '#/editions/JHN/3?verse=16&end=17&edition=eng-bsb'; });
  await page.getByRole('button', { name: 'Parallel versions · 2–5', exact: true }).click();
  await page.getByLabel('Version 1', { exact: true }).selectOption('eng-asv');
  await page.getByLabel('Version 2', { exact: true }).selectOption('yor');
  const first = page.locator('.edition-pane').nth(0);
  await first.getByLabel('Follow selected chapter', { exact: true }).uncheck();
  await first.getByLabel('Book', { exact: true }).selectOption('JHN');
  await first.getByLabel('Chapter', { exact: true }).fill('4');
  await page.getByRole('button', { name: 'Open command palette', exact: true }).click();
  await palette(page).getByLabel('Find a command', { exact: true }).fill('saved reader layouts');
  await palette(page).getByRole('button', { name: /^Saved reader layouts\b/ }).click();
  await expect(layouts(page).getByRole('button', { name: 'Save current layout', exact: true })).toBeEnabled();
  await saveLayout(page, 'Comparison desk');
  const panes = (await readRawLayouts(page)).layouts[0].settings.panes;
  expect(panes).toEqual([
    { id: 'eng-asv', linked: false, bookId: 'JHN', chapter: 4 },
    { id: 'yor', linked: true, bookId: 'JHN', chapter: 3 },
  ]);
  await closeLayouts(page);
  await page.getByLabel('Version 1', { exact: true }).selectOption('eng-web');
  await page.getByLabel('Version 2', { exact: true }).selectOption('deu1912');
  await first.getByLabel('Follow selected chapter', { exact: true }).check();
  await page.getByRole('button', { name: 'Open command palette', exact: true }).click();
  await palette(page).getByLabel('Find a command', { exact: true }).fill('saved reader layouts');
  await palette(page).getByRole('button', { name: /^Saved reader layouts\b/ }).click();
  await expect(savedLayout(page, 'Comparison desk')).toBeVisible();
  const before = page.url();
  await savedLayout(page, 'Comparison desk').getByRole('button', { name: 'Apply layout', exact: true }).click();
  await expect(layouts(page)).toHaveCount(0);
  await expect(page).toHaveURL(before);
  await expect(page.getByLabel('Version 1', { exact: true })).toHaveValue('eng-asv');
  await expect(page.getByLabel('Version 2', { exact: true })).toHaveValue('yor');
  await expect(first.getByLabel('Follow selected chapter', { exact: true })).not.toBeChecked();
  await expect(first.getByLabel('Chapter', { exact: true })).toHaveValue('4');
  await expect(page.locator('.edition-pane').nth(1).getByLabel('Follow selected chapter', { exact: true })).toBeChecked();
});

test('a stale window cannot overwrite a newer saved layout and reload permits a safe retry', async ({ page, context }) => {
  await openReader(page);
  await openLayouts(page);
  const other = await context.newPage();
  try {
    await openReader(other);
    await openLayouts(other);
    await saveLayout(page, 'First window');
    const winning = await readRawLayouts(page);
    await layouts(other).getByLabel('Layout name', { exact: true }).fill('Second window');
    await layouts(other).getByRole('button', { name: 'Save current layout', exact: true }).click();
    await expect(layouts(other).getByRole('alert')).toContainText('Another window saved newer reader layouts.');
    expect(await readRawLayouts(other)).toEqual(winning);
    await layouts(other).getByRole('button', { name: 'Reload saved layouts', exact: true }).click();
    await expect(savedLayout(other, 'First window')).toBeVisible();
    await expect(layouts(other).getByRole('alert')).toHaveCount(0);
    await saveLayout(other, 'Second window');
    expect((await readRawLayouts(page)).layouts.map(layout => layout.name)).toEqual(['First window', 'Second window']);
    await layouts(page).getByRole('button', { name: 'Reload saved layouts', exact: true }).click();
    await expect(savedLayout(page, 'Second window')).toBeVisible();
  } finally { await other.close(); }
});

test('malformed backups and damaged storage preserve data; reset cannot replace another window repair', async ({ page, context }) => {
  await openReader(page);
  await openLayouts(page);
  await saveLayout(page, 'Preserve this layout');
  const healthy = await readRawLayouts(page);
  await layouts(page).getByLabel('Import layouts backup', { exact: true }).setInputFiles({
    name: 'malformed.json', mimeType: 'application/json', buffer: Buffer.from('{broken'),
  });
  await expect(layouts(page).getByRole('alert')).toContainText('Reader layout backup is not valid JSON.');
  expect(await readRawLayouts(page)).toEqual(healthy);
  await closeLayouts(page);
  const damaged = { schemaVersion: 99, revision: 10, layouts: [{ original: 'Àlàáfíà — keep this fragment 🌿', nested: { value: 17 } }] };
  await writeRawLayouts(page, damaged);
  await page.getByRole('button', { name: 'Saved reader layouts', exact: true }).click();
  await expect(layouts(page).getByRole('alert')).toContainText('Saved reader layouts are damaged.');
  await expect(layouts(page).getByRole('button', { name: 'Save current layout', exact: true })).toHaveCount(0);
  await expect(layouts(page).getByLabel('Import layouts backup', { exact: true })).toBeDisabled();
  expect(await readRawLayouts(page)).toEqual(damaged);

  const waiting = page.waitForEvent('download');
  await layouts(page).getByRole('button', { name: 'Download damaged layouts', exact: true }).click();
  const download = await waiting, path = await download.path();
  expect(path).not.toBeNull();
  expect(JSON.parse(readFileSync(path!, 'utf8'))).toEqual({ kind: 'adigun-damaged-reader-layouts', version: 1, raw: damaged });
  const other = await context.newPage();
  try {
    await other.goto('#/home/JHN/3?verse=16&edition=eng-bsb');
    await expect(other.locator('.home-page')).toBeVisible();
    await writeRawLayouts(other, healthy);
    page.once('dialog', dialog => dialog.accept());
    await layouts(page).getByRole('button', { name: 'Reset damaged layouts', exact: true }).click();
    await expect(layouts(page).getByRole('alert')).toContainText('Another window repaired these layouts.');
    expect(await readRawLayouts(page)).toEqual(healthy);
    await layouts(page).getByRole('button', { name: 'Reload saved layouts', exact: true }).click();
    await expect(savedLayout(page, 'Preserve this layout')).toBeVisible();
    await expect(layouts(page).getByRole('alert')).toHaveCount(0);
    await closeLayouts(page);
    await writeRawLayouts(page, damaged);
    await page.getByRole('button', { name: 'Saved reader layouts', exact: true }).click();
    await expect(layouts(page).getByRole('alert')).toContainText('Saved reader layouts are damaged.');
    page.once('dialog', dialog => dialog.accept());
    await layouts(page).getByRole('button', { name: 'Reset damaged layouts', exact: true }).click();
    await expect(layouts(page).getByRole('button', { name: 'Save current layout', exact: true })).toBeEnabled();
    const reset = await readRawLayouts(page);
    expect(reset.layouts).toEqual([]);
    expect(reset.schemaVersion).toBe(1);
  } finally { await other.close(); }
});

test('denied layout storage never reports a save or enables destructive replacement', async ({ page }) => {
  await page.addInitScript(() => {
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (this: IDBFactory, name: string, version?: number) {
      if (name === 'adigun-aibible-reader-layouts') throw new DOMException('Reader layout storage was denied for this test.', 'SecurityError');
      return version === undefined ? open.call(this, name) : open.call(this, name, version);
    };
  });
  await openReader(page);
  await page.getByRole('button', { name: 'Saved reader layouts', exact: true }).click();
  await expect(layouts(page).getByRole('alert')).toContainText('denied');
  await expect(layouts(page).getByRole('button', { name: 'Save current layout', exact: true })).toBeDisabled();
  await expect(layouts(page).getByRole('button', { name: 'Export layouts', exact: true })).toBeDisabled();
  await expect(layouts(page).getByLabel('Import layouts backup', { exact: true })).toBeDisabled();
  await expect(layouts(page).getByRole('status')).not.toContainText('Saved on this device.');
  await closeLayouts(page);
  await expectPassage(page);
});

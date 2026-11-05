import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const source = JSON.parse(await readFile(new URL('../data/historical/didache-lightfoot.json', import.meta.url), 'utf8'));
const start = '#/library?book=JHN&chapter=3&verse=16&edition=eng-web&historical=didache-lightfoot&hchapter=1&hunit=1';

test.describe('historical reading and private notebook', () => {
  test.use({ serviceWorkers: 'block' });
  test('complete source reading, chapter history and search preserve Bible location', async ({ page }) => {
    await page.goto(start);
    await expect(page.getByRole('article', { name: 'Didache 1:1', exact: true })).toContainText(source.chapters[0].units[0].text);
    await page.getByLabel('Historical chapter', { exact: true }).selectOption('16');
    await expect(page.getByRole('article', { name: 'Didache 16:17', exact: true })).toContainText(source.chapters[15].units[16].text);
    expect(new URLSearchParams(page.url().split('?')[1]).get('book')).toBe('JHN');
    expect(new URLSearchParams(page.url().split('?')[1]).get('chapter')).toBe('3');
    await page.goBack();
    await expect(page.getByLabel('Historical chapter', { exact: true })).toHaveValue('1');
    await page.getByLabel('Search this historical edition', { exact: true }).fill('two ways');
    await page.getByRole('region', { name: 'Historical search results', exact: true }).getByRole('button', { name: 'Didache 1:1', exact: true }).click();
    await expect(page.getByRole('article', { name: 'Didache 1:1', exact: true })).toHaveClass(/selected/);
    await page.getByText('Historical identity, rights and source evidence', { exact: true }).click();
    await expect(page.getByRole('link', { name: 'Open pinned source transcription', exact: true })).toHaveAttribute('href', /oldid=14637905/);
  });

  test('notes and bookmarks persist separately, exports preserve attribution and exclude private notes', async ({ page }) => {
    await page.goto(start);
    const unit = page.getByRole('article', { name: 'Didache 1:1', exact: true });
    await unit.getByRole('button', { name: 'Bookmark historical unit', exact: true }).click();
    await expect(unit.getByRole('button', { name: 'Remove historical bookmark', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await unit.getByRole('button', { name: 'Write historical note', exact: true }).click();
    await page.getByLabel('Historical note', { exact: true }).fill('PRIVATE HISTORICAL OBSERVATION');
    await page.getByRole('button', { name: 'Save historical note', exact: true }).click();
    await expect(page.getByText('Historical note saved on this device.', { exact: true })).toBeVisible();
    await page.reload();
    await expect(unit.getByRole('button', { name: 'Remove historical bookmark', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('PRIVATE HISTORICAL OBSERVATION', { exact: true })).toBeVisible();
    const backupEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export historical notebook', exact: true }).click();
    const backup = JSON.parse(await readFile((await (await backupEvent).path())!, 'utf8'));
    expect(backup.kind).toBe('adigun-historical-notebook'); expect(backup.notes[0].locator.sourceRevision).toBe('wikisource-14637905'); expect(backup.bookmarks).toHaveLength(1);
    const textEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export historical text', exact: true }).click();
    const text = await readFile((await (await textEvent).path())!, 'utf8');
    expect(text).toContain(source.chapters[15].units[16].text); expect(text).toContain('14637905'); expect(text).toContain('CC BY-SA 4.0'); expect(text).not.toContain('PRIVATE HISTORICAL OBSERVATION');
  });

  test('invalid restores preserve notes, dirty drafts block updates, and 320px reading stays within viewport', async ({ page }) => {
    await page.goto(start);
    await page.getByRole('article', { name: 'Didache 1:1', exact: true }).getByRole('button', { name: 'Write historical note', exact: true }).click();
    await page.getByLabel('Historical note', { exact: true }).fill('Retain this draft');
    await page.getByLabel('Import historical notebook', { exact: true }).setInputFiles({ name: 'foreign.json', mimeType: 'application/json', buffer: Buffer.from('{"kind":"another-app"}') });
    await expect(page.getByRole('alert').filter({ hasText: 'Historical study backup is invalid' })).toBeVisible();
    expect(await page.evaluate(() => window.dispatchEvent(new Event('adigun:before-update', { cancelable: true })))).toBe(false);
    page.once('dialog', dialog => dialog.dismiss());
    expect(await page.evaluate(() => window.dispatchEvent(new Event('adigun:before-navigation', { cancelable: true })))).toBe(false);
    await expect(page.getByLabel('Historical note', { exact: true })).toHaveValue('Retain this draft');
    await page.setViewportSize({ width: 320, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.getByRole('button', { name: 'Save historical note', exact: true }).click();
    await expect(page.getByText('Historical note saved on this device.', { exact: true })).toBeVisible();
  });
});

test('historical source and attribution download remains readable offline', async ({ page, context }) => {
  await page.goto(start);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.getByRole('button', { name: /^Download historical text/ }).click();
  await expect(page.getByText('Historical text and source notice downloaded for offline reading.', { exact: true })).toBeVisible();
  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.getByRole('article', { name: 'Didache 1:1', exact: true })).toContainText(source.chapters[0].units[0].text);
    await page.getByLabel('Historical chapter', { exact: true }).selectOption('16');
    await expect(page.getByRole('article', { name: 'Didache 16:17', exact: true })).toContainText(source.chapters[15].units[16].text);
  } finally { await context.setOffline(false); }
});

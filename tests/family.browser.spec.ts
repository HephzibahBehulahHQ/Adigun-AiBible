import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// Only synthetic family material is used; nothing enters production data or a remote service.
const familyRoute = '#/family/JHN/3?verse=16&edition=eng-web';
const permittedLabel = 'I am authorized to keep and back up this item, including its original file.';
async function openArchive(page: Page) {
  await page.goto(familyRoute);
  await expect(page.getByRole('heading', { name: 'Family Legacy Bible', exact: true })).toBeVisible();
  await expect(page.getByLabel('Title', { exact: true })).toBeEnabled();
}
async function fillMemory(page: Page, title: string, writing = 'Synthetic private family writing with Àyọ̀ and Yorùbá diacritics.') {
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByLabel('Person or speaker', { exact: true }).fill('Àyọ̀ test fixture');
  await page.getByLabel('Memory, testimony or explanation', { exact: true }).fill(writing);
  await page.getByLabel('Permission confirmed by', { exact: true }).fill('Synthetic owner');
  await page.getByLabel(permittedLabel, { exact: true }).check();
}
async function saveMemory(page: Page, title: string) {
  await page.getByRole('button', { name: 'Save family item', exact: true }).click();
  await expect(page.locator('.family-item').filter({ has: page.getByRole('heading', { name: title, exact: true }) })).toBeVisible();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('');
}

test('family originals, source links and consent survive save, reload, backup and explicit restore', async ({ page }) => {
  await openArchive(page);
  await page.evaluate(() => localStorage.setItem('unrelated-fixture-data', 'retain after family deletion'));
  const title = 'Synthetic family archive round trip';
  const original = Buffer.from('Synthetic original file: Àyọ̀\nKeep the exact bytes.');
  await fillMemory(page, title);
  await page.getByText('Link passages (0)', { exact: true }).click();
  await page.getByRole('button', { name: 'Add passage link', exact: true }).click();
  await expect(page.locator('.family-link')).toContainText('John 3:16 · World English Bible');
  await page.getByText('Original file or voice recording (optional)', { exact: true }).click();
  await page.getByLabel('Upload original file', { exact: true }).setInputFiles({ name: 'fixture-original.txt', mimeType: 'text/plain', buffer: original });
  await expect(page.getByRole('button', { name: 'Download original file', exact: true })).toBeVisible();
  await expect(page.getByLabel(permittedLabel, { exact: true })).not.toBeChecked();
  await page.getByLabel(permittedLabel, { exact: true }).check();
  await saveMemory(page, title);
  await page.reload();
  const record = page.locator('.family-item');
  await expect(record).toHaveCount(1);
  await expect(record).toContainText('Àyọ̀ test fixture');
  await expect(record.getByRole('button', { name: 'John 3:16 · World English Bible', exact: true })).toBeVisible();
  await record.getByText('Open original and full details', { exact: true }).click();
  const originalDownload = page.waitForEvent('download');
  await record.getByRole('button', { name: 'Download original file', exact: true }).click();
  const originalPath = await (await originalDownload).path();
  expect(await readFile(originalPath!)).toEqual(original);
  await expect(record).toContainText('confirmed by Synthetic owner');

  await page.getByText('Back up, restore or delete this archive', { exact: true }).click();
  const backupDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download family backup', exact: true }).click();
  const backupBytes = await readFile((await (await backupDownload).path())!);
  const backup = JSON.parse(backupBytes.toString('utf8'));
  expect(Buffer.from(backup.items[0].attachment.dataBase64, 'base64')).toEqual(original);
  expect(backup.items[0].passages[0].reference.editionId).toBe('eng-web');

  await page.getByLabel('Preview family backup', { exact: true }).setInputFiles({ name: 'malformed.json', mimeType: 'application/json', buffer: Buffer.from('{') });
  await expect(page.getByRole('alert')).toContainText('not valid JSON');
  await expect(record).toHaveCount(1);
  await record.getByRole('button', { name: `Delete family item: ${title}`, exact: true }).click();
  await record.getByRole('button', { name: 'Confirm item deletion', exact: true }).click();
  await expect(record).toHaveCount(0);

  const upload = { name: 'family-fixture-backup.json', mimeType: 'application/json', buffer: backupBytes };
  await page.getByLabel('Preview family backup', { exact: true }).setInputFiles(upload);
  await expect(page.getByRole('region', { name: 'Family import preview', exact: true })).toContainText('1 new items');
  await expect(record).toHaveCount(0);
  await page.getByRole('button', { name: 'Import previewed family items', exact: true }).click();
  await expect(record).toHaveCount(1);
  await page.getByLabel('Preview family backup', { exact: true }).setInputFiles(upload);
  await expect(page.getByRole('region', { name: 'Family import preview', exact: true })).toContainText('1 identical duplicates');
  await page.getByRole('button', { name: 'Import previewed family items', exact: true }).click();
  await expect(record).toHaveCount(1);

  await record.getByRole('button', { name: 'Hide item', exact: true }).click();
  await expect(record).toHaveCount(0);
  await page.getByLabel('Show hidden items', { exact: true }).check();
  await expect(record).toContainText('Hidden on this device');
  await page.getByRole('button', { name: 'Delete all family items', exact: true }).click();
  await page.getByRole('button', { name: 'Permanently delete family archive', exact: true }).click();
  await expect(record).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('unrelated-fixture-data'))).toBe('retain after family deletion');
  await page.reload();
  await expect(page.locator('.family-stats')).toContainText('0 saved items');
});

test('a stale tab retains its unsaved memory and must reload before merging with newer saved items', async ({ page, context }) => {
  await openArchive(page);
  const second = await context.newPage();
  await openArchive(second);
  await fillMemory(page, 'First tab fixture');
  await fillMemory(second, 'Second tab fixture', 'This form must survive the conflict.');
  await saveMemory(page, 'First tab fixture');
  await second.getByRole('button', { name: 'Save family item', exact: true }).click();
  await expect(second.getByRole('alert')).toContainText('Another tab saved a newer family archive');
  await expect(second.getByLabel('Title', { exact: true })).toHaveValue('Second tab fixture');
  await expect(second.getByLabel('Memory, testimony or explanation', { exact: true })).toHaveValue('This form must survive the conflict.');
  await second.getByRole('button', { name: 'Reload saved items', exact: true }).click();
  await expect(second.locator('.family-item')).toHaveCount(1);
  await saveMemory(second, 'Second tab fixture');
  await expect(second.locator('.family-item')).toHaveCount(2);
  await page.reload();
  await expect(page.locator('.family-item')).toHaveCount(2);
  await second.close();
});

test('unsaved family writing blocks navigation and service-worker activation until deliberately discarded', async ({ page }) => {
  await openArchive(page);
  await fillMemory(page, 'Unsaved fixture');
  expect(await page.evaluate(() => window.dispatchEvent(new Event('adigun:before-update', { cancelable: true })))).toBe(false);
  page.once('dialog', dialog => dialog.dismiss());
  await page.evaluate(() => { location.hash = '#/read/JHN/3?verse=16&edition=eng-web'; });
  await expect(page).toHaveURL(/#\/family\//);
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Unsaved fixture');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Clear form', exact: true }).click();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('');
  expect(await page.evaluate(() => window.dispatchEvent(new Event('adigun:before-update', { cancelable: true })))).toBe(true);
  await page.evaluate(() => { location.hash = '#/read/JHN/3?verse=16&edition=eng-web'; });
  await expect(page.locator('#verse-16')).toBeVisible();
});

test('denied family storage is reported without showing an empty usable archive', async ({ page }) => {
  await page.addInitScript(() => {
    const realOpen = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (name: string, version?: number) {
      if (name === 'adigun-aibible-family') throw new DOMException('Synthetic storage denial', 'SecurityError');
      return version === undefined ? realOpen.call(this, name) : realOpen.call(this, name, version);
    };
  });
  await page.goto(familyRoute);
  await expect(page.getByRole('heading', { name: 'Family Legacy Bible', exact: true })).toBeVisible();
  await expect(page.locator('.family-status')).toContainText('Existing data was not replaced');
  await expect(page.getByRole('alert')).toContainText('Synthetic storage denial');
  await expect(page.getByRole('button', { name: 'Save family item', exact: true })).toHaveCount(0);
});

test('family archive reflows at 320 CSS pixels with original-file and consent controls available', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await openArchive(page);
  await page.getByText('Original file or voice recording (optional)', { exact: true }).click();
  await page.getByText('Transcript and timed captions', { exact: true }).click();
  await page.getByText('Visibility and archive steward', { exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)).toBe(false);
  await page.getByLabel(permittedLabel, { exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Save family item', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('family-320px-consent.png') });
});

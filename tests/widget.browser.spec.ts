import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('lock-screen route refresh exports a real attributed 9:16 PNG from the selected edition', async ({ page }) => {
  await page.goto('#/widget/JHN/3?verse=16&edition=yor');
  await page.reload();
  const widget = page.locator('.widget-page');
  await expect(widget.getByRole('heading', { name: 'Lock-screen verse card', exact: true })).toBeVisible();
  await expect(widget.locator('canvas')).toBeVisible();
  const book = JSON.parse(readFileSync(new URL('../data/editions/yor/books/JHN.json', import.meta.url), 'utf8'));
  const text = book.chapters.find((chapter: { number: number }) => chapter.number === 3).verses.find((verse: { number: number }) => verse.number === 16).text;
  await expect(widget.locator('blockquote')).toHaveText(text);
  await expect(widget.locator('blockquote')).toHaveAttribute('lang', 'yo');
  await expect(widget.locator('pre')).toContainText('creativecommons.org');
  const download = page.waitForEvent('download');
  await widget.getByRole('button', { name: 'Download lock-screen PNG', exact: true }).click();
  const file = await download, png = readFileSync((await file.path())!);
  expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(png.readUInt32BE(16)).toBe(1080); expect(png.readUInt32BE(20)).toBe(1920);
  expect(file.suggestedFilename()).toBe('Adigun-AiBible-lock-screen-yor-JHN-3-16.png');
  await expect(widget.getByRole('status')).toContainText('complete verse and source credit');
});

test('single-verse widget explains a range and preserves the full selected range in Share Studio', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('#/widget/JHN/3?verse=16&end=18&edition=eng-web');
  const widget = page.locator('.widget-page');
  await expect(widget.locator('canvas')).toBeVisible();
  await expect(widget).toContainText('This single-verse format uses JHN 3:16');
  await widget.getByLabel('Lock-screen card template').selectOption('paper');
  await expect(widget.locator('canvas')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await widget.getByRole('link', { name: 'Open Share Studio for other formats', exact: true }).click();
  await expect(page).toHaveURL(/#\/share\/JHN\/3\?verse=16&end=18&edition=eng-web/);
});

test('unavailable source wording cannot create or export a lock-screen image', async ({ page }) => {
  await page.goto('#/widget/MAT/17?verse=21&edition=eng-bsb');
  const widget = page.locator('.widget-page');
  await expect(widget.getByRole('alert')).toContainText('MAT 17:21');
  await expect(widget.locator('canvas')).toHaveCount(0);
  await expect(widget.getByRole('button', { name: 'Download lock-screen PNG', exact: true })).toHaveCount(0);
});

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const chapter = JSON.parse(readFileSync(new URL('../data/books/JHN.json', import.meta.url), 'utf8')).chapters.find((value: { number: number }) => value.number === 3);
const yoruba = JSON.parse(readFileSync(new URL('../data/editions/yor/books/JHN.json', import.meta.url), 'utf8')).chapters.find((value: { number: number }) => value.number === 3).verses.find((value: { number: number }) => value.number === 16).text as string;
const route = '#/share/JHN/3?verse=16&edition=eng-web';

test('multi-card whole chapter exports a real PNG and every original source verse as text', async ({ page }) => {
  await page.goto(route);
  const cards = page.locator('.multi-cards');
  await expect(cards.getByRole('heading', { name: 'Multiple cards and bilingual text' })).toBeVisible();
  await cards.getByLabel('Multi-card passage').selectOption('chapter');
  await cards.getByLabel('Multi-card format').selectOption('square');
  await cards.getByLabel('Multi-card template').selectOption('paper');
  await cards.getByRole('button', { name: 'Prepare passage cards', exact: true }).click();
  await expect(cards.locator('canvas')).toBeVisible();
  expect(await cards.getByLabel('Prepared card number').locator('option').count()).toBeGreaterThan(1);
  const pngPromise = page.waitForEvent('download');
  await cards.getByRole('button', { name: 'Download card 1 PNG', exact: true }).click();
  const pngDownload = await pngPromise;
  const png = readFileSync((await pngDownload.path())!);
  expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(png.readUInt32BE(16)).toBe(1080); expect(png.readUInt32BE(20)).toBe(1080);
  expect(pngDownload.suggestedFilename()).toMatch(/-card-1-of-\d+\.png$/);
  const textPromise = page.waitForEvent('download');
  await cards.getByRole('button', { name: 'Download all text and sources', exact: true }).click();
  const text = readFileSync((await (await textPromise).path())!, 'utf8');
  for (const verse of chapter.verses as { number: number; text: string }[]) expect(text).toContain(verse.text);
  expect(text).toContain('World English Bible'); expect(text).toContain('https://ebible.org');
  const count = await cards.getByLabel('Prepared card number').locator('option').count();
  await cards.getByLabel('Prepared card number').selectOption(String(count - 1));
  await cards.getByText('Text alternative for this card', { exact: true }).click();
  await expect(cards.locator('.multi-cards-alternative')).toContainText(chapter.verses.at(-1).text.slice(-50));
});

test('bilingual cards retain exact Yoruba wording and reset stale exports after changing controls', async ({ page }) => {
  await page.goto(route);
  const cards = page.locator('.multi-cards');
  await cards.getByLabel('Second source edition').selectOption('yor');
  await cards.getByRole('button', { name: 'Prepare passage cards', exact: true }).click();
  await expect(cards.locator('canvas')).toBeVisible();
  const count = await cards.getByLabel('Prepared card number').locator('option').count();
  const captured: string[] = [];
  for (let index = 0; index < count; index++) {
    await cards.getByLabel('Prepared card number').selectOption(String(index));
    if ((await cards.locator('details').getAttribute('open')) === null) await cards.getByText('Text alternative for this card', { exact: true }).click();
    captured.push(...await cards.locator('.multi-cards-alternative p[lang="yo"]').allTextContents());
  }
  expect(captured.join('')).toBe(yoruba);
  const textPromise = page.waitForEvent('download');
  await cards.getByRole('button', { name: 'Download all text and sources', exact: true }).click();
  const text = readFileSync((await (await textPromise).path())!, 'utf8');
  expect(text).toContain(yoruba); expect(text).toContain('not a reviewed translation alignment'); expect(text).toContain('creativecommons.org');
  await cards.getByLabel('Multi-card template').selectOption('ivory');
  await expect(cards.locator('canvas')).toHaveCount(0);
  await expect(cards.getByRole('button', { name: /Download card/ })).toHaveCount(0);
});

test('bilingual numbering gaps prevent export and the card editor reflows at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('#/share/MAT/17?verse=20&end=22&edition=eng-web');
  const cards = page.locator('.multi-cards');
  await cards.getByLabel('Second source edition').selectOption('eng-bsb');
  await cards.getByRole('button', { name: 'Prepare passage cards', exact: true }).click();
  await expect(cards.getByRole('alert')).toContainText('MAT 17:21');
  await expect(cards.getByRole('alert')).toContainText('no cards were created');
  await expect(cards.locator('canvas')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

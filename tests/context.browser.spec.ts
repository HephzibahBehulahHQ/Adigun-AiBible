import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

async function contextCard(page: Page) {
  await expect(page.locator('.reader')).toBeVisible();
  const card = page.locator('.context-card');
  if (!await page.locator('.inspector').isVisible()) await page.getByRole('button', { name: 'Toggle passage inspector', exact: true }).click();
  await expect(card.getByRole('heading', { name: 'Passage context', exact: true })).toBeVisible();
  return card;
}

test('context retains exact Yoruba wording, names its English fallback and reflows at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.addInitScript(() => localStorage.setItem('adigun-bible-preferences', JSON.stringify({ locale: 'de', preset: 'en' })));
  await page.goto('#/read/JHN/3?verse=16&edition=yor');
  const card = await contextCard(page);
  const book = JSON.parse(readFileSync(new URL('../data/editions/yor/books/JHN.json', import.meta.url), 'utf8'));
  const text = book.chapters.find((chapter: { number: number }) => chapter.number === 3).verses.find((verse: { number: number }) => verse.number === 16).text;
  await expect(card.locator('.context-selected')).toContainText(text);
  await expect(card.locator('.context-selected')).toHaveAttribute('lang', 'yo');
  await expect(card).toContainText('(EN fallback)');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('context references navigate to real source passages and debate summaries retain citations and draft status', async ({ page }) => {
  await page.goto('#/read/1TI/6?verse=10&edition=eng-web');
  const card = await contextCard(page);
  await expect(card.getByText('First Timothy: letter setting and disputed authorship', { exact: true })).toBeVisible();
  await expect(card).toContainText('AI-assisted draft · human review pending');
  await card.locator('.context-debate summary').click();
  await expect(card.getByRole('heading', { name: 'Chrysostom’s Pauline reading', exact: true })).toBeVisible();
  await expect(card.getByRole('link', { name: 'John Chrysostom · Homily 1 on First Timothy', exact: true })).toHaveAttribute('href', 'https://www.newadvent.org/fathers/230601.htm');
  await card.getByRole('button', { name: '1 Timothy 6:17–19 · WEB', exact: true }).click();
  await expect(page).toHaveURL(/#\/read\/1TI\/6\?verse=17.*end=19/);
  const next = await contextCard(page);
  await expect(next.locator('.context-selected')).toHaveCount(3);
});

test('context marks an actual omitted BSB verse without inserting text from a different edition', async ({ page }) => {
  await page.goto('#/read/MAT/17?verse=21&edition=eng-bsb');
  const card = await contextCard(page);
  await expect(card.locator('.context-gap').first()).toContainText('no main-text wording');
  await expect(card.locator('.context-gap').first()).toContainText('21');
  await expect(card).toContainText('Berean Standard Bible');
  await expect(card.locator('.context-source-window')).not.toContainText('this kind doesn’t go out except by prayer and fasting');
});

import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const directory = new URL('../data/editions/eng-bsb/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', directory), 'utf8'));
const john = JSON.parse(readFileSync(new URL('books/JHN.json', directory), 'utf8'));
const verses: { number: number; text: string }[] = john.chapters.find((chapter: { number: number }) => chapter.number === 3).verses;
const rangeText = verses.filter(verse => verse.number >= 16 && verse.number <= 17).map(verse => `${verse.number} ${verse.text}`).join('\n\n');

test.beforeEach(async ({ page }) => {
  // A returning reader's valid saved passage must never override a shared tool link.
  await page.addInitScript(() => localStorage.setItem('adigun-bible-reading-position', JSON.stringify({
    schemaVersion: 1,
    ref: { bookId: 'GEN', chapter: 1, verse: 1, editionId: 'eng-bsb' },
    preset: 'en',
    scrollY: 825,
  })));
});

test('a returning reader opens the exact shared projection range and edition after refresh', async ({ page }) => {
  const hash = '#/projection/JHN/3?verse=16&end=17&edition=eng-bsb';
  await page.goto(hash);
  await expect(page.getByRole('heading', { name: 'Scripture projection', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Add selected passage', exact: true }).click();
  await expect(page.locator('.projection-text')).toHaveText(rangeText);
  await expect(page.locator('.projection-queue')).toContainText(`John 3:16–17 · ${manifest.edition.name}`);
  await expect(page).toHaveURL(new RegExp(hash.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'));
});

test('an invalid shared tool passage cannot become the saved Genesis passage', async ({ page }) => {
  await page.goto('#/projection/JHN/999?verse=16&edition=eng-bsb');
  await page.getByRole('button', { name: 'Add selected passage', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'This range has missing source wording.' })).toBeVisible();
  await expect(page.locator('.projection-queue li')).toHaveCount(0);
  await expect(page.locator('.projection-text')).toHaveText('Choose a passage from the queue.');
  await expect(page).toHaveURL(/#\/projection\/JHN\/999\?verse=16&edition=eng-bsb$/);
});

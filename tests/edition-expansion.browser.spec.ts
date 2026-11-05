import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const installed = JSON.parse(readFileSync(new URL('../data/editions/catalog.json', import.meta.url), 'utf8')).editions;
const acquired = ['eng-ylt', 'eng-dby', 'eng-webster', 'fra-lsg1910', 'spa-rv1909', 'deu-elberfelder1905', 'deu-textbibel1906', 'ces-kralicka1613', 'ita-diodati1885'];
const book = (id: string) => JSON.parse(readFileSync(new URL(`../data/editions/${id}/books/JHN.json`, import.meta.url), 'utf8'));
const passage = (id: string): string => book(id).chapters.find((chapter: { number: number }) => chapter.number === 3).verses.find((verse: { number: number }) => verse.number === 16).text;

test('every acquired edition renders and searches its unchanged source wording', async ({ page }) => {
  test.setTimeout(150_000);
  for (const id of acquired) {
    const text = passage(id);
    await page.goto(`#/read/JHN/3?verse=16&edition=${id}`);
    await expect(page.locator('#verse-16')).toContainText(text);
    const metadata = installed.find((edition: { id: string }) => edition.id === id);
    await expect(page.locator('.reader-title .eyebrow')).toHaveText(metadata.name);
    await expect(page.locator('.scripture')).toHaveAttribute('lang', metadata.language);
    await page.locator('.global-search input').fill(text.split(/\s+/u).slice(0, 8).join(' '));
    await page.locator('.global-search input').press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const result = dialog.locator('.search-results > button').filter({ hasText: text });
    await expect(result).toHaveCount(1);
    await result.click();
    await expect(page).toHaveURL(new RegExp(`#/read/JHN/3\\?verse=16&edition=${id}$`));
    await expect(page.locator('#verse-16')).toContainText(text);
  }
});

test('a newly acquired Czech edition and its complete search reopen offline with exact Unicode', async ({ page, context }) => {
  test.setTimeout(90_000);
  const id = 'ces-kralicka1613', text = passage(id);
  await page.goto(`#/settings/JHN/3?verse=16&edition=${id}`);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.getByRole('button', { name: 'Download complete Bible', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'and its search index are available offline.' })).toBeVisible({ timeout: 45_000 });
  await context.setOffline(true);
  try {
    await page.goto(`#/read/JHN/3?verse=16&edition=${id}`);
    await page.reload();
    await expect(page.locator('#verse-16')).toContainText(text);
    await expect(page.locator('.scripture')).toHaveAttribute('lang', 'cs');
    await page.locator('.global-search input').fill(text.split(/\s+/u).slice(0, 8).join(' '));
    await page.locator('.global-search input').press('Enter');
    await expect(page.getByRole('dialog').locator('.search-results > button').filter({ hasText: text })).toHaveCount(1);
  } finally { await context.setOffline(false); }
});

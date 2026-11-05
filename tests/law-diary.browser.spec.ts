import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const webExodus = JSON.parse(readFileSync('data/books/EXO.json', 'utf8'));
const expectedBible = webExodus.chapters.find((chapter: { number: number }) => chapter.number === 20).verses.find((verse: { number: number }) => verse.number === 16).text;
const quran = JSON.parse(readFileSync('data/editions/eng-clearquran/quran.json', 'utf8'));
const expectedQuran = quran.surahs.find((surah: { number: number }) => surah.number === 4).verses.find((verse: { number: number }) => verse.number === 135).text;

test('Law Diary opens exact source quotes, surrounding context and the selected Bible passage', async ({ page }) => {
  await page.goto('#/law-diary/social?book=JHN&chapter=3&verse=16&edition=eng-web');
  const justice = page.getByRole('article', { name: 'Justice and witness', exact: true });
  await expect(justice).toBeVisible();
  await justice.locator('.ld-source > summary').filter({ hasText: 'Exodus 20:16' }).click();
  await expect(justice.locator('.ld-source-text').first()).toContainText(expectedBible);
  await justice.locator('.ld-source > summary').filter({ hasText: 'Quran 4:135' }).click();
  await expect(justice.locator('.ld-source-text').last()).toContainText(expectedQuran);
  await expect(justice.getByText('Relationship: unreviewed.', { exact: true })).toBeVisible();
  await expect(justice.locator('.ld-trust')).toContainText('editor-assigned');
  await justice.locator('.ld-context > summary').first().click();
  await expect(justice.locator('.ld-context[open]')).toContainText('20:14');
  await justice.getByRole('button', { name: 'Open Exodus 20:16 in reader', exact: true }).click();
  await expect(page).toHaveURL(/#\/read\/EXO\/20\?.*verse=16/);
  await expect(page).toHaveURL(/edition=eng-web/);
});

test('Law Diary deep links, Back and Forward preserve section and passage query', async ({ page }) => {
  await page.goto('#/law-diary/social?book=JHN&chapter=3&verse=16&edition=deu1912');
  const nav = page.getByRole('navigation', { name: 'Law Diary sections' });
  await nav.getByRole('link', { name: 'Money', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Money', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/book=JHN/);
  await expect(page).toHaveURL(/edition=deu1912/);
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Social laws', exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Money', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Money', exact: true })).toBeVisible();
  await expect(page.locator('main')).toHaveCount(1);
});

test('Law Diary filters Torah samples and searches real source references', async ({ page }) => {
  await page.goto('#/law-diary/timeline?edition=eng-web');
  const torah = page.getByRole('article', { name: 'Law of Moses: Torah categories', exact: true });
  await torah.getByLabel('Category', { exact: true }).selectOption('dietary');
  await expect(torah.locator('.ld-category')).toHaveCount(1);
  await torah.locator('.ld-category > summary').click();
  await expect(torah.locator('.ld-source > summary').filter({ hasText: 'Leviticus 11:1–23' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Law Diary sections' }).getByRole('link', { name: 'Social laws', exact: true }).click();
  await page.getByLabel('Search this section', { exact: true }).fill('Quran 4:135');
  await expect(page.locator('.ld-entry')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Justice and witness', exact: true })).toBeVisible();
  await page.getByLabel('Search this section', { exact: true }).fill('no-known-source');
  await expect(page.getByText('No entries in this section match your search.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(page.locator('.ld-entry')).toHaveCount(6);
});

test('Law Diary separates Hadith and uncertain death traditions and labels locale fallback', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('adigun-bible-preferences', JSON.stringify({ locale: 'yo', preset: 'en' })));
  await page.goto('#/law-diary/second-coming?edition=eng-web');
  const hadith = page.getByRole('article', { name: 'Hadith tradition: descent of Jesus', exact: true });
  await expect(hadith.getByRole('heading', { name: 'Hadith tradition (not Quranic text)', exact: true })).toBeVisible();
  await expect(hadith.getByRole('link', { name: 'Sahih al-Bukhari 3448', exact: true })).toHaveAttribute('href', 'https://sunnah.com/bukhari:3448');
  await expect(hadith.locator('.ld-fallback')).toContainText('(EN fallback)');
  await expect(hadith.locator('.ld-corpus')).toHaveCount(0);
  await page.getByRole('navigation', { name: 'Law Diary sections' }).getByRole('link', { name: 'Apostles', exact: true }).click();
  await expect(page.locator('.ld-entry')).toHaveCount(14);
  await expect(page.getByRole('article', { name: 'Bartholomew', exact: true }).locator('.ld-gap')).toContainText('not been supplied');
  await expect(page.getByRole('article', { name: 'Peter', exact: true })).toContainText('Later church tradition');
});

test('Law Diary shows source-load failure without substituting an edition and reflows at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.route('**/data/books/EXO.json', route => route.abort());
  await page.goto('#/law-diary/social?book=JHN&chapter=3&verse=16&edition=eng-web');
  const justice = page.getByRole('article', { name: 'Justice and witness', exact: true });
  await justice.locator('.ld-source > summary').filter({ hasText: 'Exodus 20:16' }).click();
  await expect(justice.getByRole('alert')).toContainText('No alternative edition has been substituted');
  await expect(justice.getByRole('button', { name: 'Retry source', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

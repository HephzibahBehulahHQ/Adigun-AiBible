import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const read = (book: string, chapter: number) => JSON.parse(readFileSync(new URL(`../data/editions/eng-bsb/books/${book}.json`, import.meta.url), 'utf8')).chapters.find((value: { number: number }) => value.number === chapter);
const john = read('JHN', 3), psalm = read('PSA', 6), genesis = read('GEN', 22);
async function expectSourceVerse(page: Page, number: number, text: string) {
  await expect.poll(async () => (await page.locator(`#verse-${number} [data-source-run]`).allTextContents()).join('')).toBe(text);
}

test('publisher notes and red-letter spans preserve exact wording and source identity', async ({ page }, testInfo) => {
  await page.goto('#/read/JHN/3?verse=16&edition=eng-bsb');
  const verse = page.locator('#verse-16');
  await expectSourceVerse(page, 16, john.verses[15].text);
  await page.getByLabel('Publisher red letters', { exact: true }).check();
  expect(await verse.locator('.source-publisher-jesus').count()).toBeGreaterThan(0);
  expect((await verse.locator('[data-source-run]').allTextContents()).join('')).toBe(john.verses[15].text);
  await expect(verse.locator('.source-added-word')).toHaveText('His');
  const note = page.getByRole('button', { name: 'Publisher note 1 for John 3:16', exact: true });
  await note.click();
  const drawer = page.getByRole('region', { name: 'Publisher source details', exact: true });
  await expect(drawer.locator('.source-note-body')).toHaveText(john.verses[15].notes[0].text);
  await expect(drawer).toContainText('Berean Standard Bible');
  await expect(drawer).toContainText('separate from the verse wording');
  await page.screenshot({ path: testInfo.outputPath('publisher-note-and-source.png') });
  await page.getByRole('button', { name: 'Close publisher source details', exact: true }).click();
  await expect(note).toBeFocused();
  await page.goto('#/read/JHN/3?verse=16&edition=eng-web');
  await expect(page.locator('#verse-16')).toContainText('For God so loved the world');
  await expect(page.getByLabel('Publisher red letters', { exact: true })).toBeDisabled();
  await expect(page.locator('.source-publisher-jesus')).toHaveCount(0);
  await expect(drawer).toHaveCount(0);
});

test('paragraph mode retains every source character, one anchor and one set of actions per verse', async ({ page }) => {
  await page.goto('#/read/JHN/3?verse=16&edition=eng-bsb');
  await expectSourceVerse(page, 16, john.verses[15].text);
  await page.getByLabel('Reading layout', { exact: true }).selectOption('paragraphs');
  await expect(page.locator('.source-paragraph-view')).toBeVisible();
  for (const verse of john.verses as { number: number; text: string }[]) {
    const pieces = page.locator(`.source-paragraph-view [data-verse="${verse.number}"] [data-source-run]`);
    expect((await pieces.allTextContents()).join('')).toBe(verse.text);
    await expect(page.locator(`#verse-${verse.number}`)).toHaveCount(1);
    await expect(page.getByRole('button', { name: `Select verse ${verse.number}`, exact: true })).toHaveCount(1);
  }
  await page.getByRole('button', { name: 'Bookmark verse 16', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove bookmark 16', exact: true })).toBeVisible();
  await page.getByLabel('Reading layout', { exact: true }).selectOption('verses');
  await expect(page.locator('#verse-16').getByRole('button', { name: 'Remove bookmark 16', exact: true })).toBeVisible();
  expect((await page.locator('#verse-16 [data-source-run]').allTextContents()).join('')).toBe(john.verses[15].text);
});

test('poetry, heading notes and narrow layout retain the supplied source structure', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('#/read/PSA/6?verse=1&edition=eng-bsb');
  await expectSourceVerse(page, 1, psalm.verses[0].text);
  await page.getByLabel('Reading layout', { exact: true }).selectOption('paragraphs');
  for (const verse of psalm.verses as { number: number; text: string }[]) expect((await page.locator(`[data-verse="${verse.number}"] [data-source-run]`).allTextContents()).join('')).toBe(verse.text);
  expect(await page.locator('.source-paragraph-block[data-poetry-level="2"]').count()).toBeGreaterThan(0);
  const heading = psalm.headings.find((value: { style: string }) => value.style === 'd');
  expect((await page.locator('.source-heading-description [data-source-heading-run]').allTextContents()).join('')).toBe(heading.text);
  await page.getByRole('button', { name: 'Publisher note 1 for Psalms 6 heading 3', exact: true }).click();
  await expect(page.locator('.source-note-body')).toHaveText(heading.notes[0].text);
  const layout = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, overflowing: [...document.querySelectorAll('main *')].filter(element => element.getBoundingClientRect().right > 321).slice(0, 8).map(element => ({ tag: element.tagName, className: element.className, right: element.getBoundingClientRect().right })) }));
  expect(layout.width, JSON.stringify(layout.overflowing)).toBeLessThanOrEqual(321);
  await page.screenshot({ path: testInfo.outputPath('publisher-poetry-note-320.png') });
  await page.getByRole('button', { name: 'Close publisher source details', exact: true }).click();
  await page.locator('#verse-1').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('publisher-poetry-320.png') });
});

test.describe('publisher reference network recovery', () => {
test.use({ serviceWorkers: 'block' });
// A service worker can satisfy a request outside page.route; this case isolates a real failed fetch.
test('source cross-reference previews retry failed loads and open the same edition', async ({ page }) => {
  await page.goto('#/read/JHN/3?verse=16&edition=eng-bsb');
  await expectSourceVerse(page, 16, john.verses[15].text);
  await page.route('**/data/editions/eng-bsb/books/GEN.json', route => route.abort());
  await page.getByRole('button', { name: 'Details for John 3 heading 2', exact: true }).click();
  await page.getByRole('button', { name: 'Preview Genesis 22:1–10', exact: true }).click();
  const preview = page.locator('.source-reference-preview');
  await expect(preview.getByRole('alert')).toBeVisible();
  await page.unroute('**/data/editions/eng-bsb/books/GEN.json');
  await page.getByRole('button', { name: 'Retry source preview', exact: true }).click();
  await expect(preview).toContainText(genesis.verses[0].text);
  await expect(preview).toContainText(genesis.verses[9].text);
  await expect(page).toHaveURL(/read\/JHN\/3\?verse=16&edition=eng-bsb/);
  await page.getByRole('button', { name: 'Open Genesis 22 in the reader', exact: true }).click();
  await expect(page).toHaveURL(/read\/GEN\/22\?verse=1&end=10&edition=eng-bsb/);
  await expectSourceVerse(page, 1, genesis.verses[0].text);
  await expect(page.getByRole('region', { name: 'Publisher source details', exact: true })).toHaveCount(0);
});
});

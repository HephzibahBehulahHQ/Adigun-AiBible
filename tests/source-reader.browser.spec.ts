import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const read = (book: string, chapter: number) => JSON.parse(readFileSync(new URL(`../data/editions/eng-bsb/books/${book}.json`, import.meta.url), 'utf8')).chapters.find((value: { number: number }) => value.number === chapter);
const john = read('JHN', 3), psalm = read('PSA', 6), genesis = read('GEN', 22);
const readAdigun = (book: string) => JSON.parse(readFileSync(new URL(`../data/editions/adigun-edition/books/${book}.json`, import.meta.url), 'utf8'));
async function expectSourceVerse(page: Page, number: number, text: string) {
  await expect.poll(async () => (await page.locator(`#verse-${number} [data-source-run]`).allTextContents()).join('')).toBe(text);
}

test('Adigun Edition opens its own Genesis text without an overlay or fallback', async ({ page }) => {
  const adigun = readAdigun('GEN');
  await page.goto('#/read/GEN/1?verse=1&edition=eng-web');
  await page.getByLabel('Bible version', { exact: true }).selectOption('adigun-edition');
  await expect(page).toHaveURL(/read\/GEN\/1\?verse=1&edition=adigun-edition/);
  await expect(page.getByRole('heading', { name: 'Genesis 1', exact: true })).toBeVisible();
  await expect(page.locator('.reader-title')).toContainText('Adigun Edition');
  await expectSourceVerse(page, 1, adigun.chapters[0].verses[0].text);
  await expect(page.locator('.reviewed-paraphrase')).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Bible version', exact: true })).toHaveValue('adigun-edition');
  await expect(page.getByRole('button', { name: 'Next chapter' })).toBeEnabled();
  await page.goto('#/read/GEN/50?verse=1&edition=adigun-edition');
  await expect(page.getByRole('heading', { name: 'Genesis 50', exact: true })).toBeVisible();
  await expectSourceVerse(page, 1, adigun.chapters[49].verses[0].text);
  await page.getByRole('button', { name: 'Next chapter' }).click();
  await expect(page.getByRole('heading', { name: 'Exodus 1', exact: true })).toBeVisible();
  await expectSourceVerse(page, 1, readAdigun('EXO').chapters[0].verses[0].text);
  await page.goto('#/read/EXO/40?verse=1&edition=adigun-edition');
  await page.getByRole('button', { name: 'Next chapter' }).click();
  await expect(page.getByRole('heading', { name: 'Leviticus 1', exact: true })).toBeVisible();
  await expectSourceVerse(page, 1, readAdigun('LEV').chapters[0].verses[0].text);
  await page.goto('#/read/LEV/27?verse=1&edition=adigun-edition');
  await page.getByRole('button', { name: 'Next chapter' }).click();
  await expect(page.getByRole('heading', { name: 'Numbers 1', exact: true })).toBeVisible();
  await expectSourceVerse(page, 1, readAdigun('NUM').chapters[0].verses[0].text);
  await page.goto('#/read/NUM/36?verse=1&edition=adigun-edition');
  await page.getByRole('button', { name: 'Next chapter' }).click();
  await expect(page.getByRole('heading', { name: 'Deuteronomy 1', exact: true })).toBeVisible();
  await expectSourceVerse(page, 1, readAdigun('DEU').chapters[0].verses[0].text);
  await page.goto('#/read/DEU/34?verse=12&edition=adigun-edition');
  await expect(page.getByRole('heading', { name: 'Deuteronomy 34', exact: true })).toBeVisible();
  await expectSourceVerse(page, 12, readAdigun('DEU').chapters[33].verses[11].text);
  await page.getByRole('button', { name: 'Next chapter' }).click();
  await expect(page.getByRole('heading', { name: 'Joshua 1', exact: true })).toBeVisible();
  await expectSourceVerse(page, 1, readAdigun('JOS').chapters[0].verses[0].text);
  await page.goto('#/read/JOS/24?verse=33&edition=adigun-edition');
  await expect(page.getByRole('heading', { name: 'Joshua 24', exact: true })).toBeVisible();
  await expectSourceVerse(page, 33, readAdigun('JOS').chapters[23].verses[32].text);
  await page.getByRole('button', { name: 'Next chapter' }).click();
  await expect(page.getByRole('heading', { name: 'Judges 1', exact: true })).toBeVisible();
  await expectSourceVerse(page, 1, readAdigun('JDG').chapters[0].verses[0].text);
  await page.goto('#/read/JDG/21?verse=25&edition=adigun-edition');
  await expect(page.getByRole('heading', { name: 'Judges 21', exact: true })).toBeVisible();
  await expectSourceVerse(page, 25, readAdigun('JDG').chapters[20].verses[24].text);
  await page.getByRole('button', { name: 'Next chapter' }).click();
  await expect(page.getByRole('heading', { name: 'Ruth 1', exact: true })).toBeVisible();
  await expectSourceVerse(page, 1, readAdigun('RUT').chapters[0].verses[0].text);
  await page.goto('#/read/RUT/4?verse=22&edition=adigun-edition');
  await expect(page.getByRole('heading', { name: 'Ruth 4', exact: true })).toBeVisible();
  await expectSourceVerse(page, 22, readAdigun('RUT').chapters[3].verses[21].text);
  await page.getByRole('button', { name: 'Next chapter' }).click();
  await expect(page.getByRole('heading', { name: '1 Samuel 1', exact: true })).toBeVisible();
  await expectSourceVerse(page, 1, readAdigun('1SA').chapters[0].verses[0].text);
  await page.goto('#/read/1SA/31?verse=13&edition=adigun-edition');
  await expect(page.getByRole('heading', { name: '1 Samuel 31', exact: true })).toBeVisible();
  await expectSourceVerse(page, 13, readAdigun('1SA').chapters[30].verses[12].text);
  await page.getByRole('button', { name: 'Next chapter' }).click();
  await expect(page.getByRole('heading', { name: '2 Samuel 1', exact: true })).toBeVisible();
  await expectSourceVerse(page, 1, readAdigun('2SA').chapters[0].verses[0].text);
  await page.goto('#/read/2SA/24?verse=25&edition=adigun-edition');
  await expect(page.getByRole('heading', { name: '2 Samuel 24', exact: true })).toBeVisible();
  await expectSourceVerse(page, 25, readAdigun('2SA').chapters[23].verses[24].text);
  await page.getByRole('button', { name: 'Next chapter' }).click();
  await expect(page.getByRole('heading', { name: '1 Kings 1', exact: true })).toBeVisible();
  await expectSourceVerse(page, 1, readAdigun('1KI').chapters[0].verses[0].text);
  await page.goto('#/read/1KI/22?verse=53&edition=adigun-edition');
  await expect(page.getByRole('heading', { name: '1 Kings 22', exact: true })).toBeVisible();
  await expectSourceVerse(page, 53, readAdigun('1KI').chapters[21].verses[52].text);
  await page.getByRole('button', { name: 'Next chapter' }).click();
  await expect(page.getByRole('heading', { name: '2 Kings 1', exact: true })).toBeVisible();
  await expectSourceVerse(page, 1, readAdigun('2KI').chapters[0].verses[0].text);
  await page.goto('#/read/2KI/25?verse=30&edition=adigun-edition');
  await expect(page.getByRole('heading', { name: '2 Kings 25', exact: true })).toBeVisible();
  await expectSourceVerse(page, 30, readAdigun('2KI').chapters[24].verses[29].text);
  await page.getByRole('button', { name: 'Next chapter' }).click();
  await expect(page.getByRole('heading', { name: '1 Chronicles 1', exact: true })).toBeVisible();
  await expectSourceVerse(page, 1, readAdigun('1CH').chapters[0].verses[0].text);
  await page.goto('#/read/1CH/29?verse=30&edition=adigun-edition');
  await expect(page.getByRole('heading', { name: '1 Chronicles 29', exact: true })).toBeVisible();
  await expectSourceVerse(page, 30, readAdigun('1CH').chapters[28].verses[29].text);
  await page.getByRole('button', { name: 'Next chapter' }).click();
  await expect(page.getByRole('heading', { name: '2 Chronicles 1', exact: true })).toBeVisible();
  await expectSourceVerse(page, 1, readAdigun('2CH').chapters[0].verses[0].text);
  await page.goto('#/read/2CH/36?verse=23&edition=adigun-edition');
  await expect(page.getByRole('heading', { name: '2 Chronicles 36', exact: true })).toBeVisible();
  await expectSourceVerse(page, 23, readAdigun('2CH').chapters[35].verses[22].text);
  await page.getByRole('button', { name: 'Next chapter' }).click();
  await expect(page.getByRole('heading', { name: 'Ezra 1', exact: true })).toBeVisible();
  await expectSourceVerse(page, 1, readAdigun('EZR').chapters[0].verses[0].text);
  await page.goto('#/read/EZR/10?verse=44&edition=adigun-edition');
  await expect(page.getByRole('heading', { name: 'Ezra 10', exact: true })).toBeVisible();
  await expectSourceVerse(page, 44, readAdigun('EZR').chapters[9].verses[43].text);
  await page.getByRole('button', { name: 'Next chapter' }).click();
  await expect(page.getByRole('heading', { name: 'Nehemiah 1', exact: true })).toBeVisible();
  await expectSourceVerse(page, 1, readAdigun('NEH').chapters[0].verses[0].text);
  await page.goto('#/read/NEH/13?verse=31&edition=adigun-edition');
  await expect(page.getByRole('heading', { name: 'Nehemiah 13', exact: true })).toBeVisible();
  await expectSourceVerse(page, 31, readAdigun('NEH').chapters[12].verses[30].text);
  await page.getByRole('button', { name: 'Next chapter' }).click();
  await expect(page.getByRole('heading', { name: 'Esther 1', exact: true })).toBeVisible();
  await expectSourceVerse(page, 1, readAdigun('EST').chapters[0].verses[0].text);
  await page.goto('#/read/EST/10?verse=3&edition=adigun-edition');
  await expect(page.getByRole('heading', { name: 'Esther 10', exact: true })).toBeVisible();
  await expectSourceVerse(page, 3, readAdigun('EST').chapters[9].verses[2].text);
  await page.getByRole('button', { name: 'Next chapter' }).click();
  await expect(page.getByRole('heading', { name: 'Job 1', exact: true })).toBeVisible();
  await expectSourceVerse(page, 1, readAdigun('JOB').chapters[0].verses[0].text);
  await page.goto('#/read/JOB/42?verse=17&edition=adigun-edition');
  await expect(page.getByRole('heading', { name: 'Job 42', exact: true })).toBeVisible();
  await expectSourceVerse(page, 17, readAdigun('JOB').chapters[41].verses[16].text);
  await page.getByRole('button', { name: 'Next chapter' }).click();
  await expect(page.getByRole('heading', { name: 'Matthew 1', exact: true })).toBeVisible();
  await expectSourceVerse(page, 1, readAdigun('MAT').chapters[0].verses[0].text);
});

test('Adigun New Testament preserves empty source positions and opens Revelation', async ({ page }) => {
  await page.goto('#/read/LUK/17?verse=36&edition=adigun-edition');
  await expect(page.getByRole('heading', { name: 'Luke 17', exact: true })).toBeVisible();
  await expect(page.locator('#verse-36')).toHaveCount(1);
  await expectSourceVerse(page, 36, '');
  await expectSourceVerse(page, 37, readAdigun('LUK').chapters[16].verses[36].text);
  await page.goto('#/read/REV/22?verse=21&edition=adigun-edition');
  await expect(page.getByRole('heading', { name: 'Revelation 22', exact: true })).toBeVisible();
  await expectSourceVerse(page, 21, readAdigun('REV').chapters[21].verses[20].text);
});

test('reading language keeps the passage and uses the selected source editions', async ({ page }) => {
  await page.goto('#/read/JHN/3?verse=16&end=17&edition=eng-web');
  const language = page.getByRole('combobox', { name: 'Reading language' });
  for (const edition of ['yor', 'deu1912', 'eng-web']) {
    await language.selectOption(edition);
    await expect(page).toHaveURL(new RegExp('JHN/3.*verse=16.*end=17.*edition='+edition));
    const path = edition === 'eng-web' ? '../data/books/JHN.json' : '../data/editions/'+edition+'/books/JHN.json';
    const book = JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
    await expectSourceVerse(page, 16, book.chapters[2].verses.find((row: { number: number }) => row.number === 16).text);
  }
});

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



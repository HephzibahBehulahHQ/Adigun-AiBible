import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

type Edition = { id: string; name: string; language: string; corpus: string; attribution: string; conditions: string[]; licenseDeedUrl?: string };
type SourceBook = { name: string; chapters: { number: number; verses: { number: number; text: string }[] }[] };
const ids = ['fra-darby2024', 'spa-simple2026', 'tdx-tandroy', 'hausa2020'];
const catalog = JSON.parse(readFileSync(new URL('../data/editions/catalog.json', import.meta.url), 'utf8'));
const baseline = JSON.parse(readFileSync(new URL('../data/manifest.json', import.meta.url), 'utf8'));
const editions: Edition[] = [baseline.edition, ...catalog.editions.filter((edition: Edition) => edition.corpus === 'bible')];
const metadata = (id: string) => editions.find(edition => edition.id === id)!;
const book = (id: string, bookId = 'JHN'): SourceBook => JSON.parse(readFileSync(new URL(`../data/editions/${id}/books/${bookId}.json`, import.meta.url), 'utf8'));
const verse = (id: string, bookId = 'JHN', chapter = 3, number = 16) => book(id, bookId).chapters.find(row => row.number === chapter)!.verses.find(row => row.number === number)!.text;
const route = (view: string, id: string, bookId = 'JHN', chapter = 3, number = 16, end?: number) => `#/${view}/${bookId}/${chapter}?verse=${number}${end === undefined ? '' : `&end=${end}`}&edition=${id}`;

async function exactVerse(page: Page, number: number, text: string) {
  await expect.poll(async () => (await page.locator(`#verse-${number} [data-source-run]`).allTextContents()).join('')).toBe(text);
}

async function cachedNotice(page: Page, id: string) {
  return page.evaluate(async editionId => {
    const base = new URL('./', location.href);
    for (const name of await caches.keys()) {
      if (!name.startsWith('adigun-bible-')) continue;
      const cache = await caches.open(name);
      const response = await cache.match(new URL(`data/editions/${editionId}/NOTICE.txt`, base));
      if (response) return response.text();
    }
    return null;
  }, id);
}

test.describe('four exact source admissions', () => {
  test.use({ serviceWorkers: 'block' });

  test('34 editions report 22 source languages and preserve the separate regional filters', async ({ page }) => {
    expect(editions).toHaveLength(34);
    expect(new Set(editions.map(edition => new Intl.Locale(edition.language).language)).size).toBe(22);
    await page.goto(route('editions', 'eng-web'));
    await expect(page.getByText('34 installed Bible text editions · 31 added beyond the verified three-edition baseline.', { exact: false })).toBeVisible();
    await expect(page.getByText(/^Installed source languages \(21\):/)).toBeVisible();
    const languages = page.getByRole('combobox', { name: 'Language', exact: true });
    await expect(languages.locator('option')).toHaveCount(24); // 23 exact tags plus the all-languages option.
    const results = page.getByRole('region', { name: 'Installed Bible editions', exact: true });
    for (const tag of ['es', 'es-419']) {
      await languages.selectOption(tag);
      await expect(results.getByRole('article')).toHaveCount(editions.filter(edition => edition.language === tag).length);
      await expect(results.getByRole('heading', { level: 2 })).toHaveText(editions.filter(edition => edition.language === tag).map(edition => edition.name));
    }
  });

  for (const id of ids) {
    test(`${id} selection retains the complete range and original source characters`, async ({ page }) => {
      await page.goto(route('editions', 'eng-web', 'JHN', 3, 16, 18));
      await page.getByRole('textbox', { name: 'Find an edition', exact: true }).fill(id);
      const results = page.getByRole('region', { name: 'Installed Bible editions', exact: true });
      await expect(results.getByRole('article')).toHaveCount(1);
      await results.getByRole('button', { name: 'Read edition', exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`#/read/JHN/3\\?verse=16&end=18&edition=${id}$`));
      await expect(page.locator('.reader-title .eyebrow')).toHaveText(metadata(id).name);
      await expect(page.locator('.scripture')).toHaveAttribute('lang', metadata(id).language);
      for (const number of [16, 17, 18]) {
        await exactVerse(page, number, verse(id, 'JHN', 3, number));
        await expect(page.locator(`#verse-${number}`)).toHaveClass(/\bselected\b/);
      }
      await expect(page.locator('#verse-15')).not.toHaveClass(/\bselected\b/);
      await expect(page.locator('#verse-19')).not.toHaveClass(/\bselected\b/);
    });
  }

  test('French source numbering retains Joel 4 and Malachi 3 before crossing book boundaries', async ({ page }) => {
    const id = 'fra-darby2024';
    await page.goto(route('read', id, 'JOL', 4, 21));
    await exactVerse(page, 21, verse(id, 'JOL', 4, 21));
    await expect(page).toHaveURL(/#\/read\/JOL\/4\?verse=21&edition=fra-darby2024$/);
    await page.getByRole('button', { name: 'Next chapter', exact: true }).first().click();
    await expect(page).toHaveURL(/#\/read\/AMO\/1\?verse=1&edition=fra-darby2024$/);
    await exactVerse(page, 1, verse(id, 'AMO', 1, 1));
    await page.goto(route('read', id, 'MAL', 3, 24));
    await exactVerse(page, 24, verse(id, 'MAL', 3, 24));
    await page.getByRole('button', { name: 'Next chapter', exact: true }).first().click();
    await expect(page).toHaveURL(/#\/read\/MAT\/1\?verse=1&edition=fra-darby2024$/);
    await exactVerse(page, 1, verse(id, 'MAT', 1, 1));
  });

  test('empty French records and missing Tandroy numbers never borrow another edition’s wording', async ({ page }) => {
    await page.goto(route('read', 'fra-darby2024', 'ACT', 8, 37));
    await expect(page.locator('#verse-37 .source-omission')).toContainText('no replacement text has been added');
    await expect(page.locator('#verse-37 [data-source-run]')).toHaveCount(0);
    await exactVerse(page, 36, verse('fra-darby2024', 'ACT', 8, 36));
    await exactVerse(page, 38, verse('fra-darby2024', 'ACT', 8, 38));
    await page.goto(route('read', 'tdx-tandroy', '2SA', 13, 3));
    await expect(page.getByRole('status').filter({ hasText: 'The publisher has no verse 3 record in this chapter.' })).toBeVisible();
    await expect(page.locator('#verse-3')).toHaveCount(0);
    await exactVerse(page, 2, verse('tdx-tandroy', '2SA', 13, 2));
    await exactVerse(page, 4, verse('tdx-tandroy', '2SA', 13, 4));
    await expect(page.locator('.reader-title .eyebrow')).toHaveText(metadata('tdx-tandroy').name);
  });

  test('Tandroy draft and CC BY-SA conditions stay visible at 320px', async ({ page }, testInfo) => {
    await page.goto(route('editions', 'tdx-tandroy'));
    await page.getByRole('textbox', { name: 'Find an edition', exact: true }).fill('tdx-tandroy');
    const card = page.getByRole('region', { name: 'Installed Bible editions', exact: true }).getByRole('article');
    await expect(card).toHaveCount(1);
    await expect(card.getByRole('heading', { level: 2 })).toContainText('publisher draft');
    await expect(card.getByText('CC BY-SA 4.0', { exact: true })).toBeVisible();
    await card.getByText('Permissions, sources and conditions', { exact: true }).click();
    const conditions = card.getByRole('list', { name: 'Edition conditions', exact: true });
    await expect(conditions.getByRole('listitem')).toHaveText(metadata('tdx-tandroy').conditions);
    await expect(conditions).toContainText('PUBLISHER DRAFT');
    await expect(conditions).toContainText('Copyright © 2023 Steve Lellelid');
    await expect(conditions).toContainText('indication of changes and share-alike obligations');
    await expect(card.getByRole('link', { name: 'License terms', exact: true })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by-sa/4.0/');
    const recording = card.locator('.rights-list > div').filter({ has: page.locator('dt', { hasText: /^recordedAudio$/ }) });
    const training = card.locator('.rights-list > div').filter({ has: page.locator('dt', { hasText: /^modelTraining$/ }) });
    await expect(recording.locator('dd')).toContainText('Unavailable');
    await expect(training.locator('dd')).toContainText('Unavailable');
    await page.setViewportSize({ width: 320, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await card.getByRole('heading', { level: 2 }).scrollIntoViewIfNeeded();
    const screenshot = testInfo.outputPath('tandroy-draft-conditions-320.png');
    await page.screenshot({ path: screenshot, animations: 'disabled' });
    await testInfo.attach('Tandroy publisher draft and conditions at 320px', { path: screenshot, contentType: 'image/png' });
    await conditions.getByRole('listitem').filter({ hasText: /^PUBLISHER DRAFT:/ }).scrollIntoViewIfNeeded();
    const licenseScreenshot = testInfo.outputPath('tandroy-license-obligations-320.png');
    await page.screenshot({ path: licenseScreenshot, animations: 'disabled' });
    await testInfo.attach('Tandroy draft, change notice and share-alike obligations at 320px', { path: licenseScreenshot, contentType: 'image/png' });
  });

  test('a downloaded notebook preserves all four exact sources and the Tandroy license conditions', async ({ page }) => {
    for (const id of ids) {
      await page.goto(route('read', id));
      await exactVerse(page, 16, verse(id));
      await page.getByRole('button', { name: 'Bookmark verse 16', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Remove bookmark 16', exact: true })).toBeVisible();
      await page.goto(route('saved', id));
      await expect(page.getByRole('status').filter({ hasText: /^Saved on this device$/ })).toBeVisible();
    }
    await page.goto(route('saved', 'tdx-tandroy'));
    await page.reload();
    await expect(page.locator('.saved-card')).toHaveCount(4);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export notebook', exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('Adigun-AiBible-notebook.md');
    const text = readFileSync((await download.path())!, 'utf8');
    for (const id of ids) {
      expect(text).toContain(`## ${book(id).name} 3:16 · ${id}`);
      expect(text).toContain(`> 16. ${verse(id)}`);
      expect(text).toContain(metadata(id).attribution);
      for (const condition of metadata(id).conditions) expect(text).toContain(condition);
    }
    expect(text).toContain('https://creativecommons.org/licenses/by-sa/4.0/');
    expect(text).toContain('Original VPL TXT wording unchanged; source formatting converted to JSON');
  });
});

test.describe('new source and notice downloads', () => {
  test.use({ serviceWorkers: 'allow' });

  for (const id of ids) {
    test(`${id} and its exact notice survive offline document reload; an uncached book stays unavailable`, async ({ page, context }) => {
      test.setTimeout(90_000);
      await page.goto(route('read', id));
      await exactVerse(page, 16, verse(id));
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, { timeout: 30_000 });
      await page.goto(route('settings', id));
      await page.getByRole('button', { name: 'Download current book', exact: true }).click();
      await expect(page.getByText(`${book(id).name} is available offline.`, { exact: true })).toBeVisible({ timeout: 30_000 });
      const notice = readFileSync(new URL(`../data/editions/${id}/NOTICE.txt`, import.meta.url), 'utf8');
      expect(await cachedNotice(page, id)).toBe(notice);
      await context.setOffline(true);
      try {
        await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
        await page.goto(route('read', id));
        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
        expect(await page.evaluate(async () => {
          try { await fetch(`./__uncached_network_check__?t=${Date.now()}`, { cache: 'no-store' }); return false; }
          catch { return true; }
        })).toBe(true);
        await expect(page.locator('.offline-banner')).toBeVisible();
        await exactVerse(page, 16, verse(id));
        expect(await cachedNotice(page, id)).toBe(notice);
        await page.getByRole('button', { name: 'Next chapter', exact: true }).first().click();
        await expect(page).toHaveURL(new RegExp(`#/read/JHN/4\\?verse=1&edition=${id}$`));
        await exactVerse(page, 1, verse(id, 'JHN', 4, 1));
        await page.goto(route('read', id, 'EXO', 1, 1));
        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(page.getByRole('heading', { name: 'Unable to load this passage', exact: true })).toBeVisible();
        await expect(page.getByText("This chapter isn't cached yet. Reconnect to load it.", { exact: true })).toBeVisible();
        await expect(page.locator('#verse-1')).toHaveCount(0);
      } finally { await context.setOffline(false); }
    });
  }
});

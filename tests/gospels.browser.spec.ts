import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { Book, Manifest } from '../src/types';

const bible = 'JHN/3?verse=16&end=18&edition=eng-web';
const route = `#/gospels/${bible}`;
const gospelNames = { MAT: 'Matthew', MRK: 'Mark', LUK: 'Luke', JHN: 'John' } as const;
type Gospel = keyof typeof gospelNames;
const sourcePath = (edition: string, path: string) => edition === 'eng-web' ? `data/${path}` : `data/editions/${edition}/${path}`;
const sourceBook = (edition: string, book: Gospel): Book => JSON.parse(readFileSync(new URL(`../${sourcePath(edition, `books/${book}.json`)}`, import.meta.url), 'utf8'));
const manifest = (edition: string): Manifest => JSON.parse(readFileSync(new URL(`../${sourcePath(edition, 'manifest.json')}`, import.meta.url), 'utf8'));
const pane = (page: Page, book: Gospel) => page.getByRole('article', { name: `${gospelNames[book]} comparison pane`, exact: true });
const rows = (card: Locator) => card.locator(':scope > .gospel-source > p');
async function exactPassage(page: Page, book: Gospel, edition: string, chapter: number, start: number, end: number) {
  const card = pane(page, book), expected = sourceBook(edition, book).chapters.find(row => row.number === chapter)!.verses.filter(verse => verse.number >= start && verse.number <= end);
  await expect(card.locator('.gospel-reference')).toHaveText(`${gospelNames[book]} ${chapter}:${start}${end === start ? '' : `–${end}`} · ${edition}`);
  await expect(card.locator('.gospel-edition')).toHaveText(`${manifest(edition).edition.name} · ${manifest(edition).edition.language} · exact source wording`);
  await expect(rows(card)).toHaveCount(expected.length);
  expect(await rows(card).locator('span').allTextContents()).toEqual(expected.map(verse => verse.text));
  expect(await rows(card).evaluateAll(elements => elements.map(element => Number(element.getAttribute('data-verse'))))).toEqual(expected.map(verse => verse.number));
  await expect(card.locator(':scope > .gospel-source')).toHaveAttribute('lang', manifest(edition).edition.language);
}
async function sower(page: Page, edition = 'eng-web') {
  await exactPassage(page, 'MAT', edition, 13, 1, 23);
  await exactPassage(page, 'MRK', edition, 4, 1, 20);
  await exactPassage(page, 'LUK', edition, 8, 4, 15);
}
async function independent(page: Page, book: Gospel, edition: string, chapter: number, start: number, end: number) {
  const card = pane(page, book);
  if (book !== 'JHN') await card.getByRole('checkbox', { name: 'Follow the Sower selection', exact: true }).uncheck();
  await card.getByLabel('Independent edition', { exact: true }).selectOption(edition);
  await card.getByLabel('Chapter', { exact: true }).fill(String(chapter));
  await card.getByLabel('From verse', { exact: true }).fill(String(start));
  await card.getByLabel('Through verse', { exact: true }).fill(String(end));
  await card.getByRole('button', { name: 'Apply independent passage', exact: true }).click();
}
async function capture(page: Page, path: string, width: number, height: number) {
  await page.setViewportSize({ width, height });
  if (width <= 1050) {
    await expect(page.locator('.sidebar')).not.toHaveClass(/\bopen\b/);
    await expect.poll(() => page.locator('.sidebar').evaluate(element => element.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
}
async function download(page: Page) {
  const details = page.locator('.gospel-downloads');
  if (!(await details.evaluate(element => (element as HTMLDetailsElement).open))) await details.locator('summary').click();
  await details.getByRole('button', { name: 'Download or verify these Gospel books', exact: true }).click();
  await expect(details.getByRole('status')).toHaveText('Selected Gospel books and included source notices are verified for offline reading on this device.');
}
async function cacheSnapshot(page: Page) {
  return page.evaluate(async () => {
    const result = [];
    for (const name of (await caches.keys()).sort()) {
      const cache = await caches.open(name), files = [];
      for (const request of [...await cache.keys()].sort((a, b) => a.url.localeCompare(b.url))) {
        const response = await cache.match(request);
        if (!response) throw new Error('A retained cached source disappeared.');
        const bytes = await response.arrayBuffer();
        const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
        files.push({ url: request.url, bytes: bytes.byteLength, sha256 });
      }
      result.push({ name, files });
    }
    return result;
  });
}

test('complete Sower sources, context and attribution remain exact through keyboard and narrow reading', async ({ page, isMobile }, testInfo) => {
  await page.goto(route); await sower(page);
  await expect(page.locator('.gospel-panes > article')).toHaveCount(3);
  await expect(page.locator('.gospel-selection')).toContainText('editorial review pending');
  const matthew = pane(page, 'MAT'), context = matthew.locator('.gospel-context');
  await context.locator('summary').focus(); await page.keyboard.press('Enter');
  await expect(context).toHaveAttribute('open', '');
  const fullChapter = sourceBook('eng-web', 'MAT').chapters.find(chapter => chapter.number === 13)!.verses;
  expect(await context.locator('.gospel-source > p > span').allTextContents()).toEqual(fullChapter.map(verse => verse.text));
  await context.locator('summary').press('Enter');
  const attribution = matthew.locator('.gospel-attribution');
  await attribution.locator('summary').click();
  await expect(attribution.locator('p > span')).toHaveText(manifest('eng-web').edition.sha256!);
  await expect(attribution).toContainText(manifest('eng-web').edition.licenseUrl);
  await attribution.locator('summary').click();
  await capture(page, testInfo.outputPath('gospel-source-native.png'), isMobile ? 390 : 1440, isMobile ? 844 : 900);
  await capture(page, testInfo.outputPath('gospel-source-320.png'), 320, 844);
  const linked = matthew.getByRole('checkbox', { name: 'Follow the Sower selection', exact: true });
  await linked.focus(); await page.keyboard.press('Space'); await expect(linked).not.toBeChecked();
  await expect(matthew.getByLabel('Chapter', { exact: true })).toHaveValue('13');
  await linked.focus(); await page.keyboard.press('Space'); await expect(linked).toBeChecked();
  await page.locator('.gospel-workspace').evaluate(element => (element as HTMLElement).style.setProperty('--reading-size', '40px'));
  await expect.poll(() => rows(matthew).first().evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBe(40);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await rows(matthew).first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('gospel-source-320-double-text.png'), animations: 'disabled' });
  await sower(page);
});

test('Study Tools and Law Diary open Gospel comparison without moving the original reader range', async ({ page }) => {
  const preserved = 'JHN/3?verse=16&end=18&edition=yor';
  await page.goto(`#/tools/${preserved}`);
  await page.getByRole('button', { name: 'Open gospel comparison', exact: true }).click();
  expect(new URL(page.url()).hash).toBe(`#/gospels/${preserved}`);
  await sower(page, 'yor');
  await page.getByRole('button', { name: 'Return to reader', exact: true }).click();
  await expect(page).toHaveURL(/#\/read\/JHN\/3\?verse=16&end=18&edition=yor$/);
  await expect(page.locator('#verse-16')).toBeVisible();
  await page.goto('#/law-diary/sermons?book=JHN&chapter=3&verse=16&end=18&edition=yor');
  await page.getByRole('button', { name: 'Compare the Sower in three Gospels', exact: true }).click();
  expect(new URL(page.url()).hash).toBe(`#/gospels/${preserved}`);
  await sower(page, 'yor');
  await expect(page.locator('.gospel-return')).toContainText('John 3:16–18');
  await page.getByRole('button', { name: 'Return to reader', exact: true }).click();
  await expect(page).toHaveURL(/#\/read\/JHN\/3\?verse=16&end=18&edition=yor$/);
});

test('independent BSB numbering gaps stay intact beside linked German sources across reload and history', async ({ page }, testInfo) => {
  await page.goto(route); await sower(page);
  await independent(page, 'MAT', 'eng-bsb', 17, 20, 22);
  await exactPassage(page, 'MAT', 'eng-bsb', 17, 20, 22);
  await expect(pane(page, 'MAT').getByRole('status')).toContainText('17:21 — No verse record in this edition.');
  await page.getByLabel('Edition for linked Gospel panes', { exact: true }).selectOption('deu1912');
  await exactPassage(page, 'MAT', 'eng-bsb', 17, 20, 22);
  await exactPassage(page, 'MRK', 'deu1912', 4, 1, 20); await exactPassage(page, 'LUK', 'deu1912', 8, 4, 15);
  const germanHash = new URL(page.url()).hash;
  expect(germanHash).toContain(`#${'/gospels/'}${bible}&`);
  await page.reload(); await exactPassage(page, 'MAT', 'eng-bsb', 17, 20, 22); await exactPassage(page, 'MRK', 'deu1912', 4, 1, 20);
  await page.getByLabel('Edition for linked Gospel panes', { exact: true }).selectOption('yor');
  await exactPassage(page, 'MRK', 'yor', 4, 1, 20);
  const yorubaHash = new URL(page.url()).hash;
  await page.goBack(); await exactPassage(page, 'MRK', 'deu1912', 4, 1, 20); expect(new URL(page.url()).hash).toBe(germanHash);
  await exactPassage(page, 'MAT', 'eng-bsb', 17, 20, 22);
  await page.goForward(); await exactPassage(page, 'MRK', 'yor', 4, 1, 20); expect(new URL(page.url()).hash).toBe(yorubaHash);
  await exactPassage(page, 'MAT', 'eng-bsb', 17, 20, 22);
  await page.screenshot({ path: testInfo.outputPath('gospel-independent-source-gap.png'), fullPage: true, animations: 'disabled' });
});

test('John remains independent, pane bounds work and opening a custom passage keeps its full range', async ({ page }) => {
  await page.goto(route); await sower(page);
  await page.getByRole('button', { name: 'Add independent pane', exact: true }).click();
  await expect(page.locator('.gospel-panes > article')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Add independent pane', exact: true })).toHaveCount(0);
  await expect(pane(page, 'JHN').getByRole('checkbox')).toHaveCount(0);
  await expect(pane(page, 'JHN')).toContainText('No John counterpart is assigned');
  await independent(page, 'JHN', 'eng-bsb', 3, 16, 18); await exactPassage(page, 'JHN', 'eng-bsb', 3, 16, 18);
  await pane(page, 'LUK').getByRole('button', { name: 'Remove Luke pane', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Parable of the Sower', exact: true })).toBeFocused();
  await pane(page, 'MRK').getByRole('button', { name: 'Remove Mark pane', exact: true }).click();
  await expect(page.locator('.gospel-panes > article')).toHaveCount(2);
  await expect(pane(page, 'MAT').getByRole('button', { name: 'Remove Matthew pane', exact: true })).toBeDisabled();
  await expect(pane(page, 'JHN').getByRole('button', { name: 'Remove John pane', exact: true })).toBeDisabled();
  await exactPassage(page, 'JHN', 'eng-bsb', 3, 16, 18);
  await pane(page, 'JHN').getByRole('button', { name: 'Open John 3:16–18 in reader', exact: true }).click();
  await expect(page).toHaveURL(/#\/read\/JHN\/3\?verse=16&end=18&edition=eng-bsb$/);
});

test('downloaded Gospel books reopen through the real service worker offline and uncached editions fail honestly', async ({ page, context }, testInfo) => {
  await page.goto('#/gospels/MAT/13?verse=1&end=23&edition=eng-web'); await sower(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await download(page);
  await context.setOffline(true);
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);
  expect(await page.evaluate(async () => { try { await fetch(`unavailable-gospel-offline-probe-${Date.now()}.json`, { cache: 'no-store' }); return false; } catch { return true; } })).toBe(true);
  await page.reload(); await sower(page);
  await page.screenshot({ path: testInfo.outputPath('gospel-offline-source.png'), fullPage: true, animations: 'disabled' });
  await page.getByLabel('Edition for linked Gospel panes', { exact: true }).selectOption('deu1912');
  await expect(pane(page, 'MAT').getByRole('alert')).toContainText('No other edition or range has been substituted.');
  await expect(rows(pane(page, 'MAT'))).toHaveCount(0);
  await pane(page, 'MAT').getByRole('button', { name: 'Retry Gospel passage', exact: true }).click();
  await expect(pane(page, 'MAT').getByRole('alert')).toBeVisible();
  await context.setOffline(false);
  for (const book of ['MAT', 'MRK', 'LUK'] as const) await pane(page, book).getByRole('button', { name: 'Retry Gospel passage', exact: true }).click();
  await sower(page, 'deu1912');
});

test.describe('Gospel request and download boundaries', () => {
  test.use({ serviceWorkers: 'block' });

  test('an invalid deep link and a failed source recover only by explicit selection or retry', async ({ page }) => {
    await page.goto(`${route}&gospelGroup=sower&gospelGroup=sower&gospelEdition=eng-web&gospelBooks=MAT,MRK,LUK`);
    await expect(page.locator('.gospel-workspace').getByRole('alert')).toContainText('repeats a selection field');
    await expect(page.locator('.gospel-panes > article')).toHaveCount(0);
    await expect(page.locator('.gospel-return')).toContainText('John 3:16–18');
    await page.getByRole('button', { name: 'Open the supplied Sower selection', exact: true }).click(); await sower(page);
    await page.route('**/data/editions/eng-bsb/books/MAT.json', request => request.fulfill({ status: 503, body: 'Controlled unavailable-source response.' }));
    await independent(page, 'MAT', 'eng-bsb', 17, 20, 22);
    await expect(pane(page, 'MAT').getByRole('alert')).toContainText('No other edition or range has been substituted.');
    await expect(rows(pane(page, 'MAT'))).toHaveCount(0);
    await exactPassage(page, 'MRK', 'eng-web', 4, 1, 20);
    await page.unroute('**/data/editions/eng-bsb/books/MAT.json');
    await pane(page, 'MAT').getByRole('button', { name: 'Retry Gospel passage', exact: true }).click();
    await exactPassage(page, 'MAT', 'eng-bsb', 17, 20, 22);
    await expect(pane(page, 'MAT').getByRole('alert')).toHaveCount(0);
  });

  test('a delayed actual earlier source response cannot replace the newly selected edition', async ({ page }) => {
    let release!: () => void, begun!: () => void, finished!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { begun = resolve; }), done = new Promise<void>(resolve => { finished = resolve; });
    await page.route('**/data/books/MAT.json', async request => {
      const response = await request.fetch(); begun(); await barrier;
      try { await request.fulfill({ response }); } finally { finished(); }
    });
    try {
      await page.goto(route); await started;
      await expect(rows(pane(page, 'MAT'))).toHaveCount(0);
      await page.getByLabel('Edition for linked Gospel panes', { exact: true }).selectOption('deu1912');
      await sower(page, 'deu1912');
      const received = page.waitForEvent('requestfinished', { predicate: request => request.url().endsWith('/data/books/MAT.json') });
      release(); await done; await received;
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await sower(page, 'deu1912');
      await expect(pane(page, 'MAT').locator('.gospel-edition')).not.toContainText(manifest('eng-web').edition.name);
    } finally { release(); }
  });

  test('cancelling a new Gospel pack preserves every byte of the previous complete download', async ({ page }) => {
    await page.goto(route); await sower(page); await download(page);
    const before = await cacheSnapshot(page);
    expect(before.some(cache => cache.files.some(file => file.url.endsWith('/__adigun_offline_pack__.json')))).toBe(true);
    let release!: () => void, begun!: () => void, finished!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { begun = resolve; }), done = new Promise<void>(resolve => { finished = resolve; });
    await page.route('**/data/editions/deu1912/books/MAT.json', async request => {
      const response = await request.fetch(); begun(); await barrier;
      try { await request.fulfill({ response }); } finally { finished(); }
    });
    try {
      await page.getByLabel('Edition for linked Gospel panes', { exact: true }).selectOption('deu1912'); await started;
      await expect(rows(pane(page, 'MAT'))).toHaveCount(0);
      await page.locator('.gospel-downloads').getByRole('button', { name: 'Download or verify these Gospel books', exact: true }).click();
      await expect(page.locator('.gospel-downloads').getByRole('status')).toHaveText('Checking the selected sources and offline permissions…');
      expect(await page.evaluate(() => window.dispatchEvent(new Event('adigun:before-update', { cancelable: true })))).toBe(false);
      await page.getByRole('button', { name: 'Cancel Gospel download', exact: true }).click();
      await expect(page.locator('.gospel-downloads').getByRole('alert')).toHaveText('Gospel download cancelled. Existing complete downloads are retained.');
      await expect(page.getByRole('button', { name: 'Download or verify these Gospel books', exact: true })).toBeEnabled();
      expect(await page.evaluate(() => window.dispatchEvent(new Event('adigun:before-update', { cancelable: true })))).toBe(true);
      expect(await cacheSnapshot(page)).toEqual(before);
      await page.getByLabel('Edition for linked Gospel panes', { exact: true }).selectOption('eng-web'); await sower(page);
      await download(page);
      const afterRetry = await cacheSnapshot(page);
      const received = page.waitForEvent('requestfinished', { predicate: request => request.url().endsWith('/data/editions/deu1912/books/MAT.json') });
      release(); await done; await received;
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await expect(page.locator('.gospel-downloads').getByRole('status')).toHaveText('Selected Gospel books and included source notices are verified for offline reading on this device.');
      await expect(page.locator('.gospel-downloads').getByRole('alert')).toHaveCount(0);
      expect(await cacheSnapshot(page)).toEqual(afterRetry);
      await sower(page);
    } finally { release(); }
  });
});

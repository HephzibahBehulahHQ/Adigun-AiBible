import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

type Edition = { id: string; name: string; language: string; corpus: string };
type SourceBook = { name: string; chapters: { number: number; verses: { number: number; text: string }[] }[] };
const baseline = JSON.parse(readFileSync(new URL('../data/manifest.json', import.meta.url), 'utf8'));
const catalog = JSON.parse(readFileSync(new URL('../data/editions/catalog.json', import.meta.url), 'utf8'));
const editions: Edition[] = [baseline.edition, ...catalog.editions.filter((edition: Edition) => edition.corpus === 'bible')];
const added = [
  'fra-ostervald', 'epo-londona', 'arb-vandyck', 'mya-judson1840', 'nld-1917', 'haw-1868',
  'rus-synodal', 'ukr-kulish1905', 'vie-cadman', 'srp-danicic-karadzic', 'ton-revised-west', 'eng-geneva1599',
];
const sourceBooks = new Map(added.map(id => [id, JSON.parse(readFileSync(new URL(`../data/editions/${id}/books/JHN.json`, import.meta.url), 'utf8')) as SourceBook]));
const sourceVerse = (id: string, chapter = 3, verse = 16): string => sourceBooks.get(id)!.chapters.find(row => row.number === chapter)!.verses.find(row => row.number === verse)!.text;
const route = (view: string, id: string, chapter = 3, verse = 16, end?: number) => `#/${view}/JHN/${chapter}?verse=${verse}${end === undefined ? '' : `&end=${end}`}&edition=${id}`;

async function exactVerse(page: Page, verse: number, expected: string) {
  // Read only source spans: verse numbers and action labels must not obscure a Unicode change.
  await expect.poll(async () => (await page.locator(`#verse-${verse} [data-source-run]`).allTextContents()).join('')).toBe(expected);
}

async function cachedJohnFiles(page: Page, id: string): Promise<string[]> {
  return page.evaluate(async editionId => {
    const matches: string[] = [];
    for (const name of await caches.keys()) {
      if (!name.startsWith('adigun-bible-')) continue;
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        if (new URL(request.url).pathname.endsWith(`/data/editions/${editionId}/books/JHN.json`)) matches.push(request.url);
      }
    }
    return matches;
  }, id);
}

test.describe('twelve-edition built catalog and source reading', () => {
  test.use({ serviceWorkers: 'block' });

  test('the 26-edition catalog exposes the added languages and every paginated source', async ({ page }) => {
    expect(editions).toHaveLength(26);
    await page.goto(route('editions', 'eng-web', 3, 16, 18));
    await expect(page.getByText('26 installed Bible text editions · 23 added beyond the verified three-edition baseline.', { exact: false })).toBeVisible();
    const results = page.getByRole('region', { name: 'Installed Bible editions', exact: true });
    const language = page.getByRole('combobox', { name: 'Language', exact: true });
    const expectedLanguages = [...new Set(editions.map(edition => edition.language))];
    expect(await language.locator('option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value).filter(Boolean))).toEqual(expect.arrayContaining(expectedLanguages));
    await expect(language.locator('option')).toHaveCount(expectedLanguages.length + 1);
    const names: string[] = [];
    for (let pageIndex = 0; pageIndex < 3; pageIndex++) {
      await expect(results.getByRole('article')).toHaveCount(pageIndex < 2 ? 12 : 2);
      names.push(...await results.getByRole('heading', { level: 2 }).allTextContents());
      const next = page.getByRole('button', { name: 'Next editions', exact: true });
      if (pageIndex < 2) await next.click();
      else await expect(next).toBeDisabled();
    }
    expect(names.sort()).toEqual(editions.map(edition => edition.name).sort());
    for (const code of new Set(added.map(id => editions.find(edition => edition.id === id)!.language))) {
      await language.selectOption(code);
      const matching = editions.filter(edition => edition.language === code);
      await expect(results.getByRole('article')).toHaveCount(matching.length);
      expect((await results.getByRole('heading', { level: 2 }).allTextContents()).sort()).toEqual(matching.map(edition => edition.name).sort());
    }
  });

  for (const [index, ids] of [added.slice(0, 6), added.slice(6)].entries()) {
    test(`six imported editions retain the exact selected source range — group ${index + 1}`, async ({ page }) => {
      test.setTimeout(90_000);
      for (const id of ids) {
        await test.step(id, async () => {
          await page.goto(route('editions', 'eng-web', 3, 16, 18));
          await page.getByRole('textbox', { name: 'Find an edition', exact: true }).fill(id);
          const results = page.getByRole('region', { name: 'Installed Bible editions', exact: true });
          await expect(results.getByRole('article')).toHaveCount(1);
          await results.getByRole('button', { name: 'Read edition', exact: true }).click();
          await expect(page).toHaveURL(new RegExp(`#/read/JHN/3\\?verse=16&end=18&edition=${id}$`));
          const metadata = editions.find(edition => edition.id === id)!;
          await expect(page.locator('.reader-title .eyebrow')).toHaveText(metadata.name);
          await expect(page.locator('.scripture')).toHaveAttribute('lang', metadata.language);
          await expect(page.getByText(`Gen Z study paraphrase awaits editorial approval. You are reading the unchanged source wording in ${metadata.name}.`, { exact: true })).toBeVisible();
          for (const number of [16, 17, 18]) {
            await exactVerse(page, number, sourceVerse(id, 3, number));
            await expect(page.locator(`#verse-${number}`)).toHaveClass(/\bselected\b/);
          }
          await expect(page.locator('#verse-15')).not.toHaveClass(/\bselected\b/);
          await expect(page.locator('#verse-19')).not.toHaveClass(/\bselected\b/);
        });
      }
    });
  }

  test('Arabic and Myanmar source searches return their exact pinned verse and edition', async ({ page }) => {
    test.setTimeout(90_000);
    for (const id of ['arb-vandyck', 'mya-judson1840']) {
      const text = sourceVerse(id);
      await page.goto(route('read', id));
      await exactVerse(page, 16, text);
      // Search the complete supplied verse, retaining diacritics, spacing and Myanmar clusters.
      await page.locator('.global-search input').fill(text);
      await page.locator('.global-search input').press('Enter');
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      const result = dialog.locator('.search-results > button').filter({ hasText: text });
      await expect(result).toHaveCount(1, { timeout: 30_000 });
      expect(await result.locator('p').textContent()).toBe(text);
      await expect(result.locator('small')).toContainText(editions.find(edition => edition.id === id)!.name);
      await result.click();
      await expect(page).toHaveURL(new RegExp(`#/read/JHN/3\\?verse=16&edition=${id}$`));
      await exactVerse(page, 16, text);
    }
  });
});

test.describe('new source current-book offline lifecycle', () => {
  test.use({ serviceWorkers: 'allow' });

  test('Myanmar book survives an offline document reload and its removal leaves a real unavailable passage', async ({ page, context }) => {
    test.setTimeout(90_000);
    const id = 'mya-judson1840';
    await page.goto(route('read', id));
    await exactVerse(page, 16, sourceVerse(id));
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, { timeout: 30_000 });
    await page.goto(route('settings', id));
    await page.getByRole('button', { name: 'Download current book', exact: true }).click();
    await expect(page.getByText(`${sourceBooks.get(id)!.name} is available offline.`, { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Download current book', exact: true })).toBeEnabled();
    expect((await cachedJohnFiles(page, id)).length).toBeGreaterThan(0);
    await context.setOffline(true);
    try {
      await expect.poll(() => page.evaluate(() => navigator.onLine), { message: 'Offline emulation must reach the active document before navigation.' }).toBe(false);
      await page.goto(route('read', id));
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect.poll(() => page.evaluate(() => navigator.onLine), { message: 'The reloaded service-worker document must retain offline network state.' }).toBe(false);
      expect(await page.evaluate(async () => {
        // Query requests bypass this app's service worker and HTTP cache.
        try { await fetch(new URL(`build-info.json?offline-probe=${Date.now()}`, location.href), { cache: 'no-store' }); return false; }
        catch { return true; }
      }), 'An uncached origin request must fail while the cached chapter remains readable.').toBe(true);
      await expect(page.locator('.offline-banner')).toBeVisible();
      await exactVerse(page, 16, sourceVerse(id));
      await page.getByRole('button', { name: 'Next chapter', exact: true }).first().click();
      await expect(page).toHaveURL(new RegExp(`#/read/JHN/4\\?verse=1&edition=${id}$`));
      await exactVerse(page, 1, sourceVerse(id, 4, 1));
      await page.goto(route('settings', id, 4, 1));
      page.once('dialog', dialog => dialog.accept());
      await page.getByRole('button', { name: 'Remove downloaded books', exact: true }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Bible downloads removed. Personal study data was preserved.' })).toBeVisible();
      expect(await cachedJohnFiles(page, id)).toEqual([]);
      await page.goto(route('read', id, 4, 1));
      // A new document also clears the in-memory book cache, making removal observable.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: 'Unable to load this passage', exact: true })).toBeVisible();
      await expect(page.getByText("This chapter isn't cached yet. Reconnect to load it.", { exact: true })).toBeVisible();
      await expect(page.locator('#verse-1')).toHaveCount(0);
    } finally {
      await context.setOffline(false);
    }
  });
});

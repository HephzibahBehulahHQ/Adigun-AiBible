import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

interface SourceBook {
  id: string;
  name: string;
  chapters: { number: number; verses: { number: number; text: string }[] }[];
}

interface SourceManifest {
  edition: { id: string; name: string; language: string };
}

const readSource = <T>(path: string): T =>
  JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')) as T;

const englishJohn = readSource<SourceBook>('data/books/JHN.json');
const englishGenesis = readSource<SourceBook>('data/books/GEN.json');

function sourceVerse(book: SourceBook, chapter: number, verse: number): string {
  const text = book.chapters.find((item) => item.number === chapter)?.verses.find((item) => item.number === verse)?.text;
  if (!text) throw new Error(`Missing source verse ${book.id} ${chapter}:${verse}`);
  return text;
}

function route(view = 'read', book = 'JHN', chapter = 3, verse = 16, edition = 'eng-web'): string {
  return `#/${view}/${book}/${chapter}?verse=${verse}&edition=${edition}`;
}

async function openEnglishReader(page: Page, book = 'JHN', chapter = 3, verse = 16): Promise<void> {
  await page.goto(route('read', book, chapter, verse));
  await expect(page.locator(`#verse-${verse} > p`)).toBeVisible();
  await page.getByLabel('Reading preset', { exact: true }).selectOption('en');
  await expect(page.locator('.scripture')).toHaveAttribute('lang', 'en');
}

test('direct passage links survive refresh and chapter navigation', async ({ page }) => {
  await openEnglishReader(page);
  await expect(page.locator('#verse-16 > p')).toHaveText(sourceVerse(englishJohn, 3, 16));
  await expect(page.locator('#verse-16')).toHaveClass(/selected/);
  await page.reload();
  await expect(page.locator('.reader-title h1')).toHaveText(`${englishJohn.name} 3`);
  await expect(page.locator('#verse-16 > p')).toHaveText(sourceVerse(englishJohn, 3, 16));
  await expect(page.locator('#verse-16')).toHaveClass(/selected/);
  await page.getByRole('button', { name: 'Next chapter', exact: true }).first().click();
  await expect(page.locator('.reader-title h1')).toHaveText(`${englishJohn.name} 4`);
  await expect(page.locator('#verse-1 > p')).toHaveText(sourceVerse(englishJohn, 4, 1));
  await page.getByRole('button', { name: 'Previous chapter', exact: true }).first().click();
  await expect(page.locator('.reader-title h1')).toHaveText(`${englishJohn.name} 3`);
  await expect(page.locator('#verse-1 > p')).toHaveText(sourceVerse(englishJohn, 3, 1));
});

test('skip link focuses main without changing the selected passage', async ({ page }) => {
  await openEnglishReader(page);
  const passageUrl = page.url();
  await page.locator('.skip-link').focus();
  await page.locator('.skip-link').press('Enter');
  await expect(page.locator('#main')).toBeFocused();
  await expect(page).toHaveURL(passageUrl);
  await expect(page.locator('#verse-16')).toHaveClass(/selected/);
  await expect(page.locator('#verse-16 > p')).toHaveText(sourceVerse(englishJohn, 3, 16));
});

test('a bookmark and personal note persist after reload', async ({ page }) => {
  await openEnglishReader(page);
  await expect(page.getByRole('button', { name: 'Bookmark verse 16', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Bookmark verse 16', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove bookmark 16', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Write a note 16', exact: true }).click();
  const note = 'Browser regression: retain my personal study note after reloading.';
  await expect(page.locator('#verse-note')).toBeFocused();
  await page.locator('#verse-note').fill(note);
  await expect(page.locator('.save-status')).toHaveText('Saved on this device');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Remove bookmark 16', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Write a note 16', exact: true }).click();
  await expect(page.locator('#verse-note')).toHaveValue(note);
});

for (const edition of [
  { preset: 'en', id: 'eng-web', path: 'data' },
  { preset: 'de', id: 'deu1912', path: 'data/editions/deu1912' },
  { preset: 'yo', id: 'yor', path: 'data/editions/yor' },
]) {
  test(`${edition.preset} reading preset shows its identified source edition and exact text`, async ({ page }) => {
    const manifest = readSource<SourceManifest>(`${edition.path}/manifest.json`);
    const book = readSource<SourceBook>(`${edition.path}/books/GEN.json`);
    await openEnglishReader(page, 'GEN', 1, 1);
    await page.getByLabel('Reading preset', { exact: true }).selectOption(edition.preset);
    await expect(page).toHaveURL(new RegExp(`edition=${edition.id}(?:&|$)`));
    await expect(page.locator('.reader-title .eyebrow')).toHaveText(manifest.edition.name);
    await expect(page.locator('.scripture')).toHaveAttribute('lang', manifest.edition.language);
    await expect(page.locator('#verse-1 > p')).toHaveText(sourceVerse(book, 1, 1));
    await page.reload();
    await expect(page.locator('.reader-title .eyebrow')).toHaveText(manifest.edition.name);
    await expect(page.locator('#verse-1 > p')).toHaveText(sourceVerse(book, 1, 1));
  });
}

test('changing interface language preserves passage and source edition', async ({ page }) => {
  await openEnglishReader(page);
  const passageUrl = page.url();
  const editionName = await page.locator('.reader-title .eyebrow').innerText();
  for (const locale of ['de', 'yo', 'en']) {
    await page.locator('.locale-control select').selectOption(locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page).toHaveURL(passageUrl);
    await expect(page.locator('.reader-title .eyebrow')).toHaveText(editionName);
    await expect(page.locator('#verse-16')).toHaveClass(/selected/);
    await expect(page.locator('#verse-16 > p')).toHaveText(sourceVerse(englishJohn, 3, 16));
  }
});

test('an invalid chapter recovers through the first-chapter action', async ({ page }) => {
  await openEnglishReader(page, 'GEN', 1, 1);
  await page.goto(route('read', 'GEN', 999, 1));
  await expect(page.getByRole('heading', { name: 'Unable to load this passage', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open first chapter', exact: true }).click();
  await expect(page.locator('.reader-title h1')).toHaveText(`${englishGenesis.name} 1`);
  await expect(page.locator('#verse-1 > p')).toHaveText(sourceVerse(englishGenesis, 1, 1));
  await expect(page).toHaveURL(/#\/read\/GEN\/1\?verse=1&edition=eng-web$/);
});

test('verified current-book download supports offline refresh and another chapter', async ({ page, context }) => {
  test.setTimeout(90_000);
  await openEnglishReader(page, 'GEN', 1, 1);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, { timeout: 30_000 });
  await page.goto(route('settings', 'GEN', 1, 1));
  await page.getByRole('button', { name: 'Download current book', exact: true }).click();
  await expect(page.getByText(`${englishGenesis.name} is available offline.`, { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Download current book', exact: true })).toBeEnabled();
  await context.setOffline(true);
  try {
    await page.goto(route('read', 'GEN', 1, 1));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#verse-1 > p')).toHaveText(sourceVerse(englishGenesis, 1, 1));
    await page.getByRole('button', { name: 'Next chapter', exact: true }).first().click();
    await expect(page.locator('.reader-title h1')).toHaveText(`${englishGenesis.name} 2`);
    await expect(page.locator('#verse-1 > p')).toHaveText(sourceVerse(englishGenesis, 2, 1));
  } finally {
    await context.setOffline(false);
  }
});

test('reader and core views fit desktop and narrow mobile widths', async ({ page }, testInfo) => {
  await openEnglishReader(page);
  const widths = testInfo.project.name.includes('mobile') ? [390, 320] : [1440];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    for (const view of ['read', 'compare', 'home', 'library', 'sources', 'settings', 'share']) {
      await page.goto(route(view));
      await expect(page.locator('#main')).toBeVisible();
      if (view === 'read') await expect(page.locator('#verse-16 > p')).toBeVisible();
      if (view === 'share') await expect(page.getByRole('button', { name: 'Download PNG', exact: true })).toBeEnabled();
      await expect.poll(
        () => page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth),
        { message: `${view} must fit a ${width}px viewport` },
      ).toBeLessThanOrEqual(1);
    }
  }
});

test('share downloads a real 1080px square PNG', async ({ page }) => {
  await openEnglishReader(page);
  await page.goto(route('share'));
  await page.getByLabel('Canvas size', { exact: true }).selectOption('square');
  const button = page.getByRole('button', { name: 'Download PNG', exact: true });
  await expect(button).toBeEnabled();
  const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
  expect(await download.failure()).toBeNull();
  expect(download.suggestedFilename()).toMatch(/\.png$/i);
  const file = await download.path();
  expect(file).not.toBeNull();
  const png = readFileSync(file!);
  expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR');
  expect(png.readUInt32BE(16)).toBe(1080);
  expect(png.readUInt32BE(20)).toBe(1080);
  expect(png.length).toBeGreaterThan(5000);
  await expect(page.getByText('PNG exported with its source attribution.', { exact: true })).toBeVisible();
});


test('legacy WEB bookmarks keep their edition and remove correctly while German is active', async ({page})=>{
  await openEnglishReader(page,'GEN',1,1);
  await expect(page.getByRole('button',{name:'Bookmark verse 1',exact:true})).toBeEnabled();
  const legacy={schemaVersion:1,bookmarks:[{bookId:'GEN',chapter:1,verse:1}],highlights:[],notes:[],completedSessions:[],journal:[],readingDays:[]};
  await page.getByLabel('Import study backup', { exact: true }).setInputFiles({name:'legacy-study.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))});
  await page.getByRole('button',{name:'Merge backup',exact:true}).click();
  await expect(page.getByText('Backup merged and saved on this device.',{exact:true})).toBeVisible();
  await page.getByLabel('Reading preset',{exact:true}).selectOption('de');
  await page.goto(route('saved','GEN',1,1,'deu1912'));
  await expect(page.locator('.saved-card .passage-preview p')).toHaveText(sourceVerse(englishGenesis,1,1));
  await expect(page.locator('.saved-card .passage-preview small')).toContainText('World English Bible');
  await page.locator('.saved-card .passage-preview').click();
  await expect(page).toHaveURL(/edition=eng-web$/);
  await page.goto(route('saved','GEN',1,1,'deu1912'));
  await page.locator('.saved-card > button.text-button').click();
  await expect(page.locator('.saved-card')).toHaveCount(0);
  await expect(page.locator('.page-heading [role=status]')).toHaveText('Saved on this device');
  await page.reload();
  await expect(page.locator('.saved-card')).toHaveCount(0);
});


test('independent Quran reader navigates the final surah with exact attributed source wording',async({page})=>{
  const quran=readSource<{surahs:{number:number;verses:{number:number;text:string}[]}[]}>('data/editions/eng-clearquran/quran.json');
  const final=quran.surahs.find(s=>s.number===114)!.verses.find(v=>v.number===6)!;
  await openEnglishReader(page);
  await page.goto(route('library'));
  await page.getByRole('button',{name:'Open English Quran reader',exact:true}).click();
  await page.getByLabel('Quran surah',{exact:true}).selectOption('114');
  await page.getByLabel('Quran verse',{exact:true}).selectOption('6');
  await expect(page.locator('.quran-reader .quran-verses .selected')).toContainText(final.text);
  await expect(page.getByRole('button',{name:'Next Quran verse',exact:true})).toBeDisabled();
  await expect(page.locator('.quran-reader')).toContainText('Talal Itani');
  await page.getByRole('button',{name:'Previous Quran verse',exact:true}).click();
  await expect(page.getByLabel('Quran verse',{exact:true})).toHaveValue('5');
});

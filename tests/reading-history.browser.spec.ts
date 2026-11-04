import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import type { ReadingSessionState } from '../src/reading-session/model';

type EditionId = 'eng-web' | 'eng-bsb';
type Passage = { editionId: EditionId; verse: number; endVerse?: number };
type Backup = { kind: string; version: number; session: ReadingSessionState };
type BookFixture = { name: string; chapters: { number: number; verses: { number: number; text: string }[] }[] };

function fixture(editionId: EditionId) {
  const directory = editionId === 'eng-web' ? 'data' : `data/editions/${editionId}`;
  const book: BookFixture = JSON.parse(readFileSync(new URL(`../${directory}/books/JHN.json`, import.meta.url), 'utf8'));
  const manifest = JSON.parse(readFileSync(new URL(`../${directory}/manifest.json`, import.meta.url), 'utf8'));
  return { verses: book.chapters.find(chapter => chapter.number === 3)!.verses, editionName: manifest.edition.name as string, sha256: manifest.edition.sha256 as string };
}

const sources = { 'eng-web': fixture('eng-web'), 'eng-bsb': fixture('eng-bsb') };
const single: Passage = { editionId: 'eng-web', verse: 16 };
const webRange: Passage = { editionId: 'eng-web', verse: 16, endVerse: 17 };
const bereanRange: Passage = { editionId: 'eng-bsb', verse: 18, endVerse: 19 };
const panel = (page: Page) => page.getByRole('region', { name: 'Reading session', exact: true });
const tab = (page: Page, name: string) => panel(page).getByRole('button', { name: `Open study tab ${name}`, exact: true });
const route = (passage: Passage) => `#/read/JHN/3?verse=${passage.verse}${passage.endVerse ? `&end=${passage.endVerse}` : ''}&edition=${passage.editionId}`;

// Request failures below must reach the app, rather than a service worker's cached book.
test.use({ serviceWorkers: 'block' });

async function expectPassage(page: Page, passage: Passage) {
  await expect(page).toHaveURL(url => {
    const [path, query] = url.hash.split('?');
    const params = new URLSearchParams(query);
    return path === '#/read/JHN/3' && params.get('edition') === passage.editionId
      && Number(params.get('verse')) === passage.verse
      && Number(params.get('end') || params.get('verse')) === (passage.endVerse ?? passage.verse);
  });
  for (let number = passage.verse; number <= (passage.endVerse ?? passage.verse); number++) {
    const wording = sources[passage.editionId].verses.find(verse => verse.number === number)!.text;
    await expect.poll(async () => (await page.locator(`#verse-${number} [data-source-run]`).allTextContents()).join('')).toBe(wording);
  }
}

async function expand(details: Locator) {
  if (await details.getAttribute('open') === null) await details.locator(':scope > summary').click();
}

async function openPanel(page: Page, passage: Passage) {
  // The reader's source must be ready before interacting with the initially collapsed panel.
  await expectPassage(page, passage);
  const outer = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^History and study tabs$/ }) });
  await expand(outer);
  await expect(panel(page)).toBeVisible();
  await expect(panel(page)).toHaveAttribute('aria-busy', 'false');
  await expect(panel(page).getByRole('button', { name: 'Add study tab', exact: true })).toBeEnabled();
}

async function openReader(page: Page, passage: Passage) {
  await page.goto(route(passage));
  await openPanel(page, passage);
}

async function openHistory(page: Page) {
  await expand(panel(page).locator('details').filter({ has: page.locator('summary').filter({ hasText: /^History and tab names/ }) }));
}

async function openBackup(page: Page) {
  await expand(panel(page).locator('details').filter({ has: page.locator('summary').filter({ hasText: /^Reading session backup and clear$/ }) }));
}

async function renameTab(page: Page, name: string) {
  await openHistory(page);
  await panel(page).getByLabel('Study tab name', { exact: true }).fill(name);
  await panel(page).getByRole('button', { name: 'Rename study tab', exact: true }).click();
  await expect(tab(page, name)).toHaveAttribute('aria-pressed', 'true');
  await expect(panel(page).getByRole('status')).toHaveText('Study tab renamed.');
  await expect(panel(page)).toHaveAttribute('aria-busy', 'false');
}

async function exportBackup(page: Page): Promise<{ backup: Backup; buffer: Buffer }> {
  await openBackup(page);
  const downloaded = page.waitForEvent('download');
  await panel(page).getByRole('button', { name: 'Export reading session', exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe('adigun-reading-session.json');
  const path = await download.path();
  expect(path).not.toBeNull();
  const buffer = readFileSync(path!);
  const backup: Backup = JSON.parse(buffer.toString('utf8'));
  expect(backup.kind).toBe('adigun-reading-session');
  expect(backup.version).toBe(1);
  return { backup, buffer };
}

test('passage history traverses previous and next without creating duplicate visits', async ({ page }) => {
  await openReader(page, single);
  await openHistory(page);
  const history = panel(page).locator('.reading-session-history > li');
  await expect(history).toHaveCount(1);
  await expect(panel(page).getByRole('button', { name: 'Previous passage', exact: true })).toBeDisabled();
  await expect(panel(page).getByRole('button', { name: 'Next passage', exact: true })).toBeDisabled();

  for (const verse of [17, 18]) {
    await page.getByRole('button', { name: `Select verse ${verse}`, exact: true }).click();
    await expectPassage(page, { ...single, verse });
    await expect(history).toHaveCount(verse - 15);
  }
  await expect(history.locator('button')).toHaveText([18, 17, 16].map(verse => `John 3:${verse} · ${sources['eng-web'].editionName}`));
  for (const verse of [17, 16]) {
    await panel(page).getByRole('button', { name: 'Previous passage', exact: true }).click();
    await expectPassage(page, { ...single, verse });
    await expect(history.locator('button[aria-current="location"]')).toHaveText(`John 3:${verse} · ${sources['eng-web'].editionName}`);
    await expect(history).toHaveCount(3);
  }
  await expect(panel(page).getByRole('button', { name: 'Previous passage', exact: true })).toBeDisabled();
  await panel(page).getByRole('button', { name: 'Next passage', exact: true }).click();
  await expectPassage(page, { ...single, verse: 17 });
  await history.getByRole('button', { name: `John 3:18 · ${sources['eng-web'].editionName}`, exact: true }).click();
  await expectPassage(page, { ...single, verse: 18 });
  await expect(panel(page).getByRole('button', { name: 'Next passage', exact: true })).toBeDisabled();

  await page.reload();
  await openPanel(page, { ...single, verse: 18 });
  await openHistory(page);
  await expect(history).toHaveCount(3);
  const { backup } = await exportBackup(page);
  expect(backup.session.history.map(visit => visit.passage.reference.verse)).toEqual([16, 17, 18]);
  expect(backup.session.historyIndex).toBe(2);
});

test('two study tabs retain editions and exact ranges through rename, reload and backup restore at 320px', async ({ page }, testInfo) => {
  const webName = 'WEB promise and context — John 3:16–17';
  const bereanName = 'Berean comparison — John 3:18–19 and surrounding context';
  await openReader(page, webRange);
  await renameTab(page, webName);
  await panel(page).getByRole('button', { name: 'Add study tab', exact: true }).click();
  await expect(panel(page).getByRole('list', { name: 'Study tabs', exact: true }).locator('li')).toHaveCount(2);
  await expect(panel(page)).toHaveAttribute('aria-busy', 'false');
  await openReader(page, bereanRange);
  await renameTab(page, bereanName);
  await expect(tab(page, webName)).toContainText(`John 3:16–17 · ${sources['eng-web'].editionName}`);
  await expect(tab(page, bereanName)).toContainText(`John 3:18–19 · ${sources['eng-bsb'].editionName}`);

  await tab(page, webName).click();
  await openPanel(page, webRange);
  await expect(tab(page, webName)).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await openPanel(page, webRange);
  await expect(tab(page, webName)).toHaveAttribute('aria-pressed', 'true');
  await expect(tab(page, bereanName)).toContainText(sources['eng-bsb'].editionName);
  await tab(page, bereanName).click();
  await openPanel(page, bereanRange);
  await expect(tab(page, bereanName)).toHaveAttribute('aria-pressed', 'true');

  const before = await exportBackup(page);
  expect(before.backup.session.tabs.map(saved => saved.passage.reference)).toEqual([
    { bookId: 'JHN', chapter: 3, verse: 16, endVerse: 17, editionId: 'eng-web' },
    { bookId: 'JHN', chapter: 3, verse: 18, endVerse: 19, editionId: 'eng-bsb' },
  ]);
  expect(before.backup.session.tabs.map(saved => saved.passage.sourceSha256)).toEqual([sources['eng-web'].sha256, sources['eng-bsb'].sha256]);
  await panel(page).getByRole('button', { name: 'Clear reading session', exact: true }).click();
  await expect(panel(page).getByText('No saved study tabs.', { exact: true })).toBeVisible();
  await openHistory(page);
  await expect(panel(page).getByText('No reading history saved.', { exact: true })).toBeVisible();
  const cleared = (await exportBackup(page)).backup.session;
  expect(cleared.tabs).toEqual([]);
  expect(cleared.history).toEqual([]);
  expect(cleared.activeTabId).toBeNull();
  await panel(page).getByLabel('Import reading session', { exact: true }).setInputFiles({ name: 'session.json', mimeType: 'application/json', buffer: before.buffer });
  await expect(panel(page).getByRole('status')).toContainText('Reading session imported.');
  expect((await exportBackup(page)).backup).toEqual(before.backup);
  await page.reload();
  await openPanel(page, bereanRange);
  expect((await exportBackup(page)).backup).toEqual(before.backup);

  await page.setViewportSize({ width: 320, height: 844 });
  await openHistory(page);
  await expect(tab(page, webName)).toBeVisible();
  await expect(tab(page, bereanName)).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
  await page.locator('.reader-session-panel').screenshot({ path: testInfo.outputPath('reading-history-and-tabs-320.png') });
});

test('invalid, stale-revision and unavailable-source imports preserve the complete saved session', async ({ page }) => {
  await openReader(page, webRange);
  const name = 'Keep this saved session';
  await renameTab(page, name);
  const before = await exportBackup(page);
  const stale = structuredClone(before.backup);
  stale.session.tabs[0].passage.sourceSha256 = '0'.repeat(64);
  const unavailable = structuredClone(before.backup);
  unavailable.session.tabs[0].passage.reference = { editionId: 'eng-web', bookId: 'GEN', chapter: 22, verse: 1, endVerse: 2 };
  let missingRequests = 0;
  await page.route('**/data/books/GEN.json', async request => {
    missingRequests++;
    await request.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
  });
  const rejected = [
    { name: 'malformed.json', buffer: Buffer.from('{broken'), error: 'Reading session backup is not valid JSON.' },
    { name: 'stale-revision.json', buffer: Buffer.from(JSON.stringify(stale)), error: 'The saved source revision is unavailable.' },
    { name: 'unavailable-source.json', buffer: Buffer.from(JSON.stringify(unavailable)), error: 'This book is not downloaded for the selected edition.' },
  ];
  for (const candidate of rejected) {
    await test.step(candidate.name, async () => {
      await panel(page).getByLabel('Import reading session', { exact: true }).setInputFiles({ name: candidate.name, mimeType: 'application/json', buffer: candidate.buffer });
      await expect(panel(page).getByRole('alert')).toContainText(candidate.error);
      await expect(tab(page, name)).toHaveAttribute('aria-pressed', 'true');
      await expectPassage(page, webRange);
      expect((await exportBackup(page)).backup).toEqual(before.backup);
    });
  }
  expect(missingRequests).toBeGreaterThan(0);
  await page.unroute('**/data/books/GEN.json');
  await page.reload();
  await openPanel(page, webRange);
  await expect(panel(page).getByRole('alert')).toHaveCount(0);
  expect((await exportBackup(page)).backup).toEqual(before.backup);
});

test('a stale browser window cannot overwrite a newer session and can recover by reloading it', async ({ page, context }) => {
  await openReader(page, single);
  await renameTab(page, 'Shared starting tab');
  const other = await context.newPage();
  try {
    await openReader(other, single);
    await openHistory(other);
    await expect(tab(other, 'Shared starting tab')).toHaveAttribute('aria-pressed', 'true');
    await renameTab(page, 'Saved in first window');
    await panel(other).getByLabel('Study tab name', { exact: true }).fill('Rejected stale rename');
    await panel(other).getByRole('button', { name: 'Rename study tab', exact: true }).click();
    await expect(panel(other).getByRole('alert')).toContainText('Another window saved newer reading sessions.');
    await expect(panel(other).getByRole('button', { name: 'Add study tab', exact: true })).toBeDisabled();

    await page.reload();
    await openPanel(page, single);
    await expect(tab(page, 'Saved in first window')).toHaveAttribute('aria-pressed', 'true');
    await expect(tab(page, 'Rejected stale rename')).toHaveCount(0);
    await panel(other).getByRole('button', { name: 'Reload saved sessions', exact: true }).click();
    await expect(panel(other).getByRole('alert')).toHaveCount(0);
    await expect(tab(other, 'Saved in first window')).toHaveAttribute('aria-pressed', 'true');
    await expect(panel(other).getByRole('button', { name: 'Add study tab', exact: true })).toBeEnabled();
    await renameTab(other, 'Recovered second window');
    await page.reload();
    await openPanel(page, single);
    await expect(tab(page, 'Recovered second window')).toHaveAttribute('aria-pressed', 'true');
    const { backup } = await exportBackup(page);
    expect(backup.session.tabs).toHaveLength(1);
    expect(backup.session.history).toHaveLength(1);
    expect(backup.session.tabs[0].name).toBe('Recovered second window');
  } finally {
    await other.close();
  }
});

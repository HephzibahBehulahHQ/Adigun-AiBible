import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import type { ReadingSessionState, SavedPassage } from '../src/reading-session/model';

const databaseName = 'adigun-aibible-reading-session';
const manifest = JSON.parse(readFileSync(new URL('../data/manifest.json', import.meta.url), 'utf8'));
const book = JSON.parse(readFileSync(new URL('../data/books/JHN.json', import.meta.url), 'utf8'));
const wording: string = book.chapters.find((chapter: { number: number }) => chapter.number === 3).verses.find((verse: { number: number }) => verse.number === 16).text;
const passage: SavedPassage = {
  reference: { editionId: 'eng-web', bookId: 'JHN', chapter: 3, verse: 16, endVerse: 16 },
  sourceSha256: manifest.edition.sha256, editionName: manifest.edition.name, bookName: book.name,
};
const healthy: ReadingSessionState = {
  schemaVersion: 1, revision: 7,
  history: [{ id: 'recovered-visit', passage, visitedAt: '2026-11-04T13:00:00.000Z' }],
  historyIndex: 0, tabs: [{ id: 'recovered-tab', name: 'Recovered study', passage }], activeTabId: 'recovered-tab',
};
const damaged = {
  schemaVersion: 99, revision: 6, history: 'unreadable history',
  tabs: [{ id: 'older-tab', preservedText: 'Àlàáfíà — preserve this original fragment 🌿', nested: { version: 'unknown', values: [1, null, true] } }],
};
const panel = (page: Page) => page.getByRole('region', { name: 'Reading session', exact: true });

test.use({ serviceWorkers: 'block' });

async function writeRawSession(page: Page, raw: unknown) {
  await page.evaluate(({ name, raw }) => new Promise<void>((resolve, reject) => {
    const opening = indexedDB.open(name, 1);
    opening.onupgradeneeded = () => opening.result.createObjectStore('sessions');
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      const tx = db.transaction('sessions', 'readwrite');
      tx.objectStore('sessions').put(raw, 'private');
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => { db.close(); reject(tx.error || new Error('Session seed did not commit.')); };
    };
  }), { name: databaseName, raw });
}

async function readRawSession(page: Page): Promise<unknown> {
  return page.evaluate(name => new Promise<unknown>((resolve, reject) => {
    const opening = indexedDB.open(name, 1);
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      const tx = db.transaction('sessions', 'readonly');
      const read = tx.objectStore('sessions').get('private');
      tx.oncomplete = () => { db.close(); resolve(read.result); };
      tx.onabort = () => { db.close(); reject(tx.error || new Error('Session could not be read.')); };
    };
  }), databaseName);
}

async function expand(details: Locator) {
  if (await details.getAttribute('open') === null) await details.locator(':scope > summary').click();
}

async function openPanel(page: Page) {
  await expect.poll(async () => (await page.locator('#verse-16 [data-source-run]').allTextContents()).join('')).toBe(wording);
  await expand(page.locator('.reader-session-panel'));
  await expect(panel(page)).toBeVisible();
  await expect(panel(page)).toHaveAttribute('aria-busy', 'false');
}

async function openDamagedSession(page: Page) {
  await page.goto('#/home/JHN/3?verse=16&edition=eng-web');
  await expect(page.locator('.home-page')).toBeVisible();
  await expect(panel(page)).toHaveCount(0);
  await writeRawSession(page, damaged);
  await page.evaluate(() => { location.hash = '#/read/JHN/3?verse=16&edition=eng-web'; });
  await openPanel(page);
  await expect(panel(page).getByRole('alert')).toContainText('The saved reading session is damaged.');
  await expand(panel(page).locator('details').filter({ has: page.locator('summary').filter({ hasText: /^Reading session backup and clear$/ }) }));
  await expect(panel(page).getByLabel('Import reading session', { exact: true })).toBeDisabled();
  await expect(panel(page).getByRole('button', { name: 'Clear reading session', exact: true })).toBeDisabled();
  await expect(panel(page).getByRole('button', { name: 'Add study tab', exact: true })).toBeDisabled();
  expect(await readRawSession(page)).toEqual(damaged);
}

test('a damaged session stays untouched until explicit reset, can be downloaded intact, and accepts a valid restore', async ({ page }) => {
  await openDamagedSession(page);
  const downloaded = page.waitForEvent('download');
  await panel(page).getByRole('button', { name: 'Download damaged session', exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe('adigun-damaged-reading-session.json');
  const path = await download.path();
  expect(path).not.toBeNull();
  expect(JSON.parse(readFileSync(path!, 'utf8'))).toEqual({ kind: 'adigun-damaged-reading-session', version: 1, raw: damaged });
  expect(await readRawSession(page)).toEqual(damaged);

  await panel(page).getByRole('button', { name: 'Reset damaged reading session', exact: true }).click();
  await expect(panel(page).getByRole('status')).toContainText('Damaged reading session reset on this device.');
  await expect(panel(page).getByRole('alert')).toHaveCount(0);
  await expect(panel(page).getByText('No saved study tabs.', { exact: true })).toBeVisible();
  await expect(panel(page).getByLabel('Import reading session', { exact: true })).toBeEnabled();
  const reset = await readRawSession(page) as ReadingSessionState;
  expect(reset.history).toEqual([]);
  expect(reset.tabs).toEqual([]);
  expect(reset.historyIndex).toBe(-1);
  expect(reset.activeTabId).toBeNull();

  const backup = { kind: 'adigun-reading-session', version: 1, session: { ...healthy, revision: 0 } };
  await panel(page).getByLabel('Import reading session', { exact: true }).setInputFiles({ name: 'recovered-session.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(panel(page).getByRole('status')).toContainText('Reading session imported.');
  await expect(panel(page).getByRole('button', { name: 'Open study tab Recovered study', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const restored = await readRawSession(page) as ReadingSessionState;
  expect({ ...restored, revision: 0 }).toEqual(backup.session);
  expect(restored.revision).toBeGreaterThan(reset.revision);
  await page.reload();
  await openPanel(page);
  await expect(panel(page).getByRole('button', { name: 'Add study tab', exact: true })).toBeEnabled();
  await expect(panel(page).getByRole('button', { name: 'Open study tab Recovered study', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await readRawSession(page)).toEqual(restored);
});

test('reset refuses to overwrite a healthy session repaired in another window and reload recovers the winner', async ({ page, context }) => {
  await openDamagedSession(page);
  const other = await context.newPage();
  try {
    await other.goto('#/home/JHN/3?verse=16&edition=eng-web');
    await expect(other.locator('.home-page')).toBeVisible();
    await writeRawSession(other, healthy);
    expect(await readRawSession(page)).toEqual(healthy);
    await panel(page).getByRole('button', { name: 'Reset damaged reading session', exact: true }).click();
    await expect(panel(page).getByRole('alert')).toContainText('Another window repaired this session.');
    await expect(panel(page).getByLabel('Import reading session', { exact: true })).toBeDisabled();
    expect(await readRawSession(page)).toEqual(healthy);

    await panel(page).getByRole('button', { name: 'Reload saved sessions', exact: true }).click();
    await expect(panel(page).getByRole('alert')).toHaveCount(0);
    await expect(panel(page).getByRole('button', { name: 'Open study tab Recovered study', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(panel(page).getByRole('button', { name: 'Add study tab', exact: true })).toBeEnabled();
    await expect(panel(page).getByLabel('Import reading session', { exact: true })).toBeEnabled();
    await expect(panel(page).getByRole('button', { name: 'Reset damaged reading session', exact: true })).toHaveCount(0);
    expect(await readRawSession(page)).toEqual(healthy);
  } finally {
    await other.close();
  }
});

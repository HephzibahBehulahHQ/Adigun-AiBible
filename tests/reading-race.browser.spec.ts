import { readFileSync } from 'node:fs';
import { expect, test, type Page, type Route } from '@playwright/test';
import type { ReadingSessionState, SavedPassage } from '../src/reading-session/model';

type BookFixture = { name: string; chapters: { number: number; verses: { number: number; text: string }[] }[] };
type RaceProbe = { documentId: string; readingWrites: number; genesisBodiesConsumed: number };
declare global { interface Window { readingRaceProbe: RaceProbe } }

const databaseName = 'adigun-aibible-reading-session';
const editionId = 'eng-bsb';
const genesisRequest = '**/data/editions/eng-bsb/books/GEN.json';
const manifest = JSON.parse(readFileSync(new URL('../data/editions/eng-bsb/manifest.json', import.meta.url), 'utf8'));
const fixture = (book: string): BookFixture => JSON.parse(readFileSync(new URL(`../data/editions/eng-bsb/books/${book}.json`, import.meta.url), 'utf8'));
const books = { JHN: fixture('JHN'), GEN: fixture('GEN'), PSA: fixture('PSA') };
const passage = (bookId: keyof typeof books, chapter: number, verse: number): SavedPassage => ({
  reference: { editionId, bookId, chapter, verse, endVerse: verse },
  sourceSha256: manifest.edition.sha256,
  editionName: manifest.edition.name,
  bookName: books[bookId].name,
});
const john = passage('JHN', 3, 16), genesis = passage('GEN', 22, 1), psalm = passage('PSA', 6, 1);
const currentTabId = 'race-current-tab', genesisTabId = 'race-genesis-tab';
const seed: ReadingSessionState = {
  schemaVersion: 1, revision: 7,
  history: [{ id: 'race-john-visit', passage: john, visitedAt: '2026-11-04T12:00:00.000Z' }],
  historyIndex: 0,
  tabs: [
    { id: currentTabId, name: 'Current reading', passage: john },
    { id: genesisTabId, name: 'Delayed Genesis', passage: genesis },
  ],
  activeTabId: currentTabId,
};

// The request gate must reach fetch; a service worker must not supply a cached book.
test.use({ serviceWorkers: 'block' });

async function readSavedSession(page: Page): Promise<ReadingSessionState> {
  return page.evaluate(name => new Promise<ReadingSessionState>((resolve, reject) => {
    const opening = indexedDB.open(name, 1);
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      const tx = db.transaction('sessions', 'readonly');
      const request = tx.objectStore('sessions').get('private');
      // A completed readonly transaction also waits for earlier writes on this store.
      tx.oncomplete = () => { db.close(); resolve(request.result); };
      tx.onabort = () => { db.close(); reject(tx.error || new Error('Reading session could not be read.')); };
    };
  }), databaseName);
}

async function expectPassage(page: Page, saved: SavedPassage) {
  const ref = saved.reference;
  await expect(page).toHaveURL(url => {
    const [path, query] = url.hash.split('?');
    const parameters = new URLSearchParams(query);
    return path === `#/read/${ref.bookId}/${ref.chapter}` && parameters.get('edition') === ref.editionId
      && Number(parameters.get('verse')) === ref.verse
      && Number(parameters.get('end') || parameters.get('verse')) === ref.endVerse;
  });
  const text = books[ref.bookId as keyof typeof books].chapters.find(chapter => chapter.number === ref.chapter)!.verses.find(verse => verse.number === ref.verse)!.text;
  await expect.poll(async () => (await page.locator(`#verse-${ref.verse} [data-source-run]`).allTextContents()).join('')).toBe(text);
}

async function openSessionPanel(page: Page) {
  const details = page.locator('.reader-session-panel');
  if (await details.getAttribute('open') === null) await details.locator(':scope > summary').click();
  const panel = page.getByRole('region', { name: 'Reading session', exact: true });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Add study tab', exact: true })).toBeEnabled();
  return panel;
}

test('an abandoned study-tab load cannot write or navigate after a different reader session opens', async ({ page }) => {
  await page.addInitScript(() => {
    const probe: RaceProbe = { documentId: crypto.randomUUID(), readingWrites: 0, genesisBodiesConsumed: 0 };
    window.readingRaceProbe = probe;
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (this: IDBDatabase, ...args: Parameters<IDBDatabase['transaction']>) {
      const result = transaction.apply(this, args);
      if (this.name === 'adigun-aibible-reading-session' && result.mode === 'readwrite') probe.readingWrites++;
      return result;
    };
    const json = Response.prototype.json;
    Response.prototype.json = function (this: Response) {
      const result = json.call(this);
      if (!this.url.endsWith('/data/editions/eng-bsb/books/GEN.json')) return result;
      return result.then(value => {
        // Signal in the next task, after the real JSON consumers have drained their
        // promise continuations and either cancelled or entered a storage transaction.
        const channel = new MessageChannel();
        channel.port1.onmessage = () => {
          probe.genesisBodiesConsumed++;
          channel.port1.close(); channel.port2.close();
        };
        channel.port2.postMessage(null);
        return value;
      });
    };
  });

  await page.goto('#/home/JHN/3?verse=16&edition=eng-bsb');
  await expect(page.locator('.home-page')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Reading session', exact: true })).toHaveCount(0);
  await page.evaluate(({ name, session }) => new Promise<void>((resolve, reject) => {
    const opening = indexedDB.open(name, 1);
    opening.onupgradeneeded = () => opening.result.createObjectStore('sessions');
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      const tx = db.transaction('sessions', 'readwrite');
      tx.objectStore('sessions').put(session, 'private');
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => { db.close(); reject(tx.error || new Error('Reading session seed failed.')); };
    };
  }), { name: databaseName, session: seed });
  const documentId = await page.evaluate(() => window.readingRaceProbe.documentId);

  let releaseGenesis!: () => void;
  const responseGate = new Promise<void>(resolve => { releaseGenesis = resolve; });
  let genesisPending!: () => void;
  const requestIsPending = new Promise<void>(resolve => { genesisPending = resolve; });
  let heldRequests = 0;
  const holdGenesis = async (route: Route) => {
    const response = await route.fetch();
    if (!response.ok()) throw new Error(`Real Genesis fixture returned HTTP ${response.status()}.`);
    heldRequests++;
    genesisPending();
    await responseGate;
    await route.fulfill({ response });
  };
  await page.route(genesisRequest, holdGenesis);
  try {
    await page.evaluate(() => { location.hash = '#/read/JHN/3?verse=16&edition=eng-bsb'; });
    await expectPassage(page, john);
    const panel = await openSessionPanel(page);
    expect(await readSavedSession(page)).toEqual(seed);
    expect(await page.evaluate(() => window.readingRaceProbe.genesisBodiesConsumed)).toBe(0);
    await panel.getByRole('button', { name: 'Open study tab Delayed Genesis', exact: true }).click();
    await requestIsPending;
    expect(heldRequests).toBe(1);
    await expect(panel).toHaveAttribute('aria-busy', 'true');
    expect(await readSavedSession(page)).toEqual(seed);

    // A hash change preserves the document and outstanding promise. Home is an
    // explicit unmount boundary even when ordinary chapter loading retains the panel.
    await page.evaluate(() => { location.hash = '#/home/JHN/3?verse=16&edition=eng-bsb'; });
    await expect(page.locator('.home-page')).toBeVisible();
    await expect(panel).toHaveCount(0);
    await page.evaluate(() => { location.hash = '#/read/PSA/6?verse=1&edition=eng-bsb'; });
    await expectPassage(page, psalm);
    const currentPanel = await openSessionPanel(page);
    await expect.poll(async () => {
      const saved = await readSavedSession(page);
      return saved.tabs.find(tab => tab.id === saved.activeTabId)?.passage;
    }).toEqual(psalm);
    const beforeRelease = await readSavedSession(page);
    expect(beforeRelease.activeTabId).toBe(currentTabId);
    expect(beforeRelease.history[beforeRelease.historyIndex].passage).toEqual(psalm);
    expect(beforeRelease.tabs.find(tab => tab.id === genesisTabId)?.passage).toEqual(genesis);
    const writesBeforeRelease = await page.evaluate(() => window.readingRaceProbe.readingWrites);
    const completedResponse = page.waitForResponse(response => response.url().endsWith('/data/editions/eng-bsb/books/GEN.json') && response.status() === 200);
    releaseGenesis();
    await (await completedResponse).finished();
    await expect.poll(() => page.evaluate(() => window.readingRaceProbe.genesisBodiesConsumed)).toBe(1);

    const afterRelease = await readSavedSession(page);
    expect(afterRelease).toEqual(beforeRelease);
    // CAS alone can mask this race by rejecting the old revision. An abandoned
    // operation must cancel before attempting another write, not rely on that clash.
    expect(await page.evaluate(() => window.readingRaceProbe.readingWrites)).toBe(writesBeforeRelease);
    expect(await page.evaluate(() => window.readingRaceProbe.documentId)).toBe(documentId);
    await expectPassage(page, psalm);
    await expect(currentPanel.getByRole('button', { name: 'Open study tab Current reading', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(currentPanel.getByRole('button', { name: 'Open study tab Delayed Genesis', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(currentPanel.getByRole('alert')).toHaveCount(0);
  } finally {
    releaseGenesis();
    await page.unroute(genesisRequest, holdGenesis);
  }
});

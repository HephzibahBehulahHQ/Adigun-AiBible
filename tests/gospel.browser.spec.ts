import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { GospelState } from '../src/gospel/model';
import type { Book, Manifest, Reference } from '../src/types';

const route = '#/gospels/JHN/3?verse=16&end=17&edition=eng-web';
const sourcesRoute = '#/sources/JHN/3?verse=16&end=17&edition=eng-web';
const savedMessage = 'Comparison row saved with its exact source revisions.';
const sower: Reference[] = [
  { bookId: 'MAT', chapter: 13, verse: 1, endVerse: 23, editionId: 'eng-web' },
  { bookId: 'MRK', chapter: 4, verse: 1, endVerse: 20, editionId: 'eng-web' },
  { bookId: 'LUK', chapter: 8, verse: 4, endVerse: 15, editionId: 'eng-web' },
];
type Backup = { kind: string; version: number; workspace: GospelState };
const pane = (page: Page, number: number) => page.getByRole('article', { name: `Gospel passage ${number}`, exact: true });
const directory = (edition = 'eng-web') => edition === 'eng-web' ? 'data' : `data/editions/${edition}`;
const book = (reference: Reference): Book => JSON.parse(readFileSync(new URL(`../${directory(reference.editionId)}/books/${reference.bookId}.json`, import.meta.url), 'utf8'));
const manifest = (edition = 'eng-web'): Manifest => JSON.parse(readFileSync(new URL(`../${directory(edition)}/manifest.json`, import.meta.url), 'utf8'));

async function expectSource(page: Page, number: number, reference: Reference) {
  const expected = book(reference).chapters.find(chapter => chapter.number === reference.chapter)!.verses
    .filter(verse => verse.number >= reference.verse && verse.number <= (reference.endVerse ?? reference.verse))
    .map(verse => `${reference.chapter}:${verse.number} ${verse.text}`);
  await expect.poll(() => pane(page, number).locator('.gospel-source-text > p').allTextContents()).toEqual(expected);
  await expect(pane(page, number).locator('header')).toContainText(manifest(reference.editionId).edition.name);
  await expect(pane(page, number).getByRole('alert')).toHaveCount(0);
}
async function open(page: Page) {
  await page.goto(route);
  await expect(page.getByRole('heading', { name: 'Gospel comparison', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save comparison row', exact: true })).toBeEnabled();
}
async function selectRange(page: Page, number: number, reference: Reference) {
  await page.getByLabel(`Passage ${number} Gospel`, { exact: true }).selectOption(reference.bookId);
  await page.getByLabel(`Passage ${number} edition`, { exact: true }).selectOption(reference.editionId || 'eng-web');
  await page.getByLabel(`Passage ${number} chapter`, { exact: true }).fill(String(reference.chapter));
  await page.getByLabel(`Passage ${number} first verse`, { exact: true }).fill(String(reference.verse));
  await page.getByLabel(`Passage ${number} last verse`, { exact: true }).fill(String(reference.endVerse ?? reference.verse));
}
async function save(page: Page, title: string, note: string) {
  await page.getByLabel('Comparison row title', { exact: true }).fill(title);
  await page.getByLabel('Private comparison notes', { exact: true }).fill(note);
  await page.getByRole('button', { name: 'Save comparison row', exact: true }).click();
  await expect(page.getByText(savedMessage, { exact: true })).toBeVisible();
  await expect(page.getByText('This row matches its saved device record.', { exact: true })).toBeVisible();
}
async function download(page: Page, name: string): Promise<Buffer> {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name, exact: true }).click();
  const file = await pending, path = await file.path();
  expect(path).not.toBeNull();
  return readFileSync(path!);
}
async function backup(page: Page) {
  const buffer = await download(page, 'Export Gospel backup'), value: Backup = JSON.parse(buffer.toString('utf8'));
  expect(value.kind).toBe('adigun-gospel-workspace'); expect(value.version).toBe(1);
  return { buffer, value };
}
const importFile = (page: Page, buffer: Buffer) => page.getByLabel('Gospel backup file', { exact: true }).setInputFiles({ name: 'gospel.json', mimeType: 'application/json', buffer });

test.describe('Gospel source selection and private workspace', () => {
  test.use({ serviceWorkers: 'block' });

  test('requested ranges render exact source words, reject real missing positions and retain the other accounts', async ({ page }) => {
    await open(page);
    for (const [index, reference] of sower.entries()) await expectSource(page, index + 1, reference);
    await expect(page.locator('.gospel-review')).toContainText('not independently reviewed');
    const missing = { bookId: 'MAT', chapter: 17, verse: 21, endVerse: 21 };
    for (const editionId of ['eng-asv', 'eng-bsb']) {
      await selectRange(page, 1, { ...missing, editionId });
      await expect(pane(page, 1).getByRole('alert')).toContainText('missing source wording');
      await expect(pane(page, 1).locator('.gospel-source-text')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Save comparison row', exact: true })).toBeDisabled();
      await expectSource(page, 2, sower[1]);
    }
    await selectRange(page, 1, { ...missing, editionId: 'eng-web' });
    await expectSource(page, 1, { ...missing, editionId: 'eng-web' });
    await save(page, 'Explicit edition choice', 'I selected the WEB wording deliberately.');
    await page.getByRole('button', { name: 'Open passage 1 in reader', exact: true }).click();
    await expect(page).toHaveURL(/#\/read\/MAT\/17\?verse=21&end=21&edition=eng-web$/);
  });

  test('saved rows navigate all accounts together and survive complete backup restore at 320px', async ({ page }, testInfo) => {
    await open(page);
    await save(page, 'Requested Sower passages', 'Private note for the first row.');
    await page.getByRole('button', { name: 'New comparison row', exact: true }).click();
    const second: Reference[] = [
      { bookId: 'JHN', chapter: 3, verse: 16, endVerse: 17, editionId: 'eng-bsb' },
      { bookId: 'MAT', chapter: 5, verse: 1, endVerse: 3, editionId: 'eng-web' },
      { bookId: 'MRK', chapter: 1, verse: 1, endVerse: 2, editionId: 'eng-web' },
      { bookId: 'LUK', chapter: 6, verse: 20, endVerse: 21, editionId: 'eng-web' },
    ];
    for (let i = 0; i < second.length; i++) {
      if (i >= 2) await page.getByRole('button', { name: 'Add Gospel passage', exact: true }).click();
      await selectRange(page, i + 1, second[i]);
    }
    await save(page, 'Four independent accounts', 'Personal arrangement, not a claim of equivalence.');
    for (const [index, reference] of second.entries()) await expectSource(page, index + 1, reference);
    await page.getByRole('button', { name: 'Previous row', exact: true }).click();
    await expect(page.getByLabel('Private comparison notes', { exact: true })).toHaveValue('Private note for the first row.');
    await expect(page.locator('.gospel-passage')).toHaveCount(3);
    for (const [index, reference] of sower.entries()) await expectSource(page, index + 1, reference);
    await page.getByRole('button', { name: 'Next row', exact: true }).click();
    for (const [index, reference] of second.entries()) await expectSource(page, index + 1, reference);
    const before = await backup(page);
    expect(before.value.workspace.rows.map(row => row.passages.map(passage => passage.reference))).toEqual([sower, second]);
    expect(before.value.workspace.rows.flatMap(row => row.passages).every(passage => passage.sourceSha256 === manifest(passage.reference.editionId).edition.sha256)).toBe(true);
    expect(before.buffer.toString('utf8')).not.toContain(book(sower[0]).chapters[12].verses[0].text);
    await page.reload();
    await expect(page.getByLabel('Comparison row title', { exact: true })).toHaveValue('Requested Sower passages');
    expect((await backup(page)).value).toEqual(before.value);
    page.once('dialog', dialog => void dialog.accept());
    await page.getByRole('button', { name: 'Delete all Gospel rows', exact: true }).click();
    await expect(page.getByLabel('Saved comparison row', { exact: true })).toBeDisabled();
    await importFile(page, before.buffer);
    await expect(page.getByRole('heading', { name: 'Review Gospel backup', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Merge Gospel backup', exact: true }).click();
    await expect(page.getByText('Gospel backup merged and saved. Choose a saved row above.', { exact: true })).toBeVisible();
    expect((await backup(page)).value).toEqual(before.value);
    await page.getByLabel('Saved comparison row', { exact: true }).selectOption(before.value.workspace.rows[1].id);
    await page.setViewportSize({ width: 320, height: 844 });
    for (const [index, reference] of second.entries()) await expectSource(page, index + 1, reference);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.getByRole('button', { name: 'Previous row', exact: true }).focus();
    await expect(page.getByRole('button', { name: 'Previous row', exact: true })).toBeFocused();
    await testInfo.attach('gospel-four-accounts-320px', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  });

  test('malformed or stale-source imports preserve data and final import protects a newly edited draft', async ({ page }) => {
    await open(page); await save(page, 'Keep my source selections', 'Saved original note.');
    const before = await backup(page), stale = structuredClone(before.value);
    stale.workspace.rows[0].passages[0].sourceSha256 = '0'.repeat(64);
    const invented = structuredClone(before.value) as Backup & { approved: boolean }; invented.approved = true;
    for (const candidate of [
      { bytes: Buffer.from('{broken'), error: 'not valid JSON' },
      { bytes: Buffer.from(JSON.stringify(stale)), error: 'source revision has changed' },
      { bytes: Buffer.from(JSON.stringify(invented)), error: 'Unexpected Gospel study fields' },
    ]) {
      await importFile(page, candidate.bytes);
      await expect(page.locator('.gospel-feedback').getByRole('alert')).toContainText(candidate.error);
      expect((await backup(page)).value).toEqual(before.value);
    }
    await importFile(page, before.buffer);
    await expect(page.getByRole('heading', { name: 'Review Gospel backup', exact: true })).toBeVisible();
    await page.getByLabel('Private comparison notes', { exact: true }).fill('Written after preview; do not silently discard.');
    const dialog = page.waitForEvent('dialog');
    const clicking = page.getByRole('button', { name: 'Merge Gospel backup', exact: true }).click();
    await (await dialog).dismiss(); await clicking;
    await expect(page.getByLabel('Private comparison notes', { exact: true })).toHaveValue('Written after preview; do not silently discard.');
    await expect(page.getByRole('heading', { name: 'Review Gospel backup', exact: true })).toBeVisible();
    expect((await backup(page)).value).toEqual(before.value);
    page.once('dialog', event => void event.dismiss());
    await page.evaluate(hash => { location.hash = hash; }, sourcesRoute);
    await expect(page).toHaveURL(url => url.hash === route);
    await expect(page.getByLabel('Private comparison notes', { exact: true })).toHaveValue('Written after preview; do not silently discard.');
  });

  test('a stale tab cannot overwrite newer rows and can export its rejected draft before recovery', async ({ page, context }) => {
    await open(page); await save(page, 'Shared row', 'Original note.');
    const other = await context.newPage();
    try {
      await open(other);
      await expect(other.getByLabel('Private comparison notes', { exact: true })).toHaveValue('Original note.');
      await save(page, 'Shared row', 'Saved in the first tab.');
      await other.getByLabel('Private comparison notes', { exact: true }).fill('Recover this second-tab draft.');
      await other.getByRole('button', { name: 'Save comparison row', exact: true }).click();
      await expect(other.locator('.gospel-row-navigation').getByRole('alert')).toContainText('Another tab saved newer Gospel rows');
      await expect(other.getByLabel('Private comparison notes', { exact: true })).toHaveValue('Recover this second-tab draft.');
      expect((await download(other, 'Export unsaved draft text')).toString('utf8')).toContain('Recover this second-tab draft.');
      await page.reload();
      await expect(page.getByLabel('Private comparison notes', { exact: true })).toHaveValue('Saved in the first tab.');
      other.once('dialog', dialog => void dialog.accept());
      await other.getByRole('button', { name: 'Reload saved rows', exact: true }).click();
      await expect(other.getByLabel('Private comparison notes', { exact: true })).toHaveValue('Saved in the first tab.');
      await save(other, 'Shared row', 'Recovered after reloading.');
      await page.reload();
      await expect(page.getByLabel('Private comparison notes', { exact: true })).toHaveValue('Recovered after reloading.');
    } finally { await other.close(); }
  });

  test('read-only startup permits leaving while pending writes protect navigation and allow draft recovery', async ({ page }) => {
    type Gate = { holdRead: boolean; holdWrite: boolean; reading: boolean; writing: boolean; completedReads: number };
    type GateWindow = typeof window & { gospelGate: Gate };
    await page.addInitScript(() => {
      const gate: Gate = { holdRead: true, holdWrite: false, reading: false, writing: false, completedReads: 0 };
      (window as GateWindow).gospelGate = gate;
      const original = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function (...args: Parameters<IDBDatabase['transaction']>) {
        const transaction = Reflect.apply(original, this, args) as IDBTransaction;
        if (this.name !== 'adigun-aibible-gospel-study') return transaction;
        const read = transaction.mode === 'readonly';
        if (read) gate.reading = true; else gate.writing = true;
        transaction.addEventListener('complete', () => { if (read) { gate.reading = false; gate.completedReads++; } else gate.writing = false; });
        const keepAlive = () => {
          if (!(read ? gate.holdRead : gate.holdWrite)) return;
          transaction.objectStore('workspace').get('test-gospel-transaction-gate').addEventListener('success', keepAlive);
        };
        keepAlive(); return transaction;
      };
    });
    await page.goto(route);
    await page.waitForFunction(() => (window as GateWindow).gospelGate.reading);
    await page.evaluate(hash => { location.hash = hash; }, sourcesRoute);
    await expect(page.getByRole('heading', { name: 'Sources & coverage', exact: true })).toBeVisible();
    await page.evaluate(() => { (window as GateWindow).gospelGate.holdRead = false; });
    await page.waitForFunction(() => (window as GateWindow).gospelGate.completedReads > 0);
    await open(page);
    await page.getByLabel('Private comparison notes', { exact: true }).fill('Recover me while the transaction is pending.');
    await page.evaluate(() => { (window as GateWindow).gospelGate.holdWrite = true; });
    await page.getByRole('button', { name: 'Save comparison row', exact: true }).click();
    await page.waitForFunction(() => (window as GateWindow).gospelGate.writing);
    await page.evaluate(hash => { location.hash = hash; }, sourcesRoute);
    await expect(page).toHaveURL(url => url.hash === route);
    expect(await page.evaluate(() => window.dispatchEvent(new Event('adigun:before-update', { cancelable: true })))).toBe(false);
    await expect(page.getByRole('button', { name: 'Export unsaved draft text', exact: true })).toBeEnabled();
    expect((await download(page, 'Export unsaved draft text')).toString('utf8')).toContain('Recover me while the transaction is pending.');
    await page.evaluate(() => { (window as GateWindow).gospelGate.holdWrite = false; });
    await expect(page.getByText(savedMessage, { exact: true })).toBeVisible();
    await page.evaluate(hash => { location.hash = hash; }, sourcesRoute);
    await expect(page.getByRole('heading', { name: 'Sources & coverage', exact: true })).toBeVisible();
  });

  test('a late abandoned edition response never replaces the currently selected Gospel wording', async ({ page }) => {
    await open(page);
    let release!: () => void, begun!: () => void, finished!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { begun = resolve; });
    const done = new Promise<void>(resolve => { finished = resolve; });
    await page.route('**/data/editions/deu1912/books/MAT.json', async request => { begun(); await barrier; await request.continue(); finished(); });
    await page.getByLabel('Passage 1 edition', { exact: true }).selectOption('deu1912');
    await started;
    await page.getByLabel('Passage 1 edition', { exact: true }).selectOption('eng-web');
    await expectSource(page, 1, sower[0]);
    release(); await done;
    await expectSource(page, 1, sower[0]);
    await expect(page.getByLabel('Passage 1 edition', { exact: true })).toHaveValue('eng-web');
  });
});

test('downloaded Gospel rows and private notes survive an actual offline reload', async ({ page, context }, testInfo) => {
  await open(page); await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await save(page, 'Offline Gospel study', 'Private note remains separate from disposable source downloads.');
  await page.getByRole('button', { name: /^(Download row sources|Verify row downloads)$/ }).click();
  await expect(page.getByText('Selected source books, edition manifests and rights notices are verified for offline use.', { exact: true })).toBeVisible();
  const before = await backup(page);
  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.getByLabel('Comparison row title', { exact: true })).toHaveValue('Offline Gospel study');
    await expect(page.getByLabel('Private comparison notes', { exact: true })).toHaveValue('Private note remains separate from disposable source downloads.');
    for (const [index, reference] of sower.entries()) await expectSource(page, index + 1, reference);
    expect((await backup(page)).value).toEqual(before.value);
    await expect(page.locator('.offline-banner')).toContainText('Offline');
    await testInfo.attach('gospel-offline-reader', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  } finally { await context.setOffline(false); }
});

import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { Book, Manifest } from '../src/types';
import type { GospelStudyState } from '../src/gospels/study-model';

const databaseName = 'adigun-aibible-gospel-notebook';
const route = '#/gospels/JHN/3?verse=16&end=18&edition=eng-web';
const sourcesRoute = '#/sources/JHN/3?verse=16&end=18&edition=eng-web';
const names = { MAT: 'Matthew', MRK: 'Mark', LUK: 'Luke', JHN: 'John' } as const;
type Gospel = keyof typeof names;
type Backup = { kind: string; version: number; workspace: GospelStudyState };
const notebook = (page: Page) => page.locator('details.gospel-notebook');
const pane = (page: Page, book: Gospel) => page.getByRole('article', { name: `${names[book]} comparison pane`, exact: true });
const sourceRows = (card: Locator) => card.locator(':scope > .gospel-source > p');
const sourcePath = (edition: string, file: string) => edition === 'eng-web' ? `data/${file}` : `data/editions/${edition}/${file}`;
const manifest = (edition: string): Manifest => JSON.parse(readFileSync(new URL(`../${sourcePath(edition, 'manifest.json')}`, import.meta.url), 'utf8'));
const bookData = (edition: string, book: Gospel): Book => JSON.parse(readFileSync(new URL(`../${sourcePath(edition, `books/${book}.json`)}`, import.meta.url), 'utf8'));

async function exactPassage(page: Page, book: Gospel, edition: string, chapter: number, first: number, last: number) {
  const card = pane(page, book), expected = bookData(edition, book).chapters.find(value => value.number === chapter)!.verses.filter(verse => verse.number >= first && verse.number <= last);
  await expect(card.locator('.gospel-reference')).toHaveText(`${names[book]} ${chapter}:${first}${first === last ? '' : `–${last}`} · ${edition}`);
  await expect(card.locator('.gospel-edition')).toHaveText(`${manifest(edition).edition.name} · ${manifest(edition).edition.language} · exact source wording`);
  await expect.poll(() => sourceRows(card).locator('span').allTextContents()).toEqual(expected.map(value => value.text));
  expect(await sourceRows(card).evaluateAll(elements => elements.map(element => Number(element.getAttribute('data-verse'))))).toEqual(expected.map(value => value.number));
}
async function sower(page: Page, edition = 'eng-web') {
  await exactPassage(page, 'MAT', edition, 13, 1, 23);
  await exactPassage(page, 'MRK', edition, 4, 1, 20);
  await exactPassage(page, 'LUK', edition, 8, 4, 15);
}
async function independent(page: Page, book: Gospel, edition: string, chapter: number, first: number, last: number) {
  const card = pane(page, book);
  if (book !== 'JHN') await card.getByRole('checkbox', { name: 'Follow the Sower selection', exact: true }).uncheck();
  await card.getByLabel('Independent edition', { exact: true }).selectOption(edition);
  await card.getByLabel('Chapter', { exact: true }).fill(String(chapter));
  await card.getByLabel('From verse', { exact: true }).fill(String(first));
  await card.getByLabel('Through verse', { exact: true }).fill(String(last));
  await card.getByRole('button', { name: 'Apply independent passage', exact: true }).click();
  await exactPassage(page, book, edition, chapter, first, last);
}
async function expandNotebook(page: Page, ready = true) {
  if (await notebook(page).getAttribute('open') === null) await notebook(page).locator(':scope > summary').click();
  await expect(notebook(page).getByRole('heading', { name: 'Save your comparison and notes', exact: true })).toBeVisible();
  if (ready) await expect(notebook(page).getByRole('button', { name: 'Export Gospel backup', exact: true })).toBeEnabled();
}
async function openNotebook(page: Page) {
  await page.goto(route); await sower(page); await expandNotebook(page);
}
async function saveNew(page: Page, title: string, note: string) {
  await notebook(page).getByLabel('Study title', { exact: true }).fill(title);
  await notebook(page).getByLabel('Private Gospel notes', { exact: true }).fill(note);
  await notebook(page).getByRole('button', { name: 'Save Gospel study', exact: true }).click();
  await expect(notebook(page).getByText('Gospel study saved with its exact source revisions.', { exact: true })).toBeVisible();
}
async function readNotebook(page: Page): Promise<GospelStudyState | undefined> {
  return page.evaluate(name => new Promise<GospelStudyState | undefined>((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, transaction = db.transaction('workspace', 'readonly'), read = transaction.objectStore('workspace').get('private');
      transaction.oncomplete = () => { db.close(); resolve(read.result); };
      transaction.onabort = () => { db.close(); reject(transaction.error || new Error('Notebook read did not complete.')); };
    };
  }), databaseName);
}
async function savedNotebook(page: Page): Promise<GospelStudyState> {
  const state = await readNotebook(page); expect(state).toBeDefined(); return state!;
}
async function writeNotebook(page: Page, state: GospelStudyState) {
  await page.evaluate(({ name, state }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('workspace');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, transaction = db.transaction('workspace', 'readwrite');
      transaction.objectStore('workspace').put(state, 'private');
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onabort = () => { db.close(); reject(transaction.error || new Error('Notebook fixture did not commit.')); };
    };
  }), { name: databaseName, state });
}
async function downloadedText(page: Page, button: string) {
  const pending = page.waitForEvent('download');
  await notebook(page).getByRole('button', { name: button, exact: true }).click();
  const download = await pending, path = await download.path(); expect(path).not.toBeNull();
  return { filename: download.suggestedFilename(), text: readFileSync(path!, 'utf8') };
}
async function exportedBackup(page: Page): Promise<Backup> {
  const download = await downloadedText(page, 'Export Gospel backup'), value = JSON.parse(download.text) as Backup;
  expect(download.filename).toBe('Adigun-Gospel-studies.json');
  expect(value.kind).toBe('adigun-gospel-notebook'); expect(value.version).toBe(1); expect(value.workspace.revision).toBe(0);
  return value;
}
async function importBackup(page: Page, value: unknown) {
  await notebook(page).getByLabel('Gospel backup file', { exact: true }).setInputFiles({ name: 'gospel-studies.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
}
async function selectStudy(page: Page, id: string) {
  await notebook(page).getByLabel('Saved Gospel study', { exact: true }).selectOption(id);
}

test('saved Gospel studies round-trip exact mixed panes and private notes without replacing an explicit startup link', async ({ page }) => {
  await openNotebook(page);
  await page.getByLabel('Edition for linked Gospel panes', { exact: true }).selectOption('deu1912');
  await sower(page, 'deu1912');
  await independent(page, 'MAT', 'eng-bsb', 17, 20, 22);
  await independent(page, 'MRK', 'yor', 4, 3, 4);
  await pane(page, 'MRK').getByRole('checkbox', { name: 'Follow the Sower selection', exact: true }).check();
  await page.getByRole('button', { name: 'Add independent pane', exact: true }).click();
  await independent(page, 'JHN', 'eng-web', 3, 16, 18);
  const title = 'Àlàáfíà — private four-account study', note = 'My private observation: compare the words carefully. Ẹ ṣeun.';
  await saveNew(page, title, note);
  const stored = await savedNotebook(page), row = stored.rows[0];
  expect(row.selection.panes.map(value => value.bookId)).toEqual(['MAT', 'MRK', 'LUK', 'JHN']);
  expect(row.selection.panes.map(value => value.linked)).toEqual([false, true, true, false]);
  expect(row.selection.panes[1].independent).toEqual({ chapter: 4, verse: 3, endVerse: 4, editionId: 'yor' });
  expect(row.passages.map(value => value.reference.editionId)).toEqual(['eng-bsb', 'deu1912', 'deu1912', 'eng-web']);
  for (const passage of row.passages) expect(passage.sourceSha256).toBe(manifest(passage.reference.editionId).edition.sha256);
  expect(decodeURIComponent(page.url())).not.toContain(title); expect(decodeURIComponent(page.url())).not.toContain(note);
  const backup = await exportedBackup(page);
  expect(backup.workspace.rows).toEqual(stored.rows);
  expect(JSON.stringify(backup)).not.toContain(bookData('eng-web', 'JHN').chapters.find(value => value.number === 3)!.verses.find(value => value.number === 16)!.text);
  expect(Object.keys(backup.workspace.rows[0].passages[0]).sort()).toEqual(['bookName', 'editionName', 'reference', 'sourceSha256']);

  await page.goto('#/gospels/JHN/3?verse=16&end=18&edition=yor'); await page.reload();
  await sower(page, 'yor'); await expandNotebook(page);
  await expect(notebook(page).getByLabel('Saved Gospel study', { exact: true })).toHaveValue('');
  await expect(notebook(page).getByLabel('Private Gospel notes', { exact: true })).toHaveValue('');
  await selectStudy(page, row.id);
  await expect(notebook(page).getByLabel('Study title', { exact: true })).toHaveValue(title);
  await expect(notebook(page).getByLabel('Private Gospel notes', { exact: true })).toHaveValue(note);
  await exactPassage(page, 'MAT', 'eng-bsb', 17, 20, 22);
  await expect(pane(page, 'MAT')).toContainText('17:21 — No verse record in this edition.');
  await exactPassage(page, 'MRK', 'deu1912', 4, 1, 20);
  await exactPassage(page, 'LUK', 'deu1912', 8, 4, 15);
  await exactPassage(page, 'JHN', 'eng-web', 3, 16, 18);
  expect(await savedNotebook(page)).toEqual(stored);
  await page.getByRole('button', { name: 'Return to reader', exact: true }).click();
  await expect(page).toHaveURL(/#\/read\/JHN\/3\?verse=16&end=18&edition=yor$/);
});

test('ordered studies navigate together, delete with Undo, and keep a dismissed Back action and narrow keyboard draft intact', async ({ page, isMobile }, testInfo) => {
  await openNotebook(page); await saveNew(page, 'English Sower reading', 'First private reflection.');
  const first = (await savedNotebook(page)).rows[0];
  await notebook(page).getByRole('button', { name: 'New study from these panes', exact: true }).click();
  await page.getByLabel('Edition for linked Gospel panes', { exact: true }).selectOption('deu1912'); await sower(page, 'deu1912');
  await saveNew(page, 'German Sower reading', 'Second private reflection.');
  const second = (await savedNotebook(page)).rows[1];
  await notebook(page).getByRole('button', { name: 'Previous saved study', exact: true }).click(); await sower(page);
  await expect(notebook(page).getByLabel('Private Gospel notes', { exact: true })).toHaveValue(first.note);
  await notebook(page).getByRole('button', { name: 'Next saved study', exact: true }).click(); await sower(page, 'deu1912');
  await notebook(page).getByRole('button', { name: 'Move study earlier', exact: true }).click();
  await expect.poll(async () => (await savedNotebook(page)).rows.map(value => value.id)).toEqual([second.id, first.id]);
  await notebook(page).getByRole('button', { name: 'Move study later', exact: true }).click();
  await expect.poll(async () => (await savedNotebook(page)).rows.map(value => value.id)).toEqual([first.id, second.id]);
  page.once('dialog', dialog => dialog.accept());
  await notebook(page).getByRole('button', { name: 'Delete saved study', exact: true }).click();
  await expect.poll(async () => (await savedNotebook(page)).rows.map(value => value.id)).toEqual([first.id]);
  await notebook(page).getByRole('button', { name: 'Undo deleted study', exact: true }).click();
  await expect.poll(async () => (await savedNotebook(page)).rows.map(value => value.id)).toEqual([first.id, second.id]);
  await selectStudy(page, second.id); await sower(page, 'deu1912');
  await page.setViewportSize({ width: isMobile ? 390 : 1440, height: isMobile ? 844 : 900 });
  await notebook(page).screenshot({ path: testInfo.outputPath('gospel-notebook-native.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 320, height: 844 });
  const summary = notebook(page).locator(':scope > summary');
  await summary.focus(); await summary.press('Enter'); await expect(notebook(page)).not.toHaveAttribute('open', '');
  await summary.press('Enter'); await expect(notebook(page)).toHaveAttribute('open', '');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await notebook(page).screenshot({ path: testInfo.outputPath('gospel-notebook-320.png'), animations: 'disabled' });

  await page.getByLabel('Edition for linked Gospel panes', { exact: true }).selectOption('yor'); await sower(page, 'yor');
  await notebook(page).getByLabel('Private Gospel notes', { exact: true }).fill('Keep this draft and the most recent Yoruba panes.');
  const currentHash = new URL(page.url()).hash;
  let dismissed = false;
  page.once('dialog', async dialog => { dismissed = true; await dialog.dismiss(); });
  await page.evaluate(() => history.back());
  await expect.poll(() => dismissed).toBe(true);
  await expect(page).toHaveURL(url => url.hash === currentHash); await sower(page, 'yor');
  await expect(notebook(page).getByLabel('Private Gospel notes', { exact: true })).toHaveValue('Keep this draft and the most recent Yoruba panes.');
  expect(await page.evaluate(() => window.dispatchEvent(new Event('adigun:before-update', { cancelable: true })))).toBe(false);
  page.once('dialog', dialog => dialog.accept());
  await notebook(page).getByRole('button', { name: 'Discard unsaved changes', exact: true }).click();
  await sower(page, 'deu1912');
  await expect(notebook(page).getByLabel('Private Gospel notes', { exact: true })).toHaveValue(second.note);
});

test('Gospel backup preview honors each conflict choice and rejects malformed, oversized, forged and stale sources without data loss', async ({ page }) => {
  await openNotebook(page); await saveNew(page, 'Device study', 'Keep this device note.');
  const backup = await exportedBackup(page), incoming = structuredClone(backup);
  incoming.workspace.rows[0].title = 'Backup study'; incoming.workspace.rows[0].note = 'Backup note selected explicitly.';
  await importBackup(page, incoming);
  await expect(notebook(page).locator('.gospel-import')).toContainText('0 new studies · 0 identical · 1 conflicts');
  await notebook(page).getByRole('button', { name: 'Merge Gospel backup', exact: true }).click();
  await expect(notebook(page).getByText('Gospel backup merged and saved. Choose a saved study to open its panes.', { exact: true })).toBeVisible();
  expect((await savedNotebook(page)).rows).toEqual(backup.workspace.rows);
  await importBackup(page, incoming);
  await expect(notebook(page).locator('.gospel-import')).toContainText('1 conflicts');
  await notebook(page).getByLabel('When study IDs conflict', { exact: true }).selectOption('use-backup');
  await notebook(page).getByRole('button', { name: 'Merge Gospel backup', exact: true }).click();
  await expect(notebook(page).getByText('Gospel backup merged and saved. Choose a saved study to open its panes.', { exact: true })).toBeVisible();
  const preserved = await savedNotebook(page); expect(preserved.rows).toEqual(incoming.workspace.rows);
  const forged = structuredClone(incoming); forged.workspace.rows[0].passages[0].bookName = 'An unverified source label';
  const stale = structuredClone(incoming); stale.workspace.rows[0].passages[0].sourceSha256 = '0'.repeat(64);
  for (const [value, error] of [
    [{ ...incoming, approved: true }, /unknown.*fields/i],
    [forged, /source label.*does not match/i],
    [stale, /source revision.*changed/i],
  ] as const) {
    await importBackup(page, value);
    await expect(notebook(page).getByRole('alert')).toContainText(error);
    expect(await savedNotebook(page)).toEqual(preserved);
  }
  await notebook(page).getByLabel('Gospel backup file', { exact: true }).setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{ broken') });
  await expect(notebook(page).getByRole('alert')).toContainText('not valid JSON');
  expect(await savedNotebook(page)).toEqual(preserved);
  await notebook(page).getByLabel('Gospel backup file', { exact: true }).setInputFiles({ name: 'oversized.json', mimeType: 'application/json', buffer: Buffer.alloc(2 * 1024 * 1024 + 1, 32) });
  await expect(notebook(page).getByRole('alert')).toContainText('no larger than 2 MiB');
  expect(await savedNotebook(page)).toEqual(preserved);
});

test('a stale Gospel tab preserves the newer study and can recover its own writing as a separate study after reload', async ({ page, context }) => {
  await openNotebook(page); await saveNew(page, 'Shared device study', 'Original note.');
  const original = (await savedNotebook(page)).rows[0], other = await context.newPage();
  try {
    await openNotebook(other); await selectStudy(other, original.id);
    await notebook(page).getByLabel('Private Gospel notes', { exact: true }).fill('Winning note from the first tab.');
    await notebook(page).getByRole('button', { name: 'Save study changes', exact: true }).click();
    await expect(notebook(page).getByText('Gospel study saved with its exact source revisions.', { exact: true })).toBeVisible();
    const winner = await savedNotebook(page);
    await notebook(other).getByLabel('Private Gospel notes', { exact: true }).fill('Unsaved second-tab reasoning to recover.');
    await notebook(other).getByRole('button', { name: 'Save study changes', exact: true }).click();
    await expect(notebook(other).getByRole('alert')).toContainText('Another tab saved newer Gospel studies');
    expect(await savedNotebook(other)).toEqual(winner);
    const recovery = await downloadedText(other, 'Download draft text');
    expect(recovery.text).toContain('Unsaved second-tab reasoning to recover.');
    await notebook(other).getByRole('button', { name: 'Reload saved studies', exact: true }).click();
    await expect(notebook(other).getByRole('button', { name: 'Save study changes', exact: true })).toBeEnabled();
    await expect(notebook(other).getByLabel('Private Gospel notes', { exact: true })).toHaveValue('Unsaved second-tab reasoning to recover.');
    await notebook(other).getByRole('button', { name: 'Save study changes', exact: true }).click();
    await expect(notebook(other).getByRole('alert')).toContainText(/changed|newer|conflict/i);
    expect(await savedNotebook(other)).toEqual(winner);
    await notebook(other).getByRole('button', { name: 'Save draft as new study', exact: true }).click();
    await expect.poll(async () => (await savedNotebook(other)).rows.length).toBe(2);
    const recovered = await savedNotebook(other);
    expect(recovered.rows[0]).toEqual(winner.rows[0]);
    expect(recovered.rows[1].id).not.toBe(original.id);
    expect(recovered.rows[1].note).toBe('Unsaved second-tab reasoning to recover.');
  } finally { await other.close(); }
});

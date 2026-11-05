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

test('saved Gospel studies round-trip exact mixed panes and private notes without replacing an explicit startup link', async ({ page, context }) => {
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

  const fresh = await context.newPage();
  try {
    await fresh.goto('#/gospels/JHN/3?verse=16&end=18&edition=yor');
    await sower(fresh, 'yor'); await expandNotebook(fresh);
    await expect(notebook(fresh).getByLabel('Saved Gospel study', { exact: true })).toHaveValue('');
    await expect(notebook(fresh).getByLabel('Private Gospel notes', { exact: true })).toHaveValue('');
    await selectStudy(fresh, row.id);
    await expect(notebook(fresh).getByLabel('Study title', { exact: true })).toHaveValue(title);
    await expect(notebook(fresh).getByLabel('Private Gospel notes', { exact: true })).toHaveValue(note);
    await exactPassage(fresh, 'MAT', 'eng-bsb', 17, 20, 22);
    await expect(pane(fresh, 'MAT')).toContainText('17:21 — No verse record in this edition.');
    await exactPassage(fresh, 'MRK', 'deu1912', 4, 1, 20);
    await exactPassage(fresh, 'LUK', 'deu1912', 8, 4, 15);
    await exactPassage(fresh, 'JHN', 'eng-web', 3, 16, 18);
    expect(await savedNotebook(fresh)).toEqual(stored);
    await fresh.getByRole('button', { name: 'Return to reader', exact: true }).click();
    await expect(fresh).toHaveURL(/#\/read\/JHN\/3\?verse=16&end=18&edition=yor$/);
  } finally { await fresh.close(); }
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

test('Gospel backup preview honors each conflict choice and rejects malformed, oversized, forged and stale sources without data loss', async ({ page, context }) => {
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

  await importBackup(page, incoming);
  await expect(notebook(page).locator('.gospel-import')).toContainText('1 identical');
  const other = await context.newPage();
  try {
    await openNotebook(other); await selectStudy(other, preserved.rows[0].id);
    await notebook(other).getByLabel('Private Gospel notes', { exact: true }).fill('Another tab changed this study after the import preview.');
    await notebook(other).getByRole('button', { name: 'Save study changes', exact: true }).click();
    await expect(notebook(other).getByText('Gospel study saved with its exact source revisions.', { exact: true })).toBeVisible();
    const concurrent = await savedNotebook(other);
    await notebook(page).getByLabel('When study IDs conflict', { exact: true }).selectOption('use-backup');
    await notebook(page).getByRole('button', { name: 'Merge Gospel backup', exact: true }).click();
    await expect(notebook(page).getByRole('alert')).toContainText(/newer Gospel studies|changed after this preview/);
    expect(await savedNotebook(page)).toEqual(concurrent);
  } finally { await other.close(); }
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

test('reopening saved source pins never substitutes a changed Gospel revision and draft recovery remains available', async ({ page }) => {
  await openNotebook(page); await saveNew(page, 'An earlier source revision', 'Keep this note even when its source is unavailable.');
  const saved = await savedNotebook(page), pinned = structuredClone(saved);
  pinned.revision++; pinned.rows[0].passages[0].sourceSha256 = '0'.repeat(64);
  await writeNotebook(page, pinned);
  await page.reload(); await sower(page); await expandNotebook(page);
  await selectStudy(page, pinned.rows[0].id);
  await expect(notebook(page).getByLabel('Private Gospel notes', { exact: true })).toHaveValue(pinned.rows[0].note);
  await expect(pane(page, 'MAT').getByRole('alert')).toContainText('exact Gospel source revision is unavailable or has changed');
  await expect(sourceRows(pane(page, 'MAT'))).toHaveCount(0);
  await exactPassage(page, 'MRK', 'eng-web', 4, 1, 20); await exactPassage(page, 'LUK', 'eng-web', 8, 4, 15);
  await notebook(page).getByRole('button', { name: 'Save study changes', exact: true }).click();
  await expect(notebook(page).getByRole('alert')).toContainText('source revision is unavailable or has changed');
  expect(await savedNotebook(page)).toEqual(pinned);
  const backup = await exportedBackup(page); expect(backup.workspace.rows).toEqual(pinned.rows);
  const draft = await downloadedText(page, 'Download draft text');
  expect(draft.text).toContain(pinned.rows[0].note); expect(draft.text).toContain('0'.repeat(64));
  await notebook(page).getByRole('button', { name: 'New study from these panes', exact: true }).click();
  await sower(page);
  expect(await savedNotebook(page)).toEqual(pinned);
});

type DatabaseGate = {
  holdRead: boolean; holdWrite: boolean; reading: boolean; writing: boolean; completedReads: number; completedWrites: number;
};
type GatedWindow = typeof window & { gospelNotebookGate: DatabaseGate };
async function installDatabaseGate(page: Page, holdRead = false) {
  await page.addInitScript(({ name, holdRead }) => {
    const gate: DatabaseGate = { holdRead, holdWrite: false, reading: false, writing: false, completedReads: 0, completedWrites: 0 };
    (window as GatedWindow).gospelNotebookGate = gate;
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args: Parameters<IDBDatabase['transaction']>) {
      const transaction = Reflect.apply(original, this, args) as IDBTransaction;
      if (this.name !== name || !transaction.objectStoreNames.contains('workspace')) return transaction;
      const read = transaction.mode === 'readonly';
      if (read) gate.reading = true; else gate.writing = true;
      transaction.addEventListener('complete', () => {
        if (read) { gate.reading = false; gate.completedReads++; }
        else { gate.writing = false; gate.completedWrites++; }
      });
      // Hold the real transaction open; production still receives native results and completion.
      const keepAlive = () => {
        if (!(read ? gate.holdRead : gate.holdWrite)) return;
        transaction.objectStore('workspace').get('browser-acceptance-keepalive').addEventListener('success', keepAlive);
      };
      keepAlive(); return transaction;
    };
  }, { name: databaseName, holdRead });
}

test.describe('private Gospel storage and source operation boundaries', () => {
  test.use({ serviceWorkers: 'block' });

  test('denied notebook storage keeps writing recoverable and a deliberate retry can save it', async ({ page }) => {
    await page.addInitScript(name => {
      const original = IDBFactory.prototype.open;
      (window as typeof window & { restoreGospelStorage: () => void }).restoreGospelStorage = () => { IDBFactory.prototype.open = original; };
      IDBFactory.prototype.open = function (this: IDBFactory, database: string, version?: number) {
        if (database === name) throw new DOMException('Controlled notebook storage denial.', 'SecurityError');
        return version === undefined ? original.call(this, database) : original.call(this, database, version);
      };
    }, databaseName);
    await page.goto(route); await sower(page); await expandNotebook(page, false);
    await expect(notebook(page).getByRole('alert')).toContainText('may be denied');
    await expect(notebook(page).getByRole('button', { name: 'Save Gospel study', exact: true })).toBeDisabled();
    await notebook(page).getByLabel('Study title', { exact: true }).fill('Recover this private draft');
    await notebook(page).getByLabel('Private Gospel notes', { exact: true }).fill('Àlàáfíà survives storage denial.');
    const draft = await downloadedText(page, 'Download draft text');
    expect(draft.filename).toBe('Adigun-Gospel-private-draft.txt'); expect(draft.text).toContain('Àlàáfíà survives storage denial.');
    await expect(notebook(page).getByText('Gospel study saved with its exact source revisions.', { exact: true })).toHaveCount(0);
    await page.evaluate(() => (window as typeof window & { restoreGospelStorage: () => void }).restoreGospelStorage());
    await notebook(page).getByRole('button', { name: 'Reload saved studies', exact: true }).click();
    await expect(notebook(page).getByRole('button', { name: 'Save Gospel study', exact: true })).toBeEnabled();
    await expect(notebook(page).getByLabel('Private Gospel notes', { exact: true })).toHaveValue('Àlàáfíà survives storage denial.');
    await notebook(page).getByRole('button', { name: 'Save Gospel study', exact: true }).click();
    await expect(notebook(page).getByText('Gospel study saved with its exact source revisions.', { exact: true })).toBeVisible();
    expect((await savedNotebook(page)).rows[0].note).toBe('Àlàáfíà survives storage denial.');
  });

  test('quota failures and real transaction aborts cannot report success or discard the private draft', async ({ page }) => {
    await openNotebook(page);
    await notebook(page).getByLabel('Study title', { exact: true }).fill('A recoverable failed write');
    await notebook(page).getByLabel('Private Gospel notes', { exact: true }).fill('Keep every character after a failed transaction.');
    for (const mode of ['quota', 'abort'] as const) {
      await page.evaluate(({ name, mode }) => {
        const original = IDBObjectStore.prototype.put;
        (window as typeof window & { restoreGospelPut: () => void }).restoreGospelPut = () => { IDBObjectStore.prototype.put = original; };
        IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
          if (this.transaction.db.name !== name) return Reflect.apply(original, this, args) as IDBRequest;
          if (mode === 'quota') throw new DOMException('Controlled notebook quota failure.', 'QuotaExceededError');
          const request = Reflect.apply(original, this, args) as IDBRequest;
          request.addEventListener('success', () => this.transaction.abort(), { once: true });
          return request;
        };
      }, { name: databaseName, mode });
      try {
        await notebook(page).getByRole('button', { name: 'Save Gospel study', exact: true }).click();
        await expect(notebook(page).getByRole('alert')).toContainText('Gospel changes were not saved');
        await expect(notebook(page).getByRole('button', { name: 'Save Gospel study', exact: true })).toBeEnabled();
        await expect(notebook(page).getByLabel('Private Gospel notes', { exact: true })).toHaveValue('Keep every character after a failed transaction.');
        expect(await readNotebook(page)).toBeUndefined();
        await expect(notebook(page).getByText('Gospel study saved with its exact source revisions.', { exact: true })).toHaveCount(0);
        const draft = await downloadedText(page, 'Download draft text'); expect(draft.text).toContain('Keep every character after a failed transaction.');
      } finally { await page.evaluate(() => (window as typeof window & { restoreGospelPut: () => void }).restoreGospelPut()); }
    }
    await notebook(page).getByRole('button', { name: 'Save Gospel study', exact: true }).click();
    await expect(notebook(page).getByText('Gospel study saved with its exact source revisions.', { exact: true })).toBeVisible();
    expect((await savedNotebook(page)).rows).toHaveLength(1);
  });

  test('a pending readonly notebook startup allows navigation without creating or replacing private data', async ({ page }) => {
    await installDatabaseGate(page, true);
    await page.goto(route); await sower(page); await expandNotebook(page, false);
    await page.waitForFunction(() => (window as GatedWindow).gospelNotebookGate.reading);
    await expect(notebook(page).getByText('Opening private Gospel storage…', { exact: true })).toBeVisible();
    await expect(notebook(page).getByRole('button', { name: 'Export Gospel backup', exact: true })).toBeDisabled();
    try {
      await page.goto(sourcesRoute);
      await expect(page.getByRole('heading', { name: 'Sources & coverage', exact: true, level: 1 })).toBeVisible();
      await expect(page).toHaveURL(url => url.hash === sourcesRoute);
      expect(await page.evaluate(() => (window as GatedWindow).gospelNotebookGate.completedReads)).toBe(0);
    } finally { await page.evaluate(() => { (window as GatedWindow).gospelNotebookGate.holdRead = false; }); }
    await page.waitForFunction(() => (window as GatedWindow).gospelNotebookGate.completedReads > 0);
    await openNotebook(page); expect(await readNotebook(page)).toBeUndefined();
  });

  test('a pending actual notebook commit protects navigation and updates while draft download remains usable', async ({ page }) => {
    await installDatabaseGate(page); await openNotebook(page);
    await notebook(page).getByLabel('Study title', { exact: true }).fill('Wait for transaction completion');
    await notebook(page).getByLabel('Private Gospel notes', { exact: true }).fill('This must not claim success before the commit.');
    const hash = new URL(page.url()).hash;
    await page.evaluate(() => { (window as GatedWindow).gospelNotebookGate.holdWrite = true; });
    try {
      await notebook(page).getByRole('button', { name: 'Save Gospel study', exact: true }).click();
      await page.waitForFunction(() => (window as GatedWindow).gospelNotebookGate.writing);
      await expect(notebook(page).getByLabel('Private Gospel notes', { exact: true })).toBeDisabled();
      await expect(page.getByLabel('Edition for linked Gospel panes', { exact: true })).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Return to reader', exact: true })).toBeDisabled();
      await expect(notebook(page).getByText('Gospel study saved with its exact source revisions.', { exact: true })).toHaveCount(0);
      expect(await page.evaluate(() => window.dispatchEvent(new Event('adigun:before-update', { cancelable: true })))).toBe(false);
      await page.goto(sourcesRoute); await expect(page).toHaveURL(url => url.hash === hash);
      const recovery = await downloadedText(page, 'Download draft text'); expect(recovery.text).toContain('This must not claim success before the commit.');
      expect(await page.evaluate(() => (window as GatedWindow).gospelNotebookGate.completedWrites)).toBe(0);
    } finally { await page.evaluate(() => { (window as GatedWindow).gospelNotebookGate.holdWrite = false; }); }
    await expect(notebook(page).getByText('Gospel study saved with its exact source revisions.', { exact: true })).toBeVisible();
    expect((await savedNotebook(page)).rows[0].note).toBe('This must not claim success before the commit.');
    await page.goto(sourcesRoute);
    await expect(page.getByRole('heading', { name: 'Sources & coverage', exact: true, level: 1 })).toBeVisible();
  });

  test('cancelling a source-bound save prevents a late response from creating a study or replacing the next selection', async ({ page }) => {
    await openNotebook(page);
    let release!: () => void, started!: () => void, finished!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    const begun = new Promise<void>(resolve => { started = resolve; }), done = new Promise<void>(resolve => { finished = resolve; });
    await page.route('**/data/editions/yor/books/MAT.json', async request => {
      const response = await request.fetch(); started(); await barrier;
      try { await request.fulfill({ response }); } finally { finished(); }
    });
    try {
      await page.getByLabel('Edition for linked Gospel panes', { exact: true }).selectOption('yor'); await begun;
      await notebook(page).getByLabel('Study title', { exact: true }).fill('Cancelled source request');
      await notebook(page).getByLabel('Private Gospel notes', { exact: true }).fill('An earlier draft must not be saved later.');
      await notebook(page).getByRole('button', { name: 'Save Gospel study', exact: true }).click();
      await notebook(page).getByRole('button', { name: 'Cancel source preparation', exact: true }).click();
      await expect(notebook(page).getByRole('button', { name: 'Save Gospel study', exact: true })).toBeEnabled();
      await notebook(page).getByLabel('Private Gospel notes', { exact: true }).fill('This is the later, unsaved draft.');
      await page.getByLabel('Edition for linked Gospel panes', { exact: true }).selectOption('deu1912'); await sower(page, 'deu1912');
      const received = page.waitForEvent('requestfinished', { predicate: request => request.url().endsWith('/data/editions/yor/books/MAT.json') });
      release(); await done; await received;
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await sower(page, 'deu1912');
      await expect(notebook(page).getByLabel('Private Gospel notes', { exact: true })).toHaveValue('This is the later, unsaved draft.');
      expect(await readNotebook(page)).toBeUndefined();
      await expect(notebook(page).getByText('Gospel study saved with its exact source revisions.', { exact: true })).toHaveCount(0);
      await notebook(page).getByRole('button', { name: 'Save Gospel study', exact: true }).click();
      await expect(notebook(page).getByText('Gospel study saved with its exact source revisions.', { exact: true })).toBeVisible();
      const row = (await savedNotebook(page)).rows[0];
      expect(row.note).toBe('This is the later, unsaved draft.'); expect(row.passages.every(passage => passage.reference.editionId === 'deu1912')).toBe(true);
    } finally { release(); }
  });

  test('Gospel Markdown exports retain exact source wording and complete notices, and tampered notices produce no download', async ({ page }) => {
    await openNotebook(page);
    await page.getByLabel('Edition for linked Gospel panes', { exact: true }).selectOption('yor'); await sower(page, 'yor');
    await saveNew(page, 'Yorùbá source notebook', '<script>window.gospelNotebookInjected = true</script>\nMy own reflection, not Scripture.');
    const stored = await savedNotebook(page), edition = manifest('yor').edition;
    expect(edition.noticePath).toBeTruthy();
    const completeNotice = readFileSync(new URL(`../data/editions/${edition.noticePath}`, import.meta.url), 'utf8');
    const exported = await downloadedText(page, 'Export study notebook');
    expect(exported.filename).toBe('Adigun-Gospel-study.md');
    expect(exported.text).toContain(completeNotice); expect(exported.text).toContain(edition.sha256!);
    expect(exported.text).toContain('## Private notes · user writing');
    expect(exported.text).toContain('not independently reviewed');
    const firstSourceLine = exported.text.split('\n').find(line => line.startsWith('> 13:1 '));
    expect(firstSourceLine).toBeDefined();
    const decoded = firstSourceLine!.slice('> 13:1 '.length).replace(/\\([^\p{L}\p{N}\s])/gu, '$1').replace(/&amp;/g, '&');
    expect(decoded).toBe(bookData('yor', 'MAT').chapters.find(chapter => chapter.number === 13)!.verses.find(verse => verse.number === 1)!.text);
    expect(await page.evaluate(() => Object.hasOwn(window, 'gospelNotebookInjected'))).toBe(false);
    expect(await savedNotebook(page)).toEqual(stored);
    const tampered = Buffer.from(completeNotice); tampered[0] = tampered[0] === 65 ? 66 : 65;
    const noticeRoute = `**/data/editions/${edition.noticePath}`;
    await page.route(noticeRoute, request => request.fulfill({ status: 200, contentType: 'text/plain;charset=utf-8', body: tampered }));
    let unexpectedDownloads = 0;
    const countDownload = () => { unexpectedDownloads++; };
    page.on('download', countDownload);
    await notebook(page).getByRole('button', { name: 'Export study notebook', exact: true }).click();
    await expect(notebook(page).getByRole('alert')).toContainText(/notice checksum|notice.*validation|source.*checksum/i);
    await expect(notebook(page).getByRole('button', { name: 'Export study notebook', exact: true })).toBeEnabled();
    expect(unexpectedDownloads).toBe(0); expect(await savedNotebook(page)).toEqual(stored);
    page.off('download', countDownload); await page.unroute(noticeRoute);
    const retried = await downloadedText(page, 'Export study notebook'); expect(retried.text).toContain(completeNotice);
  });
});

test('saved Gospel notes and pinned downloaded sources reopen through the real service worker with the network offline', async ({ page, context }, testInfo) => {
  await openNotebook(page); await saveNew(page, 'Offline Sower study', 'My local note remains available without an internet connection.');
  const stored = await savedNotebook(page), row = stored.rows[0];
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const downloads = page.locator('.gospel-downloads');
  await downloads.locator(':scope > summary').click();
  await downloads.getByRole('button', { name: 'Download or verify these Gospel books', exact: true }).click();
  await expect(downloads.getByRole('status')).toHaveText('Selected Gospel books and included source notices are verified for offline reading on this device.');
  await context.setOffline(true);
  try {
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);
    expect(await page.evaluate(async () => { try { await fetch(`unavailable-notebook-network-probe-${Date.now()}.json`, { cache: 'no-store' }); return false; } catch { return true; } })).toBe(true);
    await page.reload(); await sower(page); await expandNotebook(page);
    await selectStudy(page, row.id); await sower(page);
    await expect(notebook(page).getByLabel('Private Gospel notes', { exact: true })).toHaveValue(row.note);
    expect(await savedNotebook(page)).toEqual(stored);
    const backup = await exportedBackup(page); expect(backup.workspace.rows).toEqual(stored.rows);
    await notebook(page).screenshot({ path: testInfo.outputPath('gospel-notebook-offline.png'), animations: 'disabled' });
  } finally { await context.setOffline(false); }
});

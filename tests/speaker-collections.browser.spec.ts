import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Book, Manifest } from '../src/types';
import type { SpeechCollectionsState, SpeechPin } from '../src/speakers/collection-model';

const databaseName = 'adigun-aibible-speech-collections';
const route = '#/speakers/JHN/3?verse=3&edition=eng-bsb';
const sourceManifest: Manifest = JSON.parse(readFileSync(new URL('../data/editions/eng-bsb/manifest.json', import.meta.url), 'utf8'));
const sourceBook = (bookId: string): Book => JSON.parse(readFileSync(new URL(`../data/editions/eng-bsb/books/${bookId}.json`, import.meta.url), 'utf8'));
const collections = (page: Page) => page.getByRole('region', { name: 'Private speech collections', exact: true });
const savedSpeech = (page: Page) => page.getByRole('region', { name: 'Saved speech and context', exact: true });
type Backup = { kind: string; version: number; workspace: SpeechCollectionsState };

function sourceSpeech(bookId = 'JHN', chapter = 3, number = 3) {
  const book = sourceBook(bookId), verse = book.chapters.find(value => value.number === chapter)!.verses.find(value => value.number === number)!;
  const span = verse.characterSpans!.find(value => value.marker === 'wj')!;
  return { book, verse, span, text: Array.from(verse.text).slice(span.start, span.end).join('') };
}
function sourcePin(bookId = 'JHN', chapter = 3, number = 3): SpeechPin {
  const { book, verse, span } = sourceSpeech(bookId, chapter, number), edition = sourceManifest.edition;
  return {
    id: `eng-bsb:${bookId}:${chapter}:${number}:${span.start}-${span.end}`,
    reference: { bookId, chapter, verse: number, editionId: 'eng-bsb' },
    editionSha256: edition.sha256!, sourceTextHash: createHash('sha256').update(verse.text).digest('hex'),
    editionName: edition.name, bookName: book.name, language: edition.language, sourceUrl: edition.sourceUrl,
    marker: 'wj', offsetUnit: 'unicode-codepoint', start: span.start, end: span.end,
  };
}
function fixtureBackup(pin = sourcePin(), title = 'Isolated browser collection'): Backup {
  return { kind: 'adigun-speech-collections', version: 1, workspace: { schemaVersion: 1, revision: 0, collections: [{
    id: 'browser-fixture-collection', title, entries: [pin], createdAt: '2026-11-05T12:00:00.000Z', updatedAt: '2026-11-05T12:00:00.000Z',
  }] } };
}
async function readCollections(page: Page): Promise<SpeechCollectionsState | undefined> {
  return page.evaluate(name => new Promise<SpeechCollectionsState | undefined>((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, transaction = db.transaction('workspace', 'readonly'), read = transaction.objectStore('workspace').get('private');
      transaction.oncomplete = () => { db.close(); resolve(read.result); };
      transaction.onabort = () => { db.close(); reject(transaction.error || new Error('Collection read did not complete.')); };
    };
  }), databaseName);
}
async function stored(page: Page): Promise<SpeechCollectionsState> {
  const state = await readCollections(page); expect(state).toBeDefined(); return state!;
}
async function writeCollections(page: Page, state: SpeechCollectionsState) {
  await page.evaluate(({ name, state }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('workspace');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, transaction = db.transaction('workspace', 'readwrite');
      transaction.objectStore('workspace').put(state, 'private');
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onabort = () => { db.close(); reject(transaction.error || new Error('Collection fixture did not commit.')); };
    };
  }), { name: databaseName, state });
}
async function openCollections(page: Page, ready = true) {
  await page.goto(route);
  await expect(collections(page).getByRole('heading', { name: 'My speech collections', exact: true })).toBeVisible();
  if (ready) await expect(collections(page).getByRole('button', { name: 'Download collection backup', exact: true })).toBeEnabled();
}
async function createCollection(page: Page, title: string) {
  await collections(page).getByLabel('Collection name', { exact: true }).fill(title);
  await collections(page).getByRole('button', { name: 'Create collection', exact: true }).click();
  await expect.poll(async () => (await readCollections(page))?.collections.some(row => row.title === title)).toBe(true);
}
async function findSpeech(page: Page, verse: number) {
  if (await page.getByLabel('Find words in marked speech', { exact: true }).count() === 0) {
    await expect(page.getByLabel('Book scope').locator('option[value="JHN"]')).toHaveCount(1);
    await page.getByLabel('Book scope', { exact: true }).selectOption('JHN');
    await page.getByRole('button', { name: 'Load publisher-marked speech', exact: true }).click();
  }
  await page.getByLabel('Find words in marked speech', { exact: true }).fill(verse === 3 ? 'no one can see the kingdom of God' : 'no one can enter the kingdom of God');
  const result = page.locator('.speaker-result').filter({ has: page.getByRole('heading', { name: `John 3:${verse}`, exact: true }) });
  await expect(result).toHaveCount(1); return result;
}
async function addSpeech(page: Page, verse = 3) {
  await (await findSpeech(page, verse)).getByRole('button', { name: 'Collect marked speech', exact: true }).click();
  await page.getByRole('region', { name: 'Speech to collect', exact: true }).getByRole('button', { name: 'Add marked speech', exact: true }).click();
  await expect.poll(async () => (await stored(page)).collections[0].entries.some(pin => pin.reference.verse === verse)).toBe(true);
}
async function download(page: Page, button: string) {
  const pending = page.waitForEvent('download');
  await collections(page).getByRole('button', { name: button, exact: true }).click();
  const value = await pending, path = await value.path(); expect(path).not.toBeNull();
  return { filename: value.suggestedFilename(), text: readFileSync(path!, 'utf8') };
}
async function backup(page: Page): Promise<Backup> {
  const result = await download(page, 'Download collection backup'), value = JSON.parse(result.text) as Backup;
  expect(value.kind).toBe('adigun-speech-collections'); expect(value.version).toBe(1); expect(value.workspace.revision).toBe(0); return value;
}
async function restore(page: Page, value: unknown) {
  await collections(page).getByLabel('Restore collection backup', { exact: true }).setInputFiles({ name: 'speech-collections.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
}
async function openCollection(page: Page, title: string) {
  await collections(page).getByRole('button', { name: `Open collection ${title}`, exact: true }).click();
  await expect(collections(page).getByLabel('Collection name', { exact: true })).toHaveValue(title);
}

test('private speech collections save exact publisher pins, reopen full context and keep names out of public URLs', async ({ page }) => {
  const title = 'Àlàáfíà — my private sayings', requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await openCollections(page); await createCollection(page, title); await addSpeech(page);
  const original = await stored(page), pin = original.collections[0].entries[0];
  expect(pin).toEqual(sourcePin());
  const exported = await backup(page);
  expect(exported.workspace.collections).toEqual(original.collections);
  expect(JSON.stringify(exported)).not.toContain(sourceSpeech().verse.text);
  expect(Object.keys(pin).sort()).toEqual(['bookName', 'editionName', 'editionSha256', 'end', 'id', 'language', 'marker', 'offsetUnit', 'reference', 'sourceTextHash', 'sourceUrl', 'start']);
  expect(decodeURIComponent(page.url())).not.toContain(title);
  expect(requests.some(url => decodeURIComponent(url).includes(title))).toBe(false);
  await page.reload(); await openCollection(page, title);
  await collections(page).getByRole('button', { name: 'Read saved speech', exact: true }).click();
  await expect(savedSpeech(page).locator('blockquote')).toHaveText(sourceSpeech().text);
  await expect(savedSpeech(page)).toContainText('Publisher annotation · not independent review');
  await expect(savedSpeech(page).locator('.speaker-full-verse')).toHaveText(sourceSpeech().verse.text);
  expect(await stored(page)).toEqual(original);
  await savedSpeech(page).getByRole('button', { name: 'Open saved speech context', exact: true }).click();
  await expect(page).toHaveURL(/#\/read\/JHN\/3\?verse=3.*edition=eng-bsb/);
  await expect.poll(async () => (await page.locator('#verse-3 [data-source-run]').allTextContents()).join('')).toBe(sourceSpeech().verse.text);
});

test('ordered saved speech survives keyboard actions, removal and Undo with accessible narrow layouts', async ({ page, isMobile }, testInfo) => {
  const title = 'Two exact passages';
  await openCollections(page); await createCollection(page, title); await addSpeech(page, 3); await addSpeech(page, 5);
  const original = (await stored(page)).collections[0];
  const cards = collections(page).locator('.speech-collection-entry');
  await expect(cards).toHaveCount(2);
  await cards.nth(1).getByRole('button', { name: 'Move speech earlier', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await stored(page)).collections[0].entries.map(pin => pin.reference.verse)).toEqual([5, 3]);
  await cards.first().getByRole('button', { name: 'Move speech later', exact: true }).click();
  await expect.poll(async () => (await stored(page)).collections[0].entries.map(pin => pin.reference.verse)).toEqual([3, 5]);
  await cards.first().getByRole('button', { name: 'Remove saved speech', exact: true }).click();
  await expect.poll(async () => (await stored(page)).collections[0].entries.map(pin => pin.reference.verse)).toEqual([5]);
  await collections(page).getByRole('button', { name: 'Undo last removal', exact: true }).click();
  await expect.poll(async () => (await stored(page)).collections[0].entries).toEqual(original.entries);
  await page.setViewportSize({ width: isMobile ? 390 : 1440, height: isMobile ? 844 : 900 });
  await collections(page).screenshot({ path: testInfo.outputPath('speech-collections-native.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await collections(page).screenshot({ path: testInfo.outputPath('speech-collections-320.png'), animations: 'disabled' });
  await cards.first().getByRole('button', { name: 'Read saved speech', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(savedSpeech(page).locator('blockquote')).toHaveText(sourceSpeech().text);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  page.once('dialog', dialog => dialog.accept());
  await collections(page).getByRole('button', { name: 'Delete collection', exact: true }).click();
  await expect.poll(async () => (await stored(page)).collections.length).toBe(0);
  await collections(page).getByRole('button', { name: 'Undo last removal', exact: true }).click();
  await expect.poll(async () => (await stored(page)).collections[0].entries).toEqual(original.entries);
  await openCollection(page, title);
  await expect(cards).toHaveCount(2);
});

test('collection restore previews conflicts and rejects malformed, forged and stale pins without replacing device records', async ({ page }) => {
  await openCollections(page); await createCollection(page, 'Device collection'); await addSpeech(page);
  const original = await backup(page), incoming = structuredClone(original);
  incoming.workspace.collections[0].title = 'Backup collection';
  await restore(page, incoming);
  const preview = collections(page).getByRole('region', { name: 'Speech collection restore preview', exact: true });
  await expect(preview).toContainText('1 conflicting collections');
  await preview.getByLabel('Restore conflicts', { exact: true }).selectOption('keep-device');
  await preview.getByRole('button', { name: 'Merge collection backup', exact: true }).click();
  await expect(preview).toHaveCount(0);
  expect((await stored(page)).collections).toEqual(original.workspace.collections);
  await restore(page, incoming); await expect(preview).toContainText('1 conflicting collections');
  await preview.getByLabel('Restore conflicts', { exact: true }).selectOption('use-backup');
  await preview.getByRole('button', { name: 'Merge collection backup', exact: true }).click();
  await expect.poll(async () => (await stored(page)).collections[0].title).toBe('Backup collection');
  const preserved = await stored(page);
  const stale = structuredClone(incoming); stale.workspace.collections[0].entries[0].editionSha256 = '0'.repeat(64);
  const changedWords = structuredClone(incoming); changedWords.workspace.collections[0].entries[0].sourceTextHash = '0'.repeat(64);
  const relabelled = structuredClone(incoming); relabelled.workspace.collections[0].entries[0].bookName = 'Forged publisher label';
  for (const [value, error] of [
    [{ ...incoming, approved: true }, /unknown.*fields/i],
    [stale, /different source revision/i],
    [changedWords, /source wording changed/i],
    [relabelled, /source label.*changed|source label.*unavailable/i],
  ] as const) {
    await restore(page, value);
    await expect(collections(page).getByRole('alert').last()).toContainText(error);
    expect(await stored(page)).toEqual(preserved);
  }
  await collections(page).getByLabel('Restore collection backup', { exact: true }).setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{ broken') });
  await expect(collections(page).getByRole('alert').last()).toContainText('not valid JSON');
  expect(await stored(page)).toEqual(preserved);
  await collections(page).getByLabel('Restore collection backup', { exact: true }).setInputFiles({ name: 'large.json', mimeType: 'application/json', buffer: Buffer.alloc(2 * 1024 * 1024 + 1, 32) });
  await expect(collections(page).getByRole('alert').last()).toContainText('no larger than 2 MiB');
  expect(await stored(page)).toEqual(preserved);
});

test('a stale speech collection editor survives Reload and cannot overwrite the newer saved name', async ({ page, context }) => {
  await openCollections(page); await createCollection(page, 'Original name'); await addSpeech(page);
  const other = await context.newPage();
  try {
    await openCollections(other); await openCollection(other, 'Original name');
    await collections(page).getByLabel('Collection name', { exact: true }).fill('First tab saved name');
    await collections(page).getByRole('button', { name: 'Save collection name', exact: true }).click();
    await expect.poll(async () => (await stored(page)).collections[0].title).toBe('First tab saved name');
    const winner = await stored(page);
    await collections(other).getByLabel('Collection name', { exact: true }).fill('Keep my second-tab draft');
    await collections(other).getByRole('button', { name: 'Save collection name', exact: true }).click();
    await expect(collections(other).getByRole('alert').last()).toContainText(/another tab|newer|changed/i);
    expect(await stored(other)).toEqual(winner);
    const draft = await download(other, 'Download collection draft'); expect(draft.text).toContain('Keep my second-tab draft');
    await collections(other).getByRole('button', { name: 'Reload saved collections', exact: true }).click();
    await expect(collections(other).getByRole('button', { name: 'Save collection name', exact: true })).toBeEnabled();
    await expect(collections(other).getByLabel('Collection name', { exact: true })).toHaveValue('Keep my second-tab draft');
    await collections(other).getByRole('button', { name: 'Save collection name', exact: true }).click();
    await expect(collections(other).getByRole('alert').last()).toContainText(/changed|newer|conflict/i);
    expect(await stored(other)).toEqual(winner);
    await collections(other).getByRole('button', { name: 'Save name as new collection', exact: true }).click();
    await expect.poll(async () => (await stored(other)).collections.length).toBe(2);
    const recovered = await stored(other);
    expect(recovered.collections[0]).toEqual(winner.collections[0]);
    expect(recovered.collections[1].title).toBe('Keep my second-tab draft');
    expect(recovered.collections[1].id).not.toBe(winner.collections[0].id);
    expect(recovered.collections[1].entries).toEqual(winner.collections[0].entries);
  } finally { await other.close(); }
});

type TransactionGate = { holdWrite: boolean; writing: boolean; completedWrites: number };
type GatedWindow = typeof window & { speechCollectionGate: TransactionGate };
async function installTransactionGate(page: Page) {
  await page.addInitScript(name => {
    const gate: TransactionGate = { holdWrite: false, writing: false, completedWrites: 0 };
    (window as GatedWindow).speechCollectionGate = gate;
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args: Parameters<IDBDatabase['transaction']>) {
      const transaction = Reflect.apply(original, this, args) as IDBTransaction;
      if (this.name !== name || transaction.mode !== 'readwrite' || !transaction.objectStoreNames.contains('workspace')) return transaction;
      gate.writing = true;
      transaction.addEventListener('complete', () => { gate.writing = false; gate.completedWrites++; });
      // Keep the native transaction open; success still requires its actual completion.
      const keepAlive = () => {
        if (gate.holdWrite) transaction.objectStore('workspace').get('browser-acceptance-keepalive').addEventListener('success', keepAlive);
      };
      keepAlive(); return transaction;
    };
  }, databaseName);
}

test.describe('speech collection source and storage failure boundaries', () => {
  test.use({ serviceWorkers: 'block' });

  test('changed source wording and changed publisher boundaries cannot reopen as the previously saved speech', async ({ page }) => {
    const title = 'Retain the original source pins';
    await openCollections(page); await createCollection(page, title); await addSpeech(page);
    const original = await stored(page), sourceRoute = '**/data/editions/eng-bsb/books/JHN.json';
    for (const kind of ['wording', 'markings'] as const) {
      const altered = sourceBook('JHN'), verse = altered.chapters.find(value => value.number === 3)!.verses.find(value => value.number === 3)!;
      if (kind === 'wording') verse.text += ' Controlled browser-test change.';
      else verse.characterSpans!.find(value => value.marker === 'wj')!.start++;
      await page.route(sourceRoute, request => request.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(altered) }));
      try {
        await page.reload(); await openCollection(page, title);
        await collections(page).getByRole('button', { name: 'Read saved speech', exact: true }).click();
        await expect(collections(page).getByRole('alert').last()).toContainText(kind === 'wording' ? /source wording changed/i : /marking.*changed|boundaries.*changed|annotations differ/i);
        await expect(savedSpeech(page)).toHaveCount(0);
        expect(await stored(page)).toEqual(original);
        expect((await backup(page)).workspace.collections).toEqual(original.collections);
      } finally { await page.unroute(sourceRoute); }
    }
    await page.reload(); await openCollection(page, title);
    await collections(page).getByRole('button', { name: 'Read saved speech', exact: true }).click();
    await expect(savedSpeech(page).locator('blockquote')).toHaveText(sourceSpeech().text);
  });

  test('storage denial leaves an independently downloadable name draft and a deliberate retry can save it', async ({ page }) => {
    await page.addInitScript(name => {
      const original = IDBFactory.prototype.open;
      (window as typeof window & { restoreSpeechStorage: () => void }).restoreSpeechStorage = () => { IDBFactory.prototype.open = original; };
      IDBFactory.prototype.open = function (this: IDBFactory, database: string, version?: number) {
        if (database === name) throw new DOMException('Controlled speech collection storage denial.', 'SecurityError');
        return version === undefined ? original.call(this, database) : original.call(this, database, version);
      };
    }, databaseName);
    await openCollections(page, false);
    await expect(collections(page).getByRole('alert')).toContainText('may be denied');
    await expect(collections(page).getByRole('button', { name: 'Create collection', exact: true })).toBeDisabled();
    await collections(page).getByLabel('Collection name', { exact: true }).fill('Àlàáfíà survives storage denial');
    const draft = await download(page, 'Download collection draft');
    expect(draft.text).toContain('Àlàáfíà survives storage denial'); expect(draft.text).toContain('PRIVATE DRAFT');
    await page.evaluate(() => (window as typeof window & { restoreSpeechStorage: () => void }).restoreSpeechStorage());
    await collections(page).getByRole('button', { name: 'Reload saved collections', exact: true }).click();
    await expect(collections(page).getByRole('button', { name: 'Create collection', exact: true })).toBeEnabled();
    await expect(collections(page).getByLabel('Collection name', { exact: true })).toHaveValue('Àlàáfíà survives storage denial');
    await collections(page).getByRole('button', { name: 'Create collection', exact: true }).click();
    await expect.poll(async () => (await readCollections(page))?.collections[0]?.title).toBe('Àlàáfíà survives storage denial');
  });

  test('quota failures and real transaction aborts preserve the saved collection and unsaved name until retry', async ({ page }) => {
    await openCollections(page); await createCollection(page, 'A saved collection'); await addSpeech(page);
    const original = await stored(page), draftTitle = 'Recover this unsaved collection name';
    await collections(page).getByLabel('Collection name', { exact: true }).fill(draftTitle);
    for (const mode of ['quota', 'abort'] as const) {
      await page.evaluate(({ name, mode }) => {
        const original = IDBObjectStore.prototype.put;
        (window as typeof window & { restoreSpeechPut: () => void }).restoreSpeechPut = () => { IDBObjectStore.prototype.put = original; };
        IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
          if (this.transaction.db.name !== name) return Reflect.apply(original, this, args) as IDBRequest;
          if (mode === 'quota') throw new DOMException('Controlled speech collection quota failure.', 'QuotaExceededError');
          const request = Reflect.apply(original, this, args) as IDBRequest;
          request.addEventListener('success', () => this.transaction.abort(), { once: true }); return request;
        };
      }, { name: databaseName, mode });
      try {
        await collections(page).getByRole('button', { name: 'Save collection name', exact: true }).click();
        await expect(collections(page).getByRole('alert').last()).toContainText('Speech collections were not saved');
        await expect(collections(page).getByRole('button', { name: 'Save collection name', exact: true })).toBeEnabled();
        await expect(collections(page).getByLabel('Collection name', { exact: true })).toHaveValue(draftTitle);
        expect(await stored(page)).toEqual(original);
        expect((await download(page, 'Download collection draft')).text).toContain(draftTitle);
        expect((await backup(page)).workspace.collections).toEqual(original.collections);
      } finally { await page.evaluate(() => (window as typeof window & { restoreSpeechPut: () => void }).restoreSpeechPut()); }
    }
    await collections(page).getByRole('button', { name: 'Save collection name', exact: true }).click();
    await expect.poll(async () => (await stored(page)).collections[0].title).toBe(draftTitle);
    expect((await stored(page)).collections[0].entries).toEqual(original.collections[0].entries);
  });

  test('a pending actual collection commit blocks navigation and updates until transaction completion', async ({ page }) => {
    await installTransactionGate(page); await openCollections(page);
    const title = 'Wait for the actual collection commit', originalHash = new URL(page.url()).hash;
    await collections(page).getByLabel('Collection name', { exact: true }).fill(title);
    await page.evaluate(() => { (window as GatedWindow).speechCollectionGate.holdWrite = true; });
    try {
      await collections(page).getByRole('button', { name: 'Create collection', exact: true }).click();
      await page.waitForFunction(() => (window as GatedWindow).speechCollectionGate.writing);
      await expect(collections(page).getByLabel('Collection name', { exact: true })).toBeDisabled();
      await expect(collections(page).getByRole('button', { name: 'Cancel source check', exact: true })).toHaveCount(0);
      await expect(collections(page).getByText('Private collection created.', { exact: false })).toHaveCount(0);
      expect(await page.evaluate(() => window.dispatchEvent(new Event('adigun:before-update', { cancelable: true })))).toBe(false);
      await page.goto('#/sources/JHN/3?verse=3&edition=eng-bsb');
      await expect(page).toHaveURL(url => url.hash === originalHash);
      expect((await download(page, 'Download collection draft')).text).toContain(title);
      expect(await page.evaluate(() => (window as GatedWindow).speechCollectionGate.completedWrites)).toBe(0);
    } finally { await page.evaluate(() => { (window as GatedWindow).speechCollectionGate.holdWrite = false; }); }
    await expect.poll(async () => (await stored(page)).collections[0].title).toBe(title);
    await page.goto('#/sources/JHN/3?verse=3&edition=eng-bsb');
    await expect(page.getByRole('heading', { name: 'Sources & coverage', exact: true })).toBeVisible();
  });

  test('cancelling delayed restore checks prevents late sources from replacing an earlier preview or later name draft', async ({ page }) => {
    await openCollections(page); await createCollection(page, 'Keep this saved collection'); await addSpeech(page);
    const original = await stored(page), originalBackup = await backup(page);
    await restore(page, originalBackup);
    const preview = collections(page).getByRole('region', { name: 'Speech collection restore preview', exact: true });
    await expect(preview).toContainText('1 identical');
    const previousPreview = await preview.innerText();
    let release!: () => void, started!: () => void, finished!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const begun = new Promise<void>(resolve => { started = resolve; }), done = new Promise<void>(resolve => { finished = resolve; });
    await page.route('**/data/editions/eng-bsb/books/MAT.json', async request => {
      const response = await request.fetch(); started(); await gate;
      try { await request.fulfill({ response }); } finally { finished(); }
    });
    try {
      await restore(page, fixtureBackup(sourcePin('MAT', 5, 3), 'Delayed source collection')); await begun;
      await collections(page).getByRole('button', { name: 'Cancel source check', exact: true }).click();
      await expect(collections(page).getByLabel('Collection name', { exact: true })).toBeEnabled();
      await collections(page).getByLabel('Collection name', { exact: true }).fill('My later unsaved name');
      const received = page.waitForEvent('requestfinished', { predicate: request => request.url().endsWith('/data/editions/eng-bsb/books/MAT.json') });
      release(); await done; await received;
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await expect(preview).toHaveText(previousPreview);
      await expect(collections(page).getByLabel('Collection name', { exact: true })).toHaveValue('My later unsaved name');
      expect(await stored(page)).toEqual(original);
      await expect(collections(page).getByRole('button', { name: 'Open collection Delayed source collection', exact: true })).toHaveCount(0);
    } finally { release(); }
  });

  test('collection work preserves an open correction draft and both names remain guarded without requiring source access for recovery', async ({ page }) => {
    await openCollections(page); await createCollection(page, 'Separate private records');
    const result = await findSpeech(page, 3);
    await result.getByRole('button', { name: 'Suggest correction', exact: true }).click();
    const correction = page.getByRole('region', { name: 'Speaker correction proposal', exact: true });
    const reason = 'Private correction reasoning stays separate from my collection.';
    await correction.getByLabel('Your reason and supporting evidence', { exact: true }).fill(reason);
    await collections(page).getByLabel('Collection name', { exact: true }).fill('My unsaved collection name');
    await result.getByRole('button', { name: 'Collect marked speech', exact: true }).click();
    await page.getByRole('region', { name: 'Speech to collect', exact: true }).getByRole('button', { name: 'Add marked speech', exact: true }).click();
    await expect.poll(async () => (await stored(page)).collections[0].entries.length).toBe(1);
    await expect(correction.getByLabel('Your reason and supporting evidence', { exact: true })).toHaveValue(reason);
    await expect(collections(page).getByLabel('Collection name', { exact: true })).toHaveValue('My unsaved collection name');
    page.on('dialog', dialog => dialog.dismiss());
    await page.getByLabel('Speech source edition', { exact: true }).selectOption('eng-web');
    await expect(page.getByLabel('Speech source edition', { exact: true })).toHaveValue('eng-bsb');
    await expect(correction.getByLabel('Your reason and supporting evidence', { exact: true })).toHaveValue(reason);
    await expect(collections(page).getByLabel('Collection name', { exact: true })).toHaveValue('My unsaved collection name');
    expect(await page.evaluate(() => window.dispatchEvent(new Event('adigun:before-update', { cancelable: true })))).toBe(false);
    await page.route('**/data/**', request => request.abort());
    const draft = await download(page, 'Download collection draft');
    expect(draft.text).toContain('My unsaved collection name'); expect(draft.text).not.toContain(reason);
    expect((await backup(page)).workspace.collections[0].title).toBe('Separate private records');
  });
});

test('explicitly downloaded source books and private speech collections reopen through the real service worker offline', async ({ page, context }, testInfo) => {
  test.setTimeout(90_000);
  const title = 'Offline source-grounded collection';
  await openCollections(page); await createCollection(page, title); await addSpeech(page);
  const original = await stored(page);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.goto('#/settings/JHN/3?verse=3&edition=eng-bsb');
  await page.getByRole('button', { name: 'Download current book', exact: true }).click();
  await expect(page.getByText('John is available offline.', { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.goto(route); await openCollection(page, title);
  await context.setOffline(true);
  try {
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);
    expect(await page.evaluate(async () => { try { await fetch(`unavailable-speech-network-probe-${Date.now()}.json`, { cache: 'no-store' }); return false; } catch { return true; } })).toBe(true);
    await page.reload(); await openCollection(page, title);
    await collections(page).getByRole('button', { name: 'Read saved speech', exact: true }).click();
    await expect(savedSpeech(page).locator('blockquote')).toHaveText(sourceSpeech().text);
    await expect(savedSpeech(page).locator('.speaker-full-verse')).toHaveText(sourceSpeech().verse.text);
    expect(await stored(page)).toEqual(original);
    expect((await backup(page)).workspace.collections).toEqual(original.collections);
    await savedSpeech(page).screenshot({ path: testInfo.outputPath('speech-collection-offline.png'), animations: 'disabled' });
  } finally { await context.setOffline(false); }
});

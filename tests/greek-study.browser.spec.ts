import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

interface Token { sourceLine: number; ordinal: number; text: string; word: string; normalized: string; lemma: string; partOfSpeech: string; parsing: string }
interface Verse { number: string; reference: string; tokens: Token[] }
interface Book { sourceFile: string; chapters: { number: string; verses: Verse[] }[] }
const root = new URL('../data/original-language/morphgnt-sblgnt/', import.meta.url);
const prefix = 'data/original-language/morphgnt-sblgnt/';
const sourceBook = (id: string): Book => JSON.parse(readFileSync(new URL(`books/${id}.json`, root), 'utf8'));
const sourceVerse = (id: string, chapter: string, verse: string) => sourceBook(id).chapters.find(row => row.number === chapter)!.verses.find(row => row.number === verse)!;
const sourceText = (id: string, chapter: string, verse: string) => sourceVerse(id, chapter, verse).tokens.map(token => token.text).join(' ');
const baseRoute = '#/greek-study/JHN/3?verse=16&end=18&edition=eng-bsb';
const route = (book: string, chapter: string, verse: string) => `${baseRoute}&greekBook=${book}&greekChapter=${chapter}&greekVerse=${verse}`;
const verified = 'Source book, morphology key and all source notices verified on this device.';

test('the independent Greek reader retains exact source fields and keyboard token order', async ({ page }, testInfo) => {
  await page.goto(baseRoute);
  await expect(page.getByRole('heading', { name: 'Greek source study', exact: true })).toBeVisible();
  await expect(page.getByTestId('greek-source-reference')).toContainText('010101');
  expect(await page.getByTestId('greek-main-text').textContent()).toBe(sourceText('Mt', '1', '1'));
  const first = page.locator('#greek-token-1'); await first.focus(); await page.keyboard.press('Enter');
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  expect(await page.getByTestId('greek-selected-text').textContent()).toBe('Βίβλος');
  await expect(page.getByTestId('greek-source-line')).toHaveText('1');
  await expect(page.locator('[data-source-field="normalized"]')).toHaveText('βίβλος');
  await page.keyboard.press('ArrowRight'); await expect(page.locator('#greek-token-2')).toBeFocused();
  await expect(page.getByTestId('greek-source-line')).toHaveText('2');
  await page.keyboard.press('End'); await expect(page.locator('#greek-token-8')).toBeFocused();
  await expect(page.locator('[data-source-field="text"]')).toHaveText('Ἀβραάμ.');
  await expect(page.locator('[data-source-field="word"]')).toHaveText('Ἀβραάμ');
  expect(new URL(page.url()).hash).toBe(baseRoute);
  await page.getByText('Accessible source token list (8)', { exact: true }).click();
  await page.getByRole('button', { name: 'Inspect row 6, token 6', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Source token details', exact: true })).toBeFocused();
  await expect(page.locator('[data-source-field="text"]')).toHaveText('Δαυὶδ');
  await testInfo.attach('greek-source-reader', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
});

test('actual normalized parentheses, apparatus signs and unknown case V stay literal at 320px', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto(route('Mt', '1', '2'));
  await page.locator('#greek-token-10').click();
  await expect(page.locator('[data-source-field="text"]')).toHaveText('ἐγέννησεν');
  await expect(page.locator('[data-source-field="normalized"]')).toHaveText('ἐγέννησε(ν)');
  await page.getByRole('combobox', { name: 'Source verse', exact: true }).selectOption('5');
  expect(await page.getByTestId('greek-main-text').textContent()).toBe(sourceText('Mt', '1', '5'));
  await expect(page.locator('#greek-token-67')).toHaveText('⸂Βόες');
  await page.getByRole('combobox', { name: 'Source verse', exact: true }).selectOption('20');
  await page.locator('#greek-token-330').click();
  await expect(page.locator('[data-source-field="parsing"]')).toHaveText('----VSM-');
  await expect(page.locator('[data-parsing-position="case"]')).toContainText('Unknown in supplied key');
  await expect(page.locator('[data-parsing-position="case"]')).not.toContainText(/vocative/i);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await testInfo.attach('greek-source-320px', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
});

test('exact lemma lookup distinguishes token occurrences and represented verses and navigates a 25-row page', async ({ page }) => {
  const matches = sourceBook('Mt').chapters.flatMap(chapter => chapter.verses.flatMap(verse => verse.tokens.filter(token => token.lemma === 'ὁ').map(token => ({ chapter: chapter.number, verse: verse.number, token }))));
  await page.goto(baseRoute);
  await page.getByRole('textbox', { name: 'Exact supplied lemma field', exact: true }).fill('ὁ');
  await page.getByRole('button', { name: 'Find exact lemma occurrences', exact: true }).click();
  await expect(page.getByTestId('greek-lemma-occurrences')).toHaveText('2782');
  await expect(page.getByTestId('greek-lemma-verses')).toHaveText('973');
  await expect(page.locator('.greek-lemma-results li')).toHaveCount(25);
  await page.getByRole('button', { name: 'Next lemma result page', exact: true }).click();
  await expect(page.getByText('Page 2 of 112. Up to 25 source tokens per page.', { exact: true })).toBeVisible();
  await page.locator('.greek-lemma-results li').first().getByRole('button').click();
  await expect(page.getByTestId('greek-source-line')).toHaveText(String(matches[25].token.sourceLine));
  await expect(page.getByRole('heading', { name: 'Source token details', exact: true })).toBeFocused();
  expect(new URL(page.url()).hash).toBe(route('Mt', matches[25].chapter, matches[25].verse));
  await page.getByRole('textbox', { name: 'Exact supplied lemma field', exact: true }).fill(' ὁ');
  await expect(page.getByTestId('greek-lemma-occurrences')).toHaveCount(0);
  await page.getByRole('button', { name: 'Find exact lemma occurrences', exact: true }).click();
  await expect(page.getByTestId('greek-lemma-occurrences')).toHaveText('0');
});

test('John source gaps remain absent, invalid links fail explicitly and valid source selection recovers', async ({ page }) => {
  await page.goto(route('Jn', '7', '52')); await expect(page.getByTestId('greek-source-reference')).toContainText('040752');
  await expect(page.getByRole('button', { name: 'Next source verse', exact: true })).toBeDisabled();
  await page.getByRole('combobox', { name: 'Source chapter', exact: true }).selectOption('8');
  await expect(page.getByTestId('greek-source-reference')).toContainText('040812');
  const values = await page.getByRole('combobox', { name: 'Source verse', exact: true }).locator('option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value));
  expect(values[0]).toBe('12'); for (let number = 1; number <= 11; number++) expect(values).not.toContain(String(number));
  expect(await page.getByTestId('greek-main-text').textContent()).toBe(sourceText('Jn', '8', '12'));
  await page.evaluate(hash => { location.hash = hash; }, route('Jn', '8', '1'));
  await expect(page.getByRole('alert')).toContainText('This verse is absent from the pinned Greek source chapter.');
  await expect(page.getByTestId('greek-main-text')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open first Greek source passage', exact: true }).click();
  await expect(page.getByTestId('greek-source-reference')).toContainText('010101');
  expect(new URL(page.url()).hash).toBe(route('Mt', '1', '1'));
});

test('source-only hash changes and back/forward restore exact Greek coordinates without moving the Bible range', async ({ page }) => {
  await page.goto(route('Phm', '1', '1')); await expect(page.getByTestId('greek-source-reference')).toContainText('180101');
  await page.evaluate(hash => { location.hash = hash; }, route('3Jn', '1', '15'));
  await expect(page.getByTestId('greek-source-reference')).toContainText('250115');
  await page.goBack(); await expect(page.getByTestId('greek-source-reference')).toContainText('180101');
  await page.goForward(); await expect(page.getByTestId('greek-source-reference')).toContainText('250115');
  expect(new URL(page.url()).hash).toBe(route('3Jn', '1', '15'));
  await page.reload(); await expect(page.getByTestId('greek-source-reference')).toContainText('250115');
});

test('a selected source book and all five notices verify after genuine offline reload and scoped removal', async ({ page, context }) => {
  const files = ['books/Phm.json','manifest.json','morphology.json','source.json','integrity.json','notices/CC-BY-4.0.txt','notices/CC-BY-SA-3.0.txt','notices/MorphGNT-README.md','notices/SBLGNT-About.md','notices/SBLGNT-README.md'];
  const pins = files.map(path => ({ path, sha256: createHash('sha256').update(readFileSync(new URL(path, root))).digest('hex') }));
  await page.goto(route('Phm', '1', '1')); await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await expect(page.getByTestId('greek-source-reference')).toContainText('180101');
  await page.getByRole('button', { name: 'Download source book and notices', exact: true }).click();
  await expect(page.getByTestId('greek-download-status')).toHaveText(verified);
  await context.setOffline(true);
  try {
    await page.reload(); await expect(page.getByTestId('greek-source-reference')).toContainText('180101');
    expect(await page.getByTestId('greek-main-text').textContent()).toBe(sourceText('Phm', '1', '1'));
    await expect(page.getByTestId('greek-download-status')).toHaveText(verified);
    const actual = await page.evaluate(async ({ paths, prefix }) => {
      const base = new URL('/Adigun-AiBible/', location.origin), result = [];
      for (const path of paths) {
        const response = await fetch(new URL(prefix + path, base)); if (!response.ok) throw new Error(`Missing offline source notice or book: ${path}`);
        const bytes = await response.arrayBuffer(), sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
        result.push({ path, sha256 });
      }
      return result;
    }, { paths: files, prefix });
    expect(actual).toEqual(pins);
    await page.getByRole('textbox', { name: 'Exact supplied lemma field', exact: true }).fill('Παῦλος');
    await page.getByRole('button', { name: 'Find exact lemma occurrences', exact: true }).click();
    await expect(page.getByTestId('greek-lemma-occurrences')).not.toHaveText('0');
    await page.getByRole('button', { name: 'Remove source book download', exact: true }).click();
    await expect(page.getByTestId('greek-download-status')).toHaveText('Selected source book removed from offline storage. Shared source notices remain available.');
    await page.reload(); await expect(page.getByTestId('greek-main-text')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Retry Greek source', exact: true })).toBeVisible();
  } finally { await context.setOffline(false); }
});

test.describe('Greek source request boundaries', () => {
  test.use({ serviceWorkers: 'block' });
  test('opening the first source passage retries a failed first-book load even when its selection is unchanged', async ({ page }) => {
    const changed = Buffer.from(readFileSync(new URL('books/Mt.json', root))); changed[changed.length - 1] = 32;
    await page.route('**/data/original-language/morphgnt-sblgnt/books/Mt.json', request => request.fulfill({ status: 200, contentType: 'application/json', body: changed }));
    await page.goto(route('Mt', '1', '1'));
    await expect(page.getByText('The Greek source checksum changed. No changed source text was opened; update the application and retry.', { exact: true })).toBeVisible();
    await expect(page.getByTestId('greek-main-text')).toHaveCount(0);
    await page.unroute('**/data/original-language/morphgnt-sblgnt/books/Mt.json');
    await page.getByRole('button', { name: 'Open first Greek source passage', exact: true }).click();
    await expect(page.getByTestId('greek-source-reference')).toContainText('010101');
    expect(await page.getByTestId('greek-main-text').textContent()).toBe(sourceText('Mt', '1', '1'));
    expect(new URL(page.url()).hash).toBe(route('Mt', '1', '1'));
  });

  test('source corruption fails closed and a delayed abandoned book cannot replace the current selection', async ({ page }) => {
    const original = readFileSync(new URL('books/Phm.json', root)), changed = Buffer.from(original); changed[changed.length - 1] = 32;
    await page.route('**/data/original-language/morphgnt-sblgnt/books/Phm.json', request => request.fulfill({ status: 200, contentType: 'application/json', body: changed }));
    await page.goto(route('Phm', '1', '1'));
    await expect(page.getByText('The Greek source checksum changed. No changed source text was opened; update the application and retry.', { exact: true })).toBeVisible();
    await expect(page.getByTestId('greek-main-text')).toHaveCount(0);
    await page.unroute('**/data/original-language/morphgnt-sblgnt/books/Phm.json');
    await page.getByRole('button', { name: 'Retry Greek source', exact: true }).click();
    await expect(page.getByTestId('greek-source-reference')).toContainText('180101');
    let release!: () => void, begun!: () => void, finished!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { begun = resolve; }), done = new Promise<void>(resolve => { finished = resolve; });
    await page.route('**/data/original-language/morphgnt-sblgnt/books/Jn.json', async request => { begun(); await barrier; await request.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(new URL('books/Jn.json', root)) }).catch(() => undefined); finished(); });
    await page.getByRole('combobox', { name: 'Source book', exact: true }).selectOption('Jn'); await started;
    await expect(page.getByTestId('greek-main-text')).toHaveCount(0);
    await page.getByRole('combobox', { name: 'Source book', exact: true }).selectOption('3Jn');
    await expect(page.getByTestId('greek-source-reference')).toContainText('250101'); release(); await done;
    await expect(page.getByTestId('greek-source-reference')).toContainText('250101');
  });

  test('cancelled source loading and cancelled atomic downloads recover without retaining incomplete packs', async ({ page }) => {
    let release!: () => void, begun!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { begun = resolve; });
    await page.route('**/data/original-language/morphgnt-sblgnt/books/Phm.json', async request => { begun(); await barrier; await request.continue().catch(() => undefined); });
    await page.goto(route('Phm', '1', '1')); await started;
    await page.getByRole('button', { name: 'Cancel source loading', exact: true }).click();
    await expect(page.getByText('Source loading cancelled. Retry to open the selected Greek source book.', { exact: true })).toBeVisible();
    await expect(page.getByTestId('greek-main-text')).toHaveCount(0); release();
    await page.unroute('**/data/original-language/morphgnt-sblgnt/books/Phm.json');
    await page.getByRole('button', { name: 'Retry Greek source', exact: true }).click();
    await expect(page.getByTestId('greek-source-reference')).toContainText('180101');
    let releaseNotice!: () => void, noticeBegun!: () => void;
    const noticeBarrier = new Promise<void>(resolve => { releaseNotice = resolve; }), noticeStarted = new Promise<void>(resolve => { noticeBegun = resolve; });
    await page.route('**/data/original-language/morphgnt-sblgnt/notices/CC-BY-SA-3.0.txt', async request => { noticeBegun(); await noticeBarrier; await request.continue().catch(() => undefined); });
    await page.getByRole('button', { name: 'Download source book and notices', exact: true }).click(); await noticeStarted;
    expect(await page.evaluate(() => !window.dispatchEvent(new Event('adigun:before-update', { cancelable: true })))).toBe(true);
    await page.getByRole('button', { name: 'Cancel source download', exact: true }).click(); releaseNotice();
    await expect(page.getByText('Download cancelled. Existing complete packs are retained.', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.dispatchEvent(new Event('adigun:before-update', { cancelable: true })))).toBe(true);
    await expect(page.getByRole('button', { name: 'Download source book and notices', exact: true })).toBeEnabled();
    const committed = await page.evaluate(async () => {
      for (const name of await caches.keys()) for (const request of await (await caches.open(name)).keys()) if (request.url.endsWith('/__adigun_offline_pack__.json')) return true;
      return false;
    });
    expect(committed).toBe(false);
  });
});

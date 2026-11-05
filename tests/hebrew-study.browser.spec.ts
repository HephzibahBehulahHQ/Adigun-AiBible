import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

type Node = string | { tag: string; attributes: Record<string, string>; content: Node[] };
const root = new URL('../data/original-language/oshb/', import.meta.url);
const sourceBook = (id: string) => JSON.parse(readFileSync(new URL(`books/${id}.json`, root), 'utf8'));
const sourceVerse = (id: string, chapter: string, verse: string) => sourceBook(id).chapters.find((row: { number: string }) => row.number === chapter).verses.find((row: { number: string }) => row.number === verse);
const text = (node: Node): string => typeof node === 'string' ? node : node.content.map(text).join('');
const mainText = (id: string, chapter: string, verse: string) => sourceVerse(id, chapter, verse).content.filter((node: Node) => typeof node === 'string' || node.tag !== 'note').map(text).join('');
const baseRoute = '#/hebrew-study/JHN/3?verse=16&end=18&edition=eng-bsb';
const route = (book: string, chapter: string, verse: string) => `${baseRoute}&oshbBook=${book}&oshbChapter=${chapter}&oshbVerse=${verse}`;
const morphology = JSON.parse(readFileSync(new URL('morphology.json', root), 'utf8'));
test.use({ serviceWorkers: 'allow' });

test('independent source reading preserves Genesis Unicode and original word fields', async ({ page }, testInfo) => {
  await page.goto(baseRoute);
  await expect(page.getByRole('heading', { name: 'Hebrew and Aramaic source study', exact: true })).toBeVisible();
  await expect(page.getByTestId('hebrew-source-reference')).toHaveText('OSHB Gen.1.1');
  expect(await page.getByTestId('hebrew-main-text').textContent()).toBe(mainText('Gen','1','1'));
  const first = page.getByTestId('hebrew-main-text').locator('[data-word-id="01xeN"]');
  await first.focus(); await page.keyboard.press('Enter');
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  expect(await page.getByTestId('hebrew-selected-word').textContent()).toBe('בְּ/רֵאשִׁ֖ית');
  expect(await page.getByTestId('hebrew-morphology-description').textContent()).toBe(morphology.codes['HR/Ncfsa']);
  await expect(page.locator('.hebrew-word-details')).toContainText('b/7225');
  await expect(page).toHaveURL(new RegExp('#/hebrew-study/JHN/3\\?verse=16&end=18&edition=eng-bsb$'));
  await page.getByText('Main-text word list (7)', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Inspect 01TyA', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('hebrew-source-reader.png'), fullPage: true });
});

test('empty and multiword qere remain visible separately, and unknown morphology stays raw', async ({ page }) => {
  await page.goto(route('Ruth','3','12'));
  await expect(page.getByTestId('hebrew-source-reference')).toHaveText('OSHB Ruth.3.12');
  await expect(page.getByText('The source supplies an empty qere reading.', { exact: true })).toBeVisible();
  await expect(page.getByTestId('hebrew-main-text').locator('[data-word-id="08tQE"]')).toHaveAttribute('data-source-type','x-ketiv');
  await page.getByRole('combobox', { name: 'Source book', exact: true }).selectOption('Ezek');
  await page.getByRole('combobox', { name: 'Source chapter', exact: true }).selectOption('8');
  await page.getByRole('combobox', { name: 'Source verse', exact: true }).selectOption('6');
  await expect(page.getByTestId('hebrew-source-reference')).toHaveText('OSHB Ezek.8.6');
  const qere = page.locator('[data-reading-type="x-qere"]');
  await expect(qere.locator('button[data-word-id]')).toHaveCount(2);
  await expect(page.getByTestId('hebrew-main-text').locator('[data-word-id="26vua"]')).toHaveCount(0);
  await qere.locator('[data-word-id="26vua"]').click();
  await expect(page.getByText('This word belongs to a source reading alternative, separately from the main text.', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Source chapter', exact: true }).selectOption('37');
  await page.getByRole('combobox', { name: 'Source verse', exact: true }).selectOption('17');
  await page.getByTestId('hebrew-main-text').locator('[data-word-id="26xKb"]').click();
  await expect(page.locator('.hebrew-word-details')).toContainText('HR/Acmpa');
  await expect(page.getByText('Unknown in the supplied morphology key. The exact raw code is retained; no expansion has been inferred.', { exact: true })).toBeVisible();
});

test('nested special letters preserve exact source content and reflow at 320px', async ({ page }, testInfo) => {
  await page.goto(route('Deut','6','4'));
  await expect(page.getByTestId('hebrew-source-reference')).toHaveText('OSHB Deut.6.4');
  await expect(page.getByTestId('hebrew-main-text').locator('.x-large')).toHaveCount(2);
  expect(await page.getByTestId('hebrew-main-text').textContent()).toBe(mainText('Deut','6','4'));
  await page.getByTestId('hebrew-main-text').locator('[data-word-id="05WH5"]').click();
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('hebrew-special-letters-320.png'), fullPage: true });
});

test('exact lemma pages retain complete counts and source-word navigation without changing Bible context', async ({ page }) => {
  await page.goto(baseRoute);
  await page.getByRole('textbox', { name: 'Exact supplied lemma field', exact: true }).fill('430');
  await page.getByRole('button', { name: 'Find exact lemma occurrences', exact: true }).click();
  await expect(page.getByTestId('hebrew-lemma-occurrences')).toHaveText('179');
  await expect(page.getByTestId('hebrew-lemma-verses')).toHaveText('160');
  await expect(page.locator('.hebrew-lemma-results li')).toHaveCount(25);
  for (let pageNumber = 2; pageNumber <= 8; pageNumber++) {
    await page.getByRole('button', { name: 'Next lemma result page', exact: true }).focus(); await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Source lemma results', exact: true })).toBeFocused();
    await expect(page.getByText(`Page ${pageNumber} of 8. Up to 25 source words per page.`, { exact: true })).toBeVisible();
  }
  await expect(page.locator('.hebrew-lemma-results li')).toHaveCount(4);
  await page.locator('.hebrew-lemma-results button').first().click();
  await expect(page.getByRole('heading', { name: 'Source word details', exact: true })).toBeFocused();
  await expect(page).toHaveURL(/#\/hebrew-study\/JHN\/3\?verse=16&end=18&edition=eng-bsb&oshbBook=Gen&oshbChapter=\d+&oshbVerse=\d+$/);
  await expect(page.getByTestId('hebrew-lemma-occurrences')).toHaveText('179');
  await page.getByRole('textbox', { name: 'Exact supplied lemma field', exact: true }).fill(' 430');
  await expect(page.getByTestId('hebrew-lemma-occurrences')).toHaveCount(0);
  await page.getByRole('button', { name: 'Find exact lemma occurrences', exact: true }).click();
  await expect(page.getByTestId('hebrew-lemma-occurrences')).toHaveText('0');
});

test('selected source book and notices survive a genuine offline reload, with removal checked afterward', async ({ page, context }) => {
  test.setTimeout(90_000);
  await page.goto(route('Ruth','3','12')); await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await expect(page.getByTestId('hebrew-source-reference')).toHaveText('OSHB Ruth.3.12');
  await page.getByRole('button', { name: 'Download source book and notices', exact: true }).click();
  await expect(page.getByTestId('hebrew-download-status')).toHaveText('Source book, morphology key and all source notices verified on this device.', { timeout: 30_000 });
  await context.setOffline(true);
  try {
    await page.reload(); await expect(page.getByTestId('hebrew-source-reference')).toHaveText('OSHB Ruth.3.12');
    expect(await page.getByTestId('hebrew-main-text').textContent()).toBe(mainText('Ruth','3','12'));
    await expect(page.getByText('The source supplies an empty qere reading.', { exact: true })).toBeVisible();
    await expect(page.getByTestId('hebrew-download-status')).toHaveText('Source book, morphology key and all source notices verified on this device.');
    await page.getByRole('textbox', { name: 'Exact supplied lemma field', exact: true }).fill('518 a');
    await page.getByRole('button', { name: 'Find exact lemma occurrences', exact: true }).click();
    await expect(page.getByTestId('hebrew-lemma-occurrences')).not.toHaveText('0');
    await page.getByRole('button', { name: 'Remove source book download', exact: true }).click();
    await expect(page.getByTestId('hebrew-download-status')).toHaveText('Selected source book removed from offline storage. Shared source notices remain available.');
    await page.reload(); await expect(page.getByTestId('hebrew-main-text')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Retry Hebrew source', exact: true })).toBeVisible();
  } finally { await context.setOffline(false); }
});

test('source-only hash navigation and browser history restore exact coordinates; invalid source links fail explicitly', async ({ page }) => {
  await page.goto(route('Gen','1','1')); await expect(page.getByTestId('hebrew-source-reference')).toHaveText('OSHB Gen.1.1');
  await page.evaluate(hash => { location.hash = hash; }, route('Ruth','3','12'));
  await expect(page.getByTestId('hebrew-source-reference')).toHaveText('OSHB Ruth.3.12');
  await page.goBack(); await expect(page.getByTestId('hebrew-source-reference')).toHaveText('OSHB Gen.1.1');
  await page.goForward(); await expect(page.getByTestId('hebrew-source-reference')).toHaveText('OSHB Ruth.3.12');
  await page.evaluate(hash => { location.hash = hash; }, route('Mal','4','1'));
  await expect(page.getByText('The source link names a chapter absent from this Hebrew source book. No translation numbering was substituted.', { exact: true })).toBeVisible();
  await expect(page.getByTestId('hebrew-main-text')).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Source book', exact: true }).selectOption('Joel');
  await page.getByRole('combobox', { name: 'Source chapter', exact: true }).selectOption('4');
  await expect(page.getByTestId('hebrew-source-reference')).toHaveText('OSHB Joel.4.1');
});

test.describe('source network failure boundaries', () => {
  test.use({ serviceWorkers: 'block' });
  test('changed source bytes fail closed and a delayed old book never replaces a newer selection', async ({ page }) => {
    const actual = readFileSync(new URL('books/Gen.json', root)); const changed = Buffer.from(actual); changed[changed.length - 1] = 32;
    await page.route('**/data/original-language/oshb/books/Gen.json', request => request.fulfill({ status: 200, contentType: 'application/json', body: changed }));
    await page.goto(baseRoute);
    await expect(page.getByText('The Hebrew source checksum changed. No changed source text was opened; update the application and retry.', { exact: true })).toBeVisible();
    await expect(page.getByTestId('hebrew-main-text')).toHaveCount(0);
    await page.unroute('**/data/original-language/oshb/books/Gen.json');
    await page.getByRole('button', { name: 'Retry Hebrew source', exact: true }).click();
    await expect(page.getByTestId('hebrew-source-reference')).toHaveText('OSHB Gen.1.1');
    let release: () => void = () => undefined; const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/data/original-language/oshb/books/Exod.json', async request => { await gate; await request.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(new URL('books/Exod.json', root)) }).catch(() => undefined); });
    await page.getByRole('combobox', { name: 'Source book', exact: true }).selectOption('Exod');
    await page.getByRole('combobox', { name: 'Source book', exact: true }).selectOption('Ruth');
    await expect(page.getByTestId('hebrew-source-reference')).toHaveText('OSHB Ruth.1.1'); release();
    await expect(page.getByTestId('hebrew-source-reference')).toHaveText('OSHB Ruth.1.1');
  });

  test('source download cancellation blocks application update only while the transaction is active', async ({ page }) => {
    await page.goto(route('Ruth','3','12')); await expect(page.getByTestId('hebrew-source-reference')).toHaveText('OSHB Ruth.3.12');
    let release: () => void = () => undefined; const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/data/original-language/oshb/notices/LICENSE.md', async request => { await gate; await request.continue().catch(() => undefined); });
    await page.getByRole('button', { name: 'Download source book and notices', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Cancel source download', exact: true })).toBeVisible();
    expect(await page.evaluate(() => { const event = new Event('adigun:before-update', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; })).toBe(true);
    await page.getByRole('button', { name: 'Cancel source download', exact: true }).click(); release();
    await expect(page.getByText('Download cancelled. Existing complete packs are retained.', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => { const event = new Event('adigun:before-update', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; })).toBe(false);
    await expect(page.getByRole('button', { name: 'Download source book and notices', exact: true })).toBeEnabled();
  });
});

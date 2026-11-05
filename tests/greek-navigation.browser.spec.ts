import { expect, test } from '@playwright/test';

const bible = 'JHN/3?verse=16&end=18&edition=eng-bsb';

test('Greek tools and keyboard commands preserve the Bible range while source coordinates remain independent', async ({ page }) => {
  await page.goto(`#/tools/${bible}`);
  await page.getByRole('button', { name: 'Open greek source study', exact: true }).click();
  expect(new URL(page.url()).hash).toBe(`#/greek-study/${bible}`);
  await expect(page.getByTestId('greek-source-reference')).toContainText('010101');
  await page.getByRole('combobox', { name: 'Source book', exact: true }).selectOption('Jn');
  await page.getByRole('combobox', { name: 'Source chapter', exact: true }).selectOption('8');
  await expect(page.getByTestId('greek-source-reference')).toContainText('040812');
  expect(new URL(page.url()).hash).toBe(`#/greek-study/${bible}&greekBook=Jn&greekChapter=8&greekVerse=12`);
  await page.getByRole('button', { name: 'Open command palette', exact: true }).click();
  const commands = page.getByRole('dialog', { name: 'Command palette', exact: true });
  const input = commands.getByLabel('Find a command', { exact: true });
  await input.fill('Read Scripture'); await input.press('Enter');
  await expect(commands).toHaveCount(0);
  await expect(page).toHaveURL(/#\/read\/JHN\/3\?verse=16&end=18&edition=eng-bsb$/);
  await expect(page.locator('#verse-16')).toBeVisible();
  await page.getByRole('button', { name: 'Open command palette', exact: true }).click();
  await input.fill('Greek source study'); await input.press('Enter');
  await expect(commands).toHaveCount(0);
  expect(new URL(page.url()).hash).toBe(`#/greek-study/${bible}`);
  await expect(page.getByTestId('greek-source-reference')).toContainText('010101');
  await page.reload();
  await expect(page.getByTestId('greek-source-reference')).toContainText('010101');
  expect(new URL(page.url()).hash).toBe(`#/greek-study/${bible}`);
});

test.describe('Greek coverage source validation', () => {
  test.use({ serviceWorkers: 'block' });
  test('a changed Greek inventory stays unknown, recovers verified counts and links without changing the Bible range', async ({ page }) => {
    await page.route('**/data/original-language/morphgnt-sblgnt/manifest.json', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"bookCount":27,"verseCount":7927,"tokenCount":137554}' }));
    await page.goto(`#/editorial-workbench/${bible}`);
    const region = page.getByRole('region', { name: 'Study content and device coverage', exact: true });
    const greek = region.getByRole('article', { name: 'Greek source corpus', exact: true });
    const metric = (label: string) => greek.getByText(label, { exact: true }).locator('..').locator('dd');
    await expect(region.getByText('Public coverage inventories checked. Unknown values are not counted as zero.', { exact: true })).toBeVisible();
    await expect(metric('Original-language source books')).toHaveText('Unknown');
    await expect(metric('Source verse records')).toHaveText('Unknown');
    await expect(metric('Supplied token rows')).toHaveText('Unknown');
    await expect(region.getByRole('alert').filter({ hasText: 'Greek source inventory:' })).toBeVisible();
    await expect(region.getByRole('article', { name: 'Hebrew and Aramaic source corpus', exact: true }).getByText('Original-language source books', { exact: true }).locator('..').locator('dd')).toHaveText('39');
    await page.unroute('**/data/original-language/morphgnt-sblgnt/manifest.json');
    await region.getByRole('button', { name: 'Refresh coverage inventories', exact: true }).click();
    await expect(metric('Original-language source books')).toHaveText('27');
    await expect(metric('Source chapters')).toHaveText('260');
    await expect(metric('Source verse records')).toHaveText('7,927');
    await expect(metric('Supplied token rows')).toHaveText('137,554');
    await expect(region.getByRole('alert')).toHaveCount(0);
    await expect(greek).toContainText('not an additional translated Bible edition');
    await greek.getByRole('link', { name: 'Open Greek source study', exact: true }).click();
    expect(new URL(page.url()).hash).toBe(`#/greek-study/${bible}`);
    await expect(page.getByTestId('greek-source-reference')).toContainText('010101');
  });
});

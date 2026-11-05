import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.use({ serviceWorkers: 'block' });
const start = '#/interpretation/MAT/5?verse=17&end=20&edition=eng-web';
const beforeText = 'I want to compare each reading with the examples that follow the passage.';
async function begin(page: Page) {
  await page.goto(start);
  await expect(page.getByRole('heading', { name: 'Blind interpretation workspace', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start a new private reflection', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Before-reveal reasoning', exact: true })).toBeVisible();
}
async function save(page: Page) {
  await page.getByRole('button', { name: 'Save private reflection', exact: true }).click();
  await expect(page.getByText('Reflection saved privately on this device.', { exact: true })).toBeVisible();
}
async function backup(page: Page) {
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download interpretation backup', exact: true }).click();
  const download = await waiting;
  return readFile((await download.path())!, 'utf8');
}

test('blind reasoning persists, deliberate keyboard reveal freezes the original, and later reflection stays private', async ({ page }) => {
  await begin(page);
  await expect(page.getByRole('heading', { name: 'John Wesley', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'John Chrysostom', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Read this writer’s full source', exact: true })).toHaveCount(0);
  const firstReading = page.getByRole('article', { name: 'Reading 1', exact: true });
  const originalReading = await firstReading.locator('blockquote').innerText();
  await page.getByRole('textbox', { name: 'Before-reveal reasoning', exact: true }).fill(beforeText);
  await page.getByRole('combobox', { name: 'Initial reading preference', exact: true }).selectOption('reading-a');
  await save(page);
  await page.reload();
  await page.getByRole('button', { name: /^Open saved reflection 1/ }).click();
  await expect(page.getByRole('textbox', { name: 'Before-reveal reasoning', exact: true })).toHaveValue(beforeText);
  await expect(firstReading.locator('blockquote')).toHaveText(originalReading);
  await expect(page.getByRole('heading', { name: 'John Wesley', exact: true })).toHaveCount(0);
  const reveal = page.getByRole('button', { name: 'Save reasoning and reveal sources', exact: true });
  await reveal.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '3. Revisit after the reveal', exact: true })).toBeFocused();
  await expect(page.getByRole('heading', { name: 'John Wesley', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'John Chrysostom', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Before-reveal reasoning', exact: true })).toHaveAttribute('readonly', '');
  await expect(page.getByRole('combobox', { name: 'Initial reading preference', exact: true })).toBeDisabled();
  await page.getByRole('textbox', { name: 'After-reveal reasoning', exact: true }).fill('PRIVATE LATER REFLECTION: the passage still matters more than familiarity.');
  await page.getByRole('combobox', { name: 'Current reading preference', exact: true }).selectOption('reading-b');
  await save(page);
  const parsed = JSON.parse(await backup(page));
  expect(parsed.reflections).toHaveLength(1);
  expect(parsed.reflections[0].before).toBe(beforeText);
  expect(parsed.reflections[0].initialPreference).toBe('reading-a');
  expect(parsed.reflections[0].finalPreference).toBe('reading-b');
  expect(parsed.reflections[0].revealedAt).toBeTruthy();
  expect(parsed.reflections[0].history).toHaveLength(2);
  expect(parsed.reflections[0].editionId).toBe('eng-web');
  expect(parsed.reflections[0].sourceSha256).toMatch(/^[a-f0-9]{64}$/);
  await page.reload();
  await page.getByRole('button', { name: /^Open saved reflection 1/ }).click();
  await expect(page.getByRole('textbox', { name: 'After-reveal reasoning', exact: true })).toHaveValue('PRIVATE LATER REFLECTION: the passage still matters more than familiarity.');
});

test('unsaved writing survives rejected navigation and malformed imports at a narrow viewport', async ({ page }) => {
  await begin(page);
  await page.getByRole('textbox', { name: 'Before-reveal reasoning', exact: true }).fill(beforeText);
  await save(page);
  const draft = 'Keep this unsaved interpretation thought.';
  await page.getByRole('textbox', { name: 'Before-reveal reasoning', exact: true }).fill(draft);
  await page.getByLabel('Preview interpretation backup', { exact: true }).setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"kind":"adigun-blind-interpretation","schemaVersion":1,"revision":0,"reflections":[],"approved":true}') });
  await expect(page.getByRole('alert').filter({ hasText: 'Blind interpretation notebook is invalid' })).toBeVisible();
  expect(await page.evaluate(() => window.dispatchEvent(new Event('adigun:before-update', { cancelable: true })))).toBe(false);
  page.once('dialog', dialog => dialog.dismiss());
  expect(await page.evaluate(() => window.dispatchEvent(new Event('adigun:before-navigation', { cancelable: true })))).toBe(false);
  await expect(page.getByRole('textbox', { name: 'Before-reveal reasoning', exact: true })).toHaveValue(draft);
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download private writing', exact: true }).click();
  const text = await readFile((await (await downloading).path())!, 'utf8');
  expect(text).toContain(draft); expect(text).not.toContain('John Wesley'); expect(text).not.toContain('John Chrysostom');
  await expect(page.getByRole('button', { name: 'Download interpretation backup', exact: true })).toBeDisabled();
});

test('validated backups restore only the interpretation notebook, while stale source revisions are refused', async ({ page }) => {
  await begin(page);
  await page.evaluate(() => localStorage.setItem('another-project-note', 'retain me'));
  await page.getByRole('textbox', { name: 'Before-reveal reasoning', exact: true }).fill(beforeText);
  await save(page);
  const raw = await backup(page);
  const stale = JSON.parse(raw); stale.reflections[0].sourceSha256 = '0'.repeat(64);
  await page.getByLabel('Preview interpretation backup', { exact: true }).setInputFiles({ name: 'stale.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(stale)) });
  await expect(page.getByRole('alert').filter({ hasText: 'different challenge or source revision' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Before-reveal reasoning', exact: true })).toHaveValue(beforeText);
  await page.getByRole('button', { name: 'Start a new private reflection', exact: true }).click();
  await page.getByRole('textbox', { name: 'Before-reveal reasoning', exact: true }).fill('A second private exercise.');
  await save(page);
  await expect(page.getByRole('button', { name: /^Open saved reflection / })).toHaveCount(2);
  await page.getByLabel('Preview interpretation backup', { exact: true }).setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(raw) });
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Replace interpretation notebook from backup', exact: true }).click();
  await expect(page.getByText('Private interpretation notebook restored.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Open saved reflection / })).toHaveCount(1);
  await page.getByRole('button', { name: /^Open saved reflection 1/ }).click();
  await expect(page.getByRole('textbox', { name: 'Before-reveal reasoning', exact: true })).toHaveValue(beforeText);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete this reflection', exact: true }).click();
  await expect(page.getByText('No saved reflections yet.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('another-project-note'))).toBe('retain me');
});

test('a stale browser tab cannot overwrite a newer private reflection and retains its unsaved text', async ({ page, context }) => {
  await begin(page);
  await page.getByRole('textbox', { name: 'Before-reveal reasoning', exact: true }).fill(beforeText);
  await save(page);
  const other = await context.newPage();
  await other.goto(start); await other.getByRole('button', { name: /^Open saved reflection 1/ }).click();
  await page.getByRole('textbox', { name: 'Before-reveal reasoning', exact: true }).fill('The winning newer reasoning.');
  await save(page);
  await other.getByRole('textbox', { name: 'Before-reveal reasoning', exact: true }).fill('Keep my stale unsaved draft.');
  await other.getByRole('button', { name: 'Save private reflection', exact: true }).click();
  await expect(other.getByRole('alert').filter({ hasText: 'Another tab saved a newer interpretation notebook' })).toBeVisible();
  await expect(other.getByRole('textbox', { name: 'Before-reveal reasoning', exact: true })).toHaveValue('Keep my stale unsaved draft.');
  await other.getByRole('button', { name: 'Reload saved interpretation records', exact: true }).click();
  other.once('dialog', dialog => dialog.accept());
  await other.getByRole('button', { name: /^Open saved reflection 1/ }).click();
  await expect(other.getByRole('textbox', { name: 'Before-reveal reasoning', exact: true })).toHaveValue('The winning newer reasoning.');
  await other.close();
});

test('missing challenge source blocks new reflections without silently changing the Bible edition', async ({ page }) => {
  await page.route('**/data/books/MAT.json', route => route.abort());
  await page.goto(start);
  await expect(page.getByRole('heading', { name: 'Blind interpretation workspace', exact: true })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'No alternative edition is substituted' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start a new private reflection', exact: true })).toBeDisabled();
  await page.unroute('**/data/books/MAT.json');
  await page.getByRole('button', { name: 'Retry challenge source', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start a new private reflection', exact: true })).toBeEnabled();
});

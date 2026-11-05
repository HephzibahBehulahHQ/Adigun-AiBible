import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const sourceBook = JSON.parse(readFileSync(new URL('../data/editions/eng-bsb/books/JHN.json', import.meta.url), 'utf8'));
const sourceVerse = sourceBook.chapters.find((chapter: { number: number }) => chapter.number === 3).verses.find((verse: { number: number }) => verse.number === 3);
const span = sourceVerse.characterSpans.find((value: { marker: string }) => value.marker === 'wj');
const markedText = Array.from(sourceVerse.text as string).slice(span.start, span.end).join('');

async function loadJohn(page: Page) {
  await expect(page.getByRole('heading', { name: 'Speaker Explorer', exact: true })).toBeVisible();
  await expect(page.getByLabel('Book scope').locator('option[value="JHN"]')).toHaveCount(1);
  await page.getByLabel('Book scope').selectOption('JHN');
  await page.getByRole('button', { name: 'Load publisher-marked speech', exact: true }).click();
  await page.getByLabel('Find words in marked speech').fill('no one can see the kingdom of God');
  const result = page.locator('.speaker-result').filter({ has: page.getByRole('heading', { name: `${sourceBook.name} 3:3`, exact: true }) });
  await expect(result).toHaveCount(1);
  return result;
}

test('real publisher spans retain exact boundaries and source context at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.addInitScript(() => localStorage.setItem('adigun-bible-preferences', JSON.stringify({ locale: 'de', preset: 'en' })));
  await page.goto('#/speakers/JHN/3?verse=3&edition=eng-bsb');
  const result = await loadJohn(page);
  await expect(result.locator('blockquote')).toHaveText(markedText);
  expect(markedText).not.toContain('Jesus replied');
  await expect(result).toContainText('Publisher annotation · not independent review');
  await result.locator('summary').click();
  await expect(result.locator('.speaker-full-verse')).toHaveText(sourceVerse.text);
  await expect(result.locator('mark')).toHaveText(markedText);
  await expect(page.locator('.speaker-page')).toContainText('(EN fallback)');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await result.getByRole('button', { name: 'Open full context', exact: true }).click();
  await expect(page).toHaveURL(/#\/read\/JHN\/3\?verse=3.*edition=eng-bsb/);
  await expect(page.locator('.reader')).toBeVisible();
});

test('private corrections persist, export only drafts, validate backup restoration and retain unsaved writing', async ({ page }) => {
  const privateReason = 'Private fixture: compare the exact source boundary with its surrounding sentence.';
  const requestUrls: string[] = [];
  page.on('request', request => requestUrls.push(request.url()));
  await page.goto('#/speakers/JHN/3?verse=3&edition=eng-bsb');
  const result = await loadJohn(page);
  await result.getByRole('button', { name: 'Suggest correction', exact: true }).click();
  const form = page.getByRole('region', { name: 'Speaker correction proposal', exact: true });
  await form.getByLabel('Your reason and supporting evidence').fill(privateReason);
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByLabel('Speech source edition').selectOption('eng-web');
  await expect(page.getByLabel('Speech source edition')).toHaveValue('eng-bsb');
  await expect(form.getByLabel('Your reason and supporting evidence')).toHaveValue(privateReason);
  await form.getByRole('button', { name: 'Save private correction', exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(page.locator('.speaker-proposal-reason')).toHaveText(privateReason);
  await page.reload();
  await expect(page.locator('.speaker-proposal-reason')).toHaveText(privateReason);

  const backupEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download correction backup', exact: true }).click();
  const backupPath = await (await backupEvent).path();
  expect(backupPath).toBeTruthy();
  const backupBytes = await readFile(backupPath!);
  const backup = JSON.parse(backupBytes.toString('utf8'));
  expect(backup.proposals).toHaveLength(1);
  expect(backup.proposals[0].status).toBe('draft');
  expect(backup.proposals[0].annotation.review).toBeUndefined();
  expect(backupBytes.toString()).not.toContain(sourceVerse.text);

  const reviewEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export draft for review', exact: true }).click();
  const reviewPath = await (await reviewEvent).path();
  const review = JSON.parse(await readFile(reviewPath!, 'utf8'));
  expect(review.editorialDraft.review.status).toBe('draft');
  expect(review.editorialDraft.review.reviewerId).toBeUndefined();
  expect(review.editorialDraft.reviewedSourceHashes['eng-bsb:JHN:3:3']).toMatch(/^[a-f0-9]{64}$/);

  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete correction', exact: true }).click();
  await expect(page.locator('.speaker-proposal')).toHaveCount(0);
  await page.getByLabel('Restore correction backup').setInputFiles({ name: 'corrections.json', mimeType: 'application/json', buffer: backupBytes });
  await expect(page.locator('.speaker-import-preview')).toContainText('1 verified draft proposals');
  await page.getByRole('button', { name: 'Merge correction backup', exact: true }).click();
  await expect(page.locator('.speaker-proposal-reason')).toHaveText(privateReason);

  const stale = structuredClone(backup);
  stale.proposals[0].id = stale.proposals[0].annotation.id = 'test-only-stale-revision';
  stale.proposals[0].annotation.editionSha256 = '0'.repeat(64);
  await page.getByLabel('Restore correction backup').setInputFiles({ name: 'stale.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(stale)) });
  await expect(page.getByRole('alert').filter({ hasText: 'different source revision' })).toBeVisible();
  await expect(page.locator('.speaker-import-preview')).toHaveCount(0);
  await expect(page.locator('.speaker-proposal')).toHaveCount(1);
  expect(requestUrls.some(url => url.includes(privateReason) || url.includes(encodeURIComponent(privateReason)))).toBe(false);
});

test('an edition without publisher markings keeps an honest empty state and never substitutes another edition', async ({ page }) => {
  await page.goto('#/speakers/JHN/3?verse=16&edition=eng-web');
  await expect(page.getByRole('heading', { name: 'Speaker Explorer', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Load publisher-marked speech', exact: true }).click();
  await expect(page.locator('.speaker-empty')).toContainText('supplies no Jesus-speech markings');
  await expect(page.locator('.speaker-result')).toHaveCount(0);
  await expect(page.getByLabel('Speech source edition')).toHaveValue('eng-web');
  await expect(page.locator('.speaker-reviewed')).toContainText('not available yet');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Speaker Explorer', exact: true })).toBeVisible();
});

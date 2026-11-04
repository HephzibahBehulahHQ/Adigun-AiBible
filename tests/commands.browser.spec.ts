import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
const passage = '#/read/JHN/3?verse=16&end=17&edition=eng-bsb';

test('command palette supports keyboard choice, Escape focus return and exact-edition passage navigation', async ({ page }, testInfo) => {
  await page.goto(passage);
  await expect(page.locator('#verse-16')).toBeVisible();
  const trigger = page.getByRole('button', { name: 'Open command palette', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Command palette' });
  const input = dialog.getByRole('combobox', { name: 'Find an action or passage' });
  await expect(input).toBeFocused();
  await expect.poll(() => dialog.evaluate(element => { const bounds = element.getBoundingClientRect(); return bounds.top >= 0 && bounds.bottom <= window.innerHeight; })).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('command-palette.png') });
  await input.fill('listening queue');
  await expect(dialog.getByRole('option').first()).toHaveAttribute('aria-selected', 'true');
  await input.press('ArrowDown');
  await expect(dialog.getByRole('option').last()).toHaveAttribute('aria-selected', 'true');
  await input.press('ArrowUp');
  await input.press('Enter');
  await expect(page).toHaveURL(/#\/audio\/JHN\/3\?verse=16&end=17&edition=eng-bsb$/);
  await expect(page.getByRole('heading', { name: 'Audio reader', exact: true })).toBeVisible();

  await trigger.click();
  await input.fill('John 3:18-19');
  await input.press('Enter');
  await expect(page).toHaveURL(/#\/read\/JHN\/3\?verse=18&end=19&edition=eng-bsb$/);
  await expect(page.locator('#verse-18')).toBeVisible();
  await trigger.click();
  await input.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test('palette shortcut, focus trap, source search and narrow layout work without page overflow', async ({ page }, testInfo) => {
  await page.goto(passage);
  await expect(page.locator('#verse-16')).toBeVisible();
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Command palette' });
  const input = dialog.getByRole('combobox', { name: 'Find an action or passage' });
  await expect(input).toBeFocused();
  await input.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Close command palette' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(input).toBeFocused();
  await page.setViewportSize({ width: 320, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect.poll(() => dialog.evaluate(element => { const bounds = element.getBoundingClientRect(); return bounds.top >= 0 && bounds.bottom <= window.innerHeight; })).toBe(true);
  await input.press('Alt+End');
  await expect(dialog.getByRole('option').last()).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => dialog.getByRole('option').last().evaluate(element => element.getBoundingClientRect().bottom <= window.innerHeight)).toBe(true);
  await input.press('Alt+Home');
  await page.screenshot({ path: testInfo.outputPath('command-palette-320.png') });
  await input.fill('begotten');
  await input.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Results for “begotten”' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Command palette' })).not.toBeVisible();
  await expect(page.locator('.search-results button').first()).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Results for “begotten”' })).toContainText('Berean Standard Bible');
});

test('palette remains available in Reading Focus and never executes a malformed passage link', async ({ page }) => {
  await page.goto(passage);
  await expect(page.locator('#verse-16')).toBeVisible();
  const trigger = page.getByRole('button', { name: 'Open command palette', exact: true });
  await trigger.click();
  let dialog = page.getByRole('dialog', { name: 'Command palette' });
  await dialog.getByRole('combobox').fill('enter reading focus');
  await dialog.getByRole('combobox').press('Enter');
  await expect(page.locator('.app')).toHaveClass(/focus-mode/);
  await trigger.click();
  dialog = page.getByRole('dialog', { name: 'Command palette' });
  await dialog.getByRole('combobox').fill('John 3:999');
  await expect(dialog.getByRole('option', { name: /^Open John/ })).toHaveCount(0);
  await dialog.getByRole('combobox').fill('leave reading focus');
  await dialog.getByRole('combobox').press('Enter');
  await expect(page.locator('.app')).not.toHaveClass(/focus-mode/);
  await expect(page).toHaveURL(/#\/read\/JHN\/3\?verse=16&end=17&edition=eng-bsb$/);
});


test('inspector commands reveal notes from focus mode and cancelled navigation preserves unsaved forms', async ({ page }) => {
  await page.goto(passage);
  await expect(page.locator('#verse-16')).toBeVisible();
  const trigger = page.getByRole('button', { name: 'Open command palette', exact: true });
  await trigger.click();
  let input = page.getByRole('dialog', { name: 'Command palette' }).getByRole('combobox');
  await input.fill('enter reading focus'); await input.press('Enter');
  await expect(page.locator('.app')).toHaveClass(/focus-mode/);
  await trigger.click();
  input = page.getByRole('dialog', { name: 'Command palette' }).getByRole('combobox');
  await input.fill('write a passage note'); await input.press('Enter');
  await expect(page.locator('.app')).not.toHaveClass(/focus-mode/);
  await expect(page.locator('#verse-note')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.goto('#/family/JHN/3?verse=16&end=17&edition=eng-bsb');
  await expect(page.getByLabel('Title', { exact: true })).toBeEnabled();
  await page.getByLabel('Title', { exact: true }).fill('Unsaved command navigation fixture');
  await trigger.click();
  input = page.getByRole('dialog', { name: 'Command palette' }).getByRole('combobox');
  await input.fill('enter reading focus');
  page.once('dialog', dialog => dialog.dismiss());
  await input.press('Enter');
  await expect(page).toHaveURL(/#\/family\/JHN\/3\?verse=16&end=17&edition=eng-bsb$/);
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Unsaved command navigation fixture');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('adigun-bible-preferences') || '{}').focus)).toBe(false);
});

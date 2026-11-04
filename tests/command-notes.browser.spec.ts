import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

test('closing commands and layouts restores their triggers while Notes is open, and plain k remains writing', async ({ page }) => {
  // Keep the inspector nonmodal even when this runs in the narrow-device project.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('#/read/JHN/3?verse=16&edition=eng-bsb');
  await expect(page.locator('#verse-16')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bookmark verse 16', exact: true })).toBeEnabled();
  const inspector = page.locator('.inspector');
  await expect(inspector).toBeVisible();
  await inspector.getByRole('button', { name: 'Notes', exact: true }).click();
  const note = page.locator('#verse-note');
  await expect(note).toBeEnabled();
  await expect(note).toBeFocused();

  await note.fill('A private reflection ');
  await note.press('k');
  await expect(note).toHaveValue('A private reflection k');
  const palette = page.getByRole('dialog', { name: 'Command palette', exact: true });
  await expect(palette).toHaveCount(0);
  await expect(inspector.locator('.save-status')).toHaveText('Saved on this device');

  const commandsTrigger = page.getByRole('button', { name: 'Open command palette', exact: true });
  await commandsTrigger.focus();
  await commandsTrigger.press('Enter');
  await expect(palette.getByLabel('Find a command', { exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(palette).toHaveCount(0);
  await expect(commandsTrigger).toBeFocused();
  await expect(note).toHaveValue('A private reflection k');

  const layoutsTrigger = page.getByRole('button', { name: 'Saved reader layouts', exact: true });
  await layoutsTrigger.focus();
  await layoutsTrigger.press('Enter');
  const layouts = page.getByRole('dialog', { name: 'Saved reader layouts', exact: true });
  await expect(layouts.getByRole('button', { name: 'Save current layout', exact: true })).toBeEnabled();
  await layouts.getByRole('button', { name: 'Close saved layouts', exact: true }).click();
  await expect(layouts).toHaveCount(0);
  await expect(layoutsTrigger).toBeFocused();
  await expect(note).toHaveValue('A private reflection k');

  await note.focus();
  await note.press('End');
  await note.press('k');
  await expect(note).toHaveValue('A private reflection kk');
  await expect(palette).toHaveCount(0);
  await expect(inspector.locator('.save-status')).toHaveText('Saved on this device');
});

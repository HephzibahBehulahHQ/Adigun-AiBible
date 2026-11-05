import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

type DatabaseGate = {
  holdRead: boolean; holdWrite: boolean;
  reading: boolean; writing: boolean;
  completedReads: number; completedWrites: number;
};
type GatedWindow = typeof window & { historicalNavigationGate: DatabaseGate };
const library = '#/library/JHN/3?verse=16&edition=eng-web';
const sources = '#/sources/JHN/3?verse=16&edition=eng-web';

async function installDatabaseGate(page: Page, holdRead: boolean) {
  await page.addInitScript(({ holdRead }) => {
    const gate: DatabaseGate = { holdRead, holdWrite: false, reading: false, writing: false, completedReads: 0, completedWrites: 0 };
    (window as GatedWindow).historicalNavigationGate = gate;
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args: Parameters<IDBDatabase['transaction']>) {
      const transaction = Reflect.apply(original, this, args) as IDBTransaction;
      if (this.name !== 'adigun-aibible-historical-study' || !transaction.objectStoreNames.contains('study')) return transaction;
      const read = transaction.mode === 'readonly';
      if (read) gate.reading = true; else gate.writing = true;
      transaction.addEventListener('complete', () => {
        if (read) { gate.reading = false; gate.completedReads++; }
        else { gate.writing = false; gate.completedWrites++; }
      });
      // Keep the actual scoped IndexedDB transaction open until the test releases it.
      // The application still reads/writes its own records and receives native events.
      const keepAlive = () => {
        if (!(read ? gate.holdRead : gate.holdWrite)) return;
        const request = transaction.objectStore('study').get('navigation-regression-keepalive');
        request.addEventListener('success', keepAlive);
      };
      keepAlive();
      return transaction;
    };
  }, { holdRead });
}

test.describe('historical notebook navigation during storage operations', () => {
  test.use({ serviceWorkers: 'block' });

  test('a pending readonly notebook load does not trap the reader in the library', async ({ page }) => {
    await installDatabaseGate(page, true);
    await page.goto(library);
    await expect(page.getByRole('heading', { name: 'Scripture library', exact: true, level: 1 })).toBeVisible();
    await page.waitForFunction(() => (window as GatedWindow).historicalNavigationGate.reading);
    await expect(page.getByText('Opening private historical storage…', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export historical notebook', exact: true })).toBeDisabled();

    await page.goto(sources);
    await expect(page).toHaveURL(/#\/sources\/JHN\/3\?verse=16&edition=eng-web$/);
    await expect(page.getByRole('heading', { name: 'Sources & coverage', exact: true, level: 1 })).toBeVisible();
    expect(await page.evaluate(() => (window as GatedWindow).historicalNavigationGate.completedReads)).toBe(0);

    await page.evaluate(() => { (window as GatedWindow).historicalNavigationGate.holdRead = false; });
    await page.waitForFunction(() => (window as GatedWindow).historicalNavigationGate.completedReads > 0);
    await expect(page).toHaveURL(/#\/sources\//);
    await page.goto(library);
    await expect(page.getByRole('button', { name: 'Export historical notebook', exact: true })).toBeEnabled();
    await expect(page.getByText('Saved on this device only.', { exact: true })).toBeVisible();
  });

  test('a pending write without a dirty draft blocks navigation until commit', async ({ page }) => {
    await installDatabaseGate(page, false);
    await page.goto(library);
    const unit = page.getByRole('article', { name: 'Didache 1:1', exact: true });
    await expect(unit.getByRole('button', { name: 'Bookmark historical unit', exact: true })).toBeEnabled();
    await expect(page.getByLabel('Historical note', { exact: true })).toHaveCount(0);
    await page.evaluate(() => { (window as GatedWindow).historicalNavigationGate.holdWrite = true; });
    await unit.getByRole('button', { name: 'Bookmark historical unit', exact: true }).click();
    await page.waitForFunction(() => (window as GatedWindow).historicalNavigationGate.writing);
    await expect(page.getByText('Saving historical records…', { exact: true })).toBeVisible();

    await page.goto(sources);
    await expect(page).toHaveURL(/#\/library\/JHN\/3\?verse=16&edition=eng-web$/);
    await expect(unit.getByRole('button', { name: 'Bookmark historical unit', exact: true })).toBeDisabled();
    expect(await page.evaluate(() => window.dispatchEvent(new Event('adigun:before-update', { cancelable: true })))).toBe(false);
    expect(await page.evaluate(() => (window as GatedWindow).historicalNavigationGate.completedWrites)).toBe(0);

    await page.evaluate(() => { (window as GatedWindow).historicalNavigationGate.holdWrite = false; });
    await expect(page.getByText('Historical bookmark updated on this device.', { exact: true })).toBeVisible();
    await page.goto(sources);
    await expect(page.getByRole('heading', { name: 'Sources & coverage', exact: true, level: 1 })).toBeVisible();
    await page.goto(library);
    await expect(unit.getByRole('button', { name: 'Remove historical bookmark', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });
});

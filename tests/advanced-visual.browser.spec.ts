import { expect, test } from '@playwright/test';

test('advanced workspaces render real source content on desktop, mobile and narrow screens', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const mobile = testInfo.project.name.includes('mobile');
  const normal = mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  const views = [
    ['speakers', 'Speaker Explorer', 'eng-bsb'],
    ['editorial-workbench', 'Coverage and editorial workbench', 'eng-web'],
    ['linguistics', 'Original-language study', 'eng-web'],
    ['time-travel', 'Bible Time Travel', 'eng-web'],
    ['nearby', 'Nearby study room', 'eng-web'],
    ['interpretation', 'Blind interpretation workspace', 'eng-web'],
  ];
  for (const [view, title, edition] of views) {
    await page.setViewportSize(normal);
    await page.goto(`#/${view}/JHN/3?verse=16&edition=${edition}`);
    await expect(page.getByRole('heading', { name: title, exact: true, level: 1 })).toBeVisible();
    await expect(page.locator('.page-loading')).toHaveCount(0);
    if (view === 'speakers') {
      await expect(page.getByLabel('Book scope').locator('option[value="JHN"]')).toHaveCount(1);
      await page.getByLabel('Book scope').selectOption('JHN');
      await page.getByRole('button', { name: 'Load publisher-marked speech', exact: true }).click();
      await expect(page.locator('.speaker-result').first().locator('blockquote')).not.toBeEmpty();
    } else if (view === 'editorial-workbench') {
      await expect(page.getByRole('status').filter({ hasText: 'Reading installed source' })).toHaveCount(0);
      await expect(page.getByRole('table').first()).toContainText('Permitted with conditions');
    } else if (view === 'linguistics') {
      await page.getByLabel('Find a lexical entry', { exact: true }).fill('H2');
      await page.getByRole('button', { name: /H2 · אַב/ }).click();
      await expect(page.getByRole('region', { name: 'Selected dictionary entry' })).toContainText('{father}');
    } else if (view === 'time-travel') {
      await expect(page.getByRole('region', { name: 'Selected-edition passage' })).toContainText('World English Bible');
    } else if (view === 'nearby') {
      await expect(page.locator('.nearby-source')).toContainText('World English Bible');
      await expect(page.getByRole('button', { name: 'Create pairing offer', exact: true })).toBeVisible();
    } else {
      await expect(page.getByRole('button', { name: 'Start a new private reflection', exact: true })).toBeEnabled();
      await page.getByRole('button', { name: 'Start a new private reflection', exact: true }).click();
      await expect(page.getByLabel('Before-reveal reasoning', { exact: true })).toBeVisible();
    }
    await page.evaluate(() => scrollTo(0, 0));
    for (const viewport of [normal, { width: 320, height: 844 }]) {
      await page.setViewportSize(viewport);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${view} reflows at ${viewport.width}px`).toBe(true);
      const path = testInfo.outputPath(`${view}-${viewport.width}x${viewport.height}.png`);
      await page.screenshot({ path, animations: 'disabled' });
      await testInfo.attach(`${view} ${viewport.width}px viewport`, { path, contentType: 'image/png' });
    }
  }
});

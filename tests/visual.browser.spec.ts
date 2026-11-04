import { expect, test } from '@playwright/test';

test('release visual evidence covers core and expanded workspaces', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const mobile = testInfo.project.name.includes('mobile');
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  const headings: Record<string, string> = { read: 'John 3', compare: 'John 3', editions: 'Bible editions', library: 'Scripture library', sources: 'Sources & coverage', share: 'Share Studio', tools: 'Study tools', family: 'Family Legacy Bible', audio: 'Audio reader', evidence: 'Sermon Evidence Scanner', projection: 'Scripture projection', support: 'Support resources' };
  for (const view of ['read', 'compare', 'editions', 'library', 'sources', 'share', 'tools', 'family', 'audio', 'evidence', 'projection', 'support']) {
    await page.goto(`#/${view}/JHN/3?verse=16&edition=eng-web`);
    await expect(page.getByRole('heading', { name: headings[view], exact: true, level: 1 })).toBeVisible();
    await expect(page.locator('.page-loading')).toHaveCount(0);
    if (view === 'read' || view === 'compare') await expect(page.locator('#verse-16')).toContainText('God');
    if (view === 'support') {
      await page.getByLabel('Country', { exact: true }).selectOption('DE');
      await expect(page.getByRole('link', { name: 'Call Emergency services: 112', exact: true })).toHaveAttribute('href', 'tel:112');
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${view} reflows`).toBe(true);
    const shot = testInfo.outputPath(`${view}-${mobile ? '390x844' : '1440x900'}.png`);
    await page.screenshot({ path: shot, animations: 'disabled' });
    await testInfo.attach(`${view} viewport`, { path: shot, contentType: 'image/png' });
  }
  await page.setViewportSize({ width: 320, height: 844 });
  await page.getByLabel('Country', { exact: true }).selectOption('NG');
  await expect(page.getByRole('region', { name: 'Support in Nigeria', exact: true })).toBeVisible();
  await expect(page.getByText('Lagos · Yaba and Oshodi', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= 321)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('support-320x844.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Clear country', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Support in Nigeria', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel('Country', { exact: true })).toHaveValue('');
});

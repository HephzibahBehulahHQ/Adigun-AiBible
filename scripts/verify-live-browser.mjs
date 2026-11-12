import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const deployedUrl = process.env.ADIGUN_DEPLOYED_URL;
const expectedCommit = process.env.ADIGUN_EXPECTED_COMMIT;
if (!deployedUrl || !/^[a-f0-9]{40}$/.test(expectedCommit || '')) {
  throw new Error('A deployed URL and exact source commit are required.');
}
const deployed = new URL(deployedUrl);
if (deployed.protocol !== 'https:' || deployed.hostname !== 'adigun-aibible.hephzibahbehulah.com' || deployed.pathname !== '/') {
  throw new Error('Unexpected public application URL: ' + deployed.href);
}

await mkdir('test-results/live-smoke', { recursive: true });
const browser = await chromium.launch({ headless: true });

try {
  for (const { name, viewport } of [
    { name: 'desktop', viewport: { width: 1440, height: 900 } },
    { name: 'mobile', viewport: { width: 390, height: 844 } },
  ]) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
    const page = await context.newPage();
    try {
      // A Pages receipt and HTTP 200 cannot prove the JavaScript actually rendered.
      const receiptResponse = await context.request.get(new URL('build-info.json', deployed).href, {
        headers: { 'Cache-Control': 'no-cache' },
        timeout: 30_000,
      });
      if (!receiptResponse.ok()) throw new Error('Public build receipt HTTP ' + receiptResponse.status());
      const receipt = await receiptResponse.json();
      if (receipt.sourceCommit !== expectedCommit) {
        throw new Error('Live source revision differs from the deployed commit: ' + receipt.sourceCommit);
      }

      const home = await page.goto(deployed.href, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      if (!home?.ok()) throw new Error('Public homepage did not return HTTP 2xx.');
      await page.locator('#root > *').first().waitFor({ state: 'visible', timeout: 45_000 });
      const homeText = (await page.locator('#root').innerText()).trim();
      if (homeText.length < 20 || await page.locator('#app-recovery-title').count()) {
        throw new Error('The homepage did not render the normal application interface.');
      }

      const reader = new URL(deployed.href);
      reader.hash = '/read/GEN/1?verse=1&edition=eng-web';
      const readerResponse = await page.goto(reader.href, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      if (!readerResponse?.ok()) throw new Error('The public reader did not return HTTP 2xx.');
      await page.waitForFunction(
        () => document.querySelector('#verse-1 > p')?.textContent?.toLowerCase().includes('beginning') === true,
        undefined,
        { timeout: 45_000 },
      );
      if (await page.locator('#app-recovery-title').count()) {
        throw new Error('The public reader displayed the failure-recovery interface.');
      }
      console.log(JSON.stringify({ viewport: name, url: reader.href, sourceCommit: expectedCommit, rendered: true }));
    } finally {
      await page.screenshot({ path: 'test-results/live-smoke/' + name + '.png', fullPage: true, timeout: 10_000 }).catch(() => {});
      await context.close();
    }
  }
} finally {
  await browser.close();
}

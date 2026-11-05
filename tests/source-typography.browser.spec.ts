import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

interface SourceDraw { text: string; font: string; direction: string; align: string; width: number; x: number; y: number }
declare global {
  interface Window {
    __sourceTypography: { read: (canvas: HTMLCanvasElement) => SourceDraw[]; revision: (canvas: HTMLCanvasElement) => number };
    __heldSourceFont: { pending: boolean; release: () => void; settled: Promise<void> };
  }
}

function sourceText(edition: string, book: string, chapter: number, verse: number): string {
  // Resolve the actual imported corpus at execution, so collection does not need
  // a separate fixture copy and a missing release source cannot silently pass.
  const value = JSON.parse(readFileSync(new URL(`../data/editions/${edition}/books/${book}.json`, import.meta.url), 'utf8'));
  return value.chapters.find((row: { number: number }) => row.number === chapter).verses.find((row: { number: number }) => row.number === verse).text;
}

async function observeCanvas(page: Page) {
  await page.addInitScript(() => {
    const draws = new WeakMap<HTMLCanvasElement, SourceDraw[]>(), revisions = new WeakMap<HTMLCanvasElement, number>();
    window.__sourceTypography = { read: canvas => draws.get(canvas) || [], revision: canvas => revisions.get(canvas) || 0 };
    const prototype = CanvasRenderingContext2D.prototype;
    const fillText = prototype.fillText, fillRect = prototype.fillRect, clearRect = prototype.clearRect;
    prototype.fillText = function (text, x, y, maxWidth) {
      const list = draws.get(this.canvas) || [];
      list.push({ text, font: this.font, direction: this.direction, align: this.textAlign, width: this.measureText(text).width, x, y });
      draws.set(this.canvas, list);
      if (maxWidth === undefined) fillText.call(this, text, x, y);
      else fillText.call(this, text, x, y, maxWidth);
    };
    prototype.fillRect = function (x, y, width, height) {
      if (x === 0 && y === 0 && width >= this.canvas.width && height >= this.canvas.height) {
        draws.set(this.canvas, []); revisions.set(this.canvas, (revisions.get(this.canvas) || 0) + 1);
      }
      fillRect.call(this, x, y, width, height);
    };
    prototype.clearRect = function (x, y, width, height) {
      if (x === 0 && y === 0 && width >= this.canvas.width && height >= this.canvas.height) draws.set(this.canvas, []);
      clearRect.call(this, x, y, width, height);
    };
  });
}

async function sourceDraws(canvas: Locator, family: string): Promise<SourceDraw[]> {
  return canvas.evaluate((element, name) => window.__sourceTypography.read(element as HTMLCanvasElement).filter(row => row.font.includes(name)), family);
}

async function expectLoadedFont(page: Page, family: string) {
  expect(await page.evaluate(name => [...document.fonts].filter(face => face.family.replaceAll('"', '') === name).map(face => face.status), family)).toEqual(['loaded']);
}

function expectCompleteLines(rows: SourceDraw[], text: string, direction: 'rtl' | 'ltr') {
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.map(row => row.text).join('')).toBe(text);
  for (const row of rows) {
    expect(row.direction).toBe(direction);
    expect(row.align).toBe(direction === 'rtl' ? 'right' : 'left');
    expect(row.width).toBeLessThanOrEqual(888.5);
    expect(row.x).toBe(direction === 'rtl' ? 984 : 96);
    expect(row.y).toBeGreaterThan(0);
    // Myanmar dependent signs and Arabic combining marks cannot start a new
    // painted line. In particular Intl graphemes alone split Myanmar ကာ.
    expect(row.text).not.toMatch(/^[\p{M}\u102b-\u103e]/u);
  }
}

test.describe('source-script canvas rendering', () => {
  test.use({ serviceWorkers: 'block' });

  for (const item of [
    { edition: 'arb-vandyck', book: 'JHN', chapter: 3, verse: 16, family: 'Adigun Naskh', direction: 'rtl' as const },
    { edition: 'mya-judson1840', book: 'LEV', chapter: 4, verse: 2, family: 'Adigun Myanmar', direction: 'ltr' as const },
  ]) {
    test(`${item.edition} paints the exact supplied source with loaded font, safe line boundaries and correct direction`, async ({ page }, testInfo) => {
      const text = sourceText(item.edition, item.book, item.chapter, item.verse);
      await observeCanvas(page);
      await page.setViewportSize({ width: 320, height: 844 });
      await page.goto(`#/share/${item.book}/${item.chapter}?verse=${item.verse}&edition=${item.edition}`);
      await expect(page.getByRole('button', { name: 'Download PNG', exact: true })).toBeEnabled();
      const canvas = page.locator('.share-preview canvas');
      await expectLoadedFont(page, item.family);
      expectCompleteLines(await sourceDraws(canvas, item.family), text, item.direction);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await testInfo.attach(`${item.edition}-source-card`, { body: await canvas.screenshot(), contentType: 'image/png' });
    });
  }

  test('bilingual cards keep Arabic bidi and Myanmar source units through pagination', async ({ page }, testInfo) => {
    const arabic = sourceText('arb-vandyck', 'JHN', 3, 16), myanmar = sourceText('mya-judson1840', 'JHN', 3, 16);
    await observeCanvas(page);
    await page.goto('#/share/JHN/3?verse=16&edition=arb-vandyck');
    const cards = page.locator('.multi-cards');
    await cards.getByRole('combobox', { name: 'Second source edition', exact: true }).selectOption('mya-judson1840');
    await cards.getByRole('button', { name: 'Prepare passage cards', exact: true }).click();
    const canvas = cards.locator('canvas');
    await expect(canvas).toBeVisible();
    const count = await cards.getByRole('combobox', { name: 'Prepared card number', exact: true }).locator('option').count();
    const arabicRows: SourceDraw[] = [], myanmarRows: SourceDraw[] = [];
    for (let index = 0; index < count; index++) {
      const previous = await canvas.evaluate(element => window.__sourceTypography.revision(element as HTMLCanvasElement));
      await cards.getByRole('combobox', { name: 'Prepared card number', exact: true }).selectOption(String(index));
      await expect(canvas).toHaveAttribute('aria-label', `Prepared passage card ${index + 1} of ${count}`);
      if (index) await expect.poll(() => canvas.evaluate(element => window.__sourceTypography.revision(element as HTMLCanvasElement))).toBeGreaterThan(previous);
      arabicRows.push(...await sourceDraws(canvas, 'Adigun Naskh'));
      myanmarRows.push(...await sourceDraws(canvas, 'Adigun Myanmar'));
    }
    expectCompleteLines(arabicRows, arabic, 'rtl');
    expectCompleteLines(myanmarRows, myanmar, 'ltr');
    await expectLoadedFont(page, 'Adigun Naskh'); await expectLoadedFont(page, 'Adigun Myanmar');
    await testInfo.attach('bilingual-source-card', { body: await canvas.screenshot(), contentType: 'image/png' });
  });

  test('a delayed old font request cannot overwrite the newly selected share verse', async ({ page }) => {
    const first = sourceText('arb-vandyck', 'JHN', 3, 16), next = sourceText('arb-vandyck', 'JHN', 3, 17);
    await observeCanvas(page);
    await page.addInitScript(firstText => {
      const load = document.fonts.load.bind(document.fonts);
      let release!: () => void, finished!: () => void;
      const barrier = new Promise<void>(resolve => { release = resolve; });
      const settled = new Promise<void>(resolve => { finished = resolve; });
      window.__heldSourceFont = { pending: false, release, settled };
      document.fonts.load = async (font, text) => {
        if (font.includes('Adigun Naskh') && text === firstText) {
          window.__heldSourceFont.pending = true;
          await barrier;
          try { return await load(font, text); }
          finally { finished(); }
        }
        return load(font, text);
      };
    }, first);
    await page.goto('#/share/JHN/3?verse=16&edition=arb-vandyck');
    await page.waitForFunction(() => window.__heldSourceFont.pending);
    await expect(page.getByRole('button', { name: 'Download PNG', exact: true })).toBeDisabled();
    expect(await sourceDraws(page.locator('.share-preview canvas'), 'Adigun Naskh')).toEqual([]);
    await page.evaluate(() => { location.hash = '#/share/JHN/3?verse=17&edition=arb-vandyck'; });
    await expect(page.getByRole('button', { name: 'Download PNG', exact: true })).toBeEnabled();
    const canvas = page.locator('.share-preview canvas');
    expectCompleteLines(await sourceDraws(canvas, 'Adigun Naskh'), next, 'rtl');
    await page.evaluate(async () => {
      window.__heldSourceFont.release(); await window.__heldSourceFont.settled;
      // Let the released load's promise continuations and the next paint settle.
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    });
    const rows = await sourceDraws(canvas, 'Adigun Naskh');
    expectCompleteLines(rows, next, 'rtl');
    expect(rows.map(row => row.text).join('')).not.toBe(first);
  });

  test('an unavailable bundled source font prevents a fallback-font image export', async ({ page }) => {
    await observeCanvas(page);
    await page.route(/\/assets\/NotoNaskhArabic-[^/]+\.ttf$/, route => route.abort('failed'));
    await page.goto('#/share/JHN/3?verse=16&edition=arb-vandyck');
    await expect(page.locator('.share-controls').getByRole('alert')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download PNG', exact: true })).toBeDisabled();
    expect(await sourceDraws(page.locator('.share-preview canvas'), 'Adigun Naskh')).toEqual([]);
  });
});

test('both pinned fonts and their original license notices remain verifiable after an offline reload', async ({ page, context }) => {
  const manifestBytes = readFileSync(new URL('../public/fonts/sources.json', import.meta.url));
  const source = JSON.parse(manifestBytes.toString('utf8'));
  const pins = source.fonts.map((font: { path: string; sha256: string; bytes: number; noticePath: string; noticeSha256: string }) => ({
    name: font.path.split('/').at(-1)!.replace('.ttf', ''), sha256: font.sha256, bytes: font.bytes,
    notice: font.noticePath.replace(/^public\//, ''), noticeSha256: font.noticeSha256,
  }));
  await page.goto('#/read/JHN/3?verse=16&edition=eng-web');
  await expect(page.locator('#verse-16')).toBeVisible();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const paths = await page.evaluate(async pins => {
    const base = new URL('/Adigun-AiBible/', location.origin);
    const metadata = await (await fetch(new URL('offline-manifest.json', base))).json();
    const cache = await caches.open(`${metadata.cachePrefix}shell-${metadata.buildVersion}`);
    const keys = (await cache.keys()).map(request => new URL(request.url).pathname.slice(base.pathname.length));
    const paths: { path: string; sha256: string; bytes?: number }[] = [];
    for (const pin of pins) {
      const matches = keys.filter(path => path.startsWith(`assets/${pin.name}-`) && path.endsWith('.ttf'));
      if (matches.length !== 1) throw new Error(`Expected exactly one pinned ${pin.name} shell font.`);
      paths.push({ path: matches[0], sha256: pin.sha256, bytes: pin.bytes }, { path: pin.notice, sha256: pin.noticeSha256 });
    }
    paths.push({ path: 'fonts/sources.json', sha256: '' });
    for (const item of paths) if (!await cache.match(new URL(item.path, base))) throw new Error(`Missing offline font source or notice: ${item.path}`);
    // Warm only the existing English reader source; this test concerns font
    // installation, while the edition suite owns atomic Myanmar book downloads.
    await fetch(new URL('data/books/JHN.json', base));
    return paths;
  }, pins);
  paths.find(row => row.path === 'fonts/sources.json')!.sha256 = createHash('sha256').update(manifestBytes).digest('hex');
  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.locator('#verse-16')).toBeVisible();
    const verified = await page.evaluate(async paths => {
      const base = new URL('/Adigun-AiBible/', location.origin), result = [];
      for (const file of paths) {
        const response = await fetch(new URL(file.path, base), { cache: 'no-store' });
        if (!response.ok) throw new Error(`Offline font request failed: ${file.path}`);
        const bytes = await response.arrayBuffer();
        const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
        result.push({ path: file.path, sha256, bytes: bytes.byteLength });
      }
      return result;
    }, paths);
    for (const pin of paths) {
      const actual = verified.find(row => row.path === pin.path)!;
      expect(actual.sha256, pin.path).toBe(pin.sha256);
      if (pin.bytes !== undefined) expect(actual.bytes, pin.path).toBe(pin.bytes);
    }
    const samples = { arabic: sourceText('arb-vandyck', 'JHN', 3, 16), myanmar: sourceText('mya-judson1840', 'LEV', 4, 2) };
    const loaded = await page.evaluate(async text => {
      const arabic = await document.fonts.load('400 24px "Adigun Naskh"', text.arabic);
      const myanmar = await document.fonts.load('400 24px "Adigun Myanmar"', text.myanmar);
      return [arabic.length, myanmar.length, ...arabic.map(face => face.status), ...myanmar.map(face => face.status)];
    }, samples);
    expect(loaded).toEqual([1, 1, 'loaded', 'loaded']);
  } finally { await context.setOffline(false); }
});

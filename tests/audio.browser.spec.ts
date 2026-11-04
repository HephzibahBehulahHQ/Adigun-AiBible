import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

interface FixtureUtterance {
  text: string; voice: { name: string; lang: string } | null; lang: string; rate: number;
  onstart: (() => void) | null; onend: (() => void) | null; onerror: (() => void) | null; onpause: (() => void) | null; onresume: (() => void) | null;
}
interface FixtureSpeech {
  utterances: FixtureUtterance[];
  logs: { text: string; language: string; rate: number }[];
  cancellations: number;
  setVoices: (kind: 'local' | 'none' | 'network') => void;
  finish: (index: number) => void;
}
declare global { interface Window { __testSpeech: FixtureSpeech } }
type SourceBook = { chapters: { number: number; verses: { number: number; text: string }[] }[] };
const readBook = (path: string): SourceBook => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const englishJohn = readBook('data/books/JHN.json'); const germanJohn = readBook('data/editions/deu1912/books/JHN.json');
const wording = (book: SourceBook, verse: number) => book.chapters.find(chapter => chapter.number === 3)!.verses.find(row => row.number === verse)!.text;
const route = (view = 'audio') => `#/${view}/JHN/3?verse=16&edition=eng-web`;

// This deterministic speech adapter exists only in browser tests. Actual device audio is not certified by it.
async function installSpeechFixture(page: Page) {
  await page.addInitScript(() => {
    const english = { name: 'Fixture English local voice', voiceURI: 'fixture-english', lang: 'en-GB', localService: true, default: true };
    const german = { name: 'Fixture German local voice', voiceURI: 'fixture-german', lang: 'de-DE', localService: true, default: false };
    const network = { ...english, name: 'Fixture network voice', voiceURI: 'fixture-network', localService: false };
    let voices = [english, german]; let paused = false; let speaking = false; let current: FixtureUtterance | null = null;
    class Utterance implements FixtureUtterance {
      text: string; voice: FixtureUtterance['voice'] = null; lang = ''; rate = 1;
      onstart: (() => void) | null = null; onend: (() => void) | null = null; onerror: (() => void) | null = null; onpause: (() => void) | null = null; onresume: (() => void) | null = null;
      constructor(text: string) { this.text = text; }
    }
    const events = new EventTarget();
    const fixture: FixtureSpeech = {
      utterances: [], logs: [], cancellations: 0,
      setVoices(kind) { voices = kind === 'none' ? [] : kind === 'network' ? [network] : [english, german]; events.dispatchEvent(new Event('voiceschanged')); },
      finish(index) { speaking = false; fixture.utterances[index].onend?.(); },
    };
    const synthesis = {
      get paused() { return paused; }, get speaking() { return speaking; }, get pending() { return false; },
      getVoices: () => voices,
      speak(utterance: FixtureUtterance) { current = utterance; fixture.utterances.push(utterance); fixture.logs.push({ text: utterance.text, language: utterance.voice?.lang || utterance.lang, rate: utterance.rate }); speaking = true; paused = false; queueMicrotask(() => utterance.onstart?.()); },
      cancel() { fixture.cancellations++; speaking = false; paused = false; current = null; },
      pause() { paused = true; current?.onpause?.(); },
      resume() { paused = false; current?.onresume?.(); },
      addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
    };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synthesis });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: Utterance });
    window.__testSpeech = fixture;
  });
}

async function openAudio(page: Page) {
  await page.goto(route());
  await expect(page.getByRole('heading', { name: 'Audio reader', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add listening passage', exact: true })).toBeEnabled();
}

test('listening queue preserves exact sources, finite bilingual playback, bookmarks and resume', async ({ page }) => {
  await installSpeechFixture(page); await openAudio(page);
  await page.getByLabel('Last verse', { exact: true }).fill('17');
  await page.getByLabel('Passage repetitions', { exact: true }).selectOption('2');
  await page.getByLabel('Then another edition', { exact: true }).selectOption('deu1912');
  await page.getByRole('button', { name: 'Add alternating passages', exact: true }).click();
  await expect(page.locator('.audio-queue > li')).toHaveCount(2);
  await page.getByRole('button', { name: 'Move listening item 2 up', exact: true }).click();
  await expect(page.locator('.audio-queue > li').first()).toContainText('Luther');
  await page.getByRole('button', { name: 'Move listening item 1 down', exact: true }).click();
  await expect(page.locator('.audio-queue > li').first()).toContainText('World English Bible');
  await expect(page.getByRole('button', { name: 'Play queue', exact: true })).toBeEnabled();
  await page.reload(); await expect(page.locator('.audio-queue > li')).toHaveCount(2);
  expect(await page.evaluate(() => window.__testSpeech.logs)).toEqual([]);
  await page.getByRole('button', { name: 'Play queue', exact: true }).click();
  await expect(page.locator('.audio-playback-status')).toHaveAttribute('data-phase', 'playing');
  await page.getByRole('button', { name: 'Pause listening', exact: true }).click();
  await expect(page.locator('.audio-playback-status')).toHaveAttribute('data-phase', 'paused');
  await page.getByRole('button', { name: 'Resume listening', exact: true }).click();
  await expect(page.locator('.audio-playback-status')).toHaveAttribute('data-phase', 'playing');
  await page.getByRole('button', { name: 'Bookmark current verse', exact: true }).click();
  await expect(page.locator('.audio-bookmarks > li')).toHaveCount(1);
  const expected = [wording(englishJohn, 16), wording(englishJohn, 17), wording(englishJohn, 16), wording(englishJohn, 17), wording(germanJohn, 16), wording(germanJohn, 17), wording(germanJohn, 16), wording(germanJohn, 17)];
  for (let index = 0; index < expected.length; index++) {
    await expect.poll(() => page.evaluate(index => window.__testSpeech.logs[index]?.text, index)).toBe(expected[index]);
    await page.evaluate(index => window.__testSpeech.finish(index), index);
  }
  await expect(page.locator('.audio-playback-status')).toHaveAttribute('data-phase', 'ended');
  expect(await page.evaluate(() => window.__testSpeech.logs.map(row => row.language))).toEqual(['en-GB', 'en-GB', 'en-GB', 'en-GB', 'de-DE', 'de-DE', 'de-DE', 'de-DE']);
  await expect(page.locator('.audio-save-status')).toHaveText('Listening position saved on this device.');
  await page.reload(); await expect(page.locator('.audio-bookmarks > li')).toHaveCount(1); await expect(page.locator('.audio-queue')).toContainText('Queue finished here');
  expect(await page.evaluate(() => window.__testSpeech.logs)).toEqual([]);
});

test('listening reports absent voices and requires network consent without claiming offline speech', async ({ page }) => {
  await installSpeechFixture(page); await openAudio(page);
  await page.getByRole('button', { name: 'Add listening passage', exact: true }).click(); await expect(page.locator('.audio-queue > li')).toHaveCount(1);
  await page.evaluate(() => window.__testSpeech.setVoices('none'));
  await page.getByRole('button', { name: 'Play queue', exact: true }).click(); await expect(page.locator('.audio-playback-status')).toContainText('No selected matching en voice');
  expect(await page.evaluate(() => window.__testSpeech.logs.length)).toBe(0);
  await page.evaluate(() => window.__testSpeech.setVoices('network'));
  await page.getByRole('button', { name: 'Play queue', exact: true }).click(); await expect(page.locator('.audio-playback-status')).toContainText('Allow network-voice processing explicitly');
  expect(await page.evaluate(() => window.__testSpeech.logs.length)).toBe(0);
  await page.getByRole('checkbox', { name: 'Allow network voices to process the scripture in this queue for this visit.', exact: true }).check();
  await page.getByRole('button', { name: 'Play queue', exact: true }).click(); await expect(page.locator('.audio-playback-status')).toHaveAttribute('data-phase', 'playing');
  await page.evaluate(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, value: false }); window.dispatchEvent(new Event('offline')); });
  await expect(page.locator('.audio-playback-status')).toContainText('Internet disconnected');
  await page.evaluate(() => { window.__testSpeech.utterances[0].onstart?.(); window.__testSpeech.finish(0); });
  await expect(page.locator('.audio-playback-status')).toHaveAttribute('data-phase', 'stopped');
  expect(await page.evaluate(() => window.__testSpeech.logs.length)).toBe(1);
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('malformed and misleading listening backups cannot replace the saved queue', async ({ page }) => {
  await installSpeechFixture(page); await openAudio(page);
  await page.getByRole('button', { name: 'Add listening passage', exact: true }).click(); await expect(page.locator('.audio-queue > li')).toHaveCount(1);
  const input = page.getByLabel('Preview listening backup', { exact: true });
  await input.setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
  await expect(page.getByRole('alert')).toContainText('valid listening JSON'); await expect(page.locator('.audio-queue > li')).toHaveCount(1);
  const request = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download listening backup', exact: true }).click(); const download = await request; const path = await download.path();
  expect(path).not.toBeNull(); const backup = JSON.parse(readFileSync(path!, 'utf8')); backup.workspace.entries[0].language = 'de'; backup.workspace.entries[0].editionName = 'Misleading imported label';
  await input.setInputFiles({ name: 'misleading.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(page.getByRole('alert')).toContainText('does not match the installed edition'); await expect(page.getByRole('button', { name: 'Replace listening workspace', exact: true })).toHaveCount(0);
  await expect(page.locator('.audio-queue > li')).toHaveCount(1); await page.reload(); await expect(page.locator('.audio-queue > li')).toHaveCount(1); await expect(page.locator('.audio-queue')).not.toContainText('Misleading imported label');
});

test('reader speech cancels on edition and verse changes and ignores old utterance callbacks', async ({ page }) => {
  await installSpeechFixture(page); await page.goto(route('read'));
  await expect(page.locator('#verse-16 > p')).toBeVisible();
  await page.getByRole('button', { name: 'Listen', exact: true }).click();
  await page.getByRole('button', { name: 'Play selected passage', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause speech', exact: true })).toBeVisible();
  await page.getByLabel('Reading preset', { exact: true }).selectOption('de');
  await expect(page.locator('.scripture')).toHaveAttribute('lang', 'de');
  await page.evaluate(() => { window.__testSpeech.utterances[0].onstart?.(); window.__testSpeech.utterances[0].onend?.(); });
  await expect(page.getByRole('button', { name: 'Pause speech', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Play selected passage', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause speech', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Select verse 17', exact: true }).click();
  await page.evaluate(() => { window.__testSpeech.utterances[1].onstart?.(); window.__testSpeech.utterances[1].onerror?.(); });
  await expect(page.getByRole('button', { name: 'Pause speech', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.__testSpeech.logs.length)).toBe(2);
});

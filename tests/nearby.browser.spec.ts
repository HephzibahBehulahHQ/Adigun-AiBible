import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// Two real browser pages exercise RTC, not a mock relay. This is not two physical devices.
test.use({ serviceWorkers: 'block' });
const route = '#/nearby/GEN/1?verse=1&end=2&edition=eng-web';
const control = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

async function pair(host: Page, guest: Page) {
  await host.getByRole('textbox', { name: 'Your display name', exact: true }).fill('Host reader');
  await guest.getByRole('textbox', { name: 'Your display name', exact: true }).fill('Guest reader');
  await guest.getByRole('combobox', { name: 'Your role', exact: true }).selectOption('guest');
  await control(host, 'Create pairing offer').click();
  const hostCode = host.getByRole('textbox', { name: 'Your pairing code', exact: true });
  await expect(hostCode).toBeVisible();
  const offer = await hostCode.inputValue();
  expect(JSON.parse(offer).description.sdp).not.toMatch(/ typ (?:relay|srflx)\b/);
  await guest.getByRole('textbox', { name: 'Paste host offer', exact: true }).fill(offer);
  await control(guest, 'Create pairing answer').click();
  const guestCode = guest.getByRole('textbox', { name: 'Your pairing code', exact: true });
  await expect(guestCode).toBeVisible();
  await host.getByRole('textbox', { name: 'Paste guest answer', exact: true }).fill(await guestCode.inputValue());
  await control(host, 'Accept guest answer').click();
  const verifiedHost = host.getByRole('status', { name: 'Connection verification code', exact: true });
  const verifiedGuest = guest.getByRole('status', { name: 'Connection verification code', exact: true });
  await expect(verifiedHost).toHaveText(/^[A-F0-9]{4}( [A-F0-9]{4}){3}$/);
  await expect(verifiedGuest).toHaveText((await verifiedHost.textContent())!);
  await expect(control(host, 'Approve this guest')).toBeEnabled();
  await expect(control(guest, 'Confirm this host')).toBeEnabled();
  return (await verifiedHost.textContent())!;
}

test('nearby RTC pages require approval, retain personal editions, transfer verified text and reconnect', async ({ page: host, context }) => {
  test.setTimeout(90_000);
  const guest = await context.newPage();
  await host.goto(route); await guest.goto(route);
  await expect(host.getByRole('heading', { name: 'Nearby study room', exact: true })).toBeVisible();
  await expect(guest.getByRole('heading', { name: 'Nearby study room', exact: true })).toBeVisible();
  const firstCode = await pair(host, guest);
  await host.getByRole('textbox', { name: 'Write to the room', exact: true }).fill('Explicitly shared test discussion');
  await expect(control(host, 'Send to participant')).toBeDisabled();
  await control(host, 'Approve this guest').click();
  await expect(guest.getByText('The other participant has approved.', { exact: true })).toBeVisible();
  await expect(control(host, 'Send to participant')).toBeDisabled();
  await control(guest, 'Confirm this host').click();
  await expect(control(host, 'Send to participant')).toBeEnabled();
  await control(host, 'Send to participant').click();
  await expect(guest.getByRole('list', { name: 'Room discussion', exact: true })).toContainText('Explicitly shared test discussion');

  await guest.getByRole('combobox', { name: 'Your Bible edition', exact: true }).selectOption('deu1912');
  await host.getByRole('textbox', { name: 'Book code', exact: true }).fill('JHN');
  await host.getByRole('spinbutton', { name: 'Chapter', exact: true }).fill('3');
  await host.getByRole('spinbutton', { name: 'First verse', exact: true }).fill('16');
  await host.getByRole('spinbutton', { name: 'Last verse', exact: true }).fill('17');
  await control(host, 'Open and propose passage').click();
  await expect(guest.getByText('Host proposed JHN 3:16–17.', { exact: false })).toBeVisible();
  await control(guest, 'Read proposed passage').click();
  await expect(guest.getByRole('combobox', { name: 'Your Bible edition', exact: true })).toHaveValue('deu1912');
  await expect(guest.locator('.nearby-source')).toContainText('Lutherbibel 1912');
  const german = JSON.parse(await readFile(new URL('../data/editions/deu1912/books/JHN.json', import.meta.url), 'utf8'));
  const germanVerse = german.chapters.find((row: {number:number}) => row.number === 3).verses.find((row: {number:number}) => row.number === 16).text;
  await expect(guest.locator('.nearby-source')).toContainText(germanVerse);

  await control(host, 'Offer passage package').click();
  await control(guest, 'Decline passage package').click();
  await expect(host.getByText('Passage transfer cancelled.', { exact: true })).toBeVisible();
  await expect(control(host, 'Offer passage package')).toBeEnabled();
  await control(host, 'Offer passage package').click();
  await control(guest, 'Accept passage package').click();
  await expect(guest.getByText('Passage received and verified against the installed source.', { exact: true })).toBeVisible();
  const downloading = guest.waitForEvent('download');
  await control(guest, 'Download received passage').click();
  const saved = await readFile((await (await downloading).path())!, 'utf8');
  const english = JSON.parse(await readFile(new URL('../data/books/JHN.json', import.meta.url), 'utf8'));
  const englishVerse = english.chapters.find((row: {number:number}) => row.number === 3).verses.find((row: {number:number}) => row.number === 16).text;
  expect(saved).toContain(englishVerse); expect(saved).toContain('World English Bible'); expect(saved).toContain('Edition source SHA-256:');
  await expect(guest.getByRole('combobox', { name: 'Your Bible edition', exact: true })).toHaveValue('deu1912');

  await control(host, 'Disconnect and reset pairing').click();
  await expect(guest.getByText('Connection: Disconnected · create a fresh offer to reconnect', { exact: true })).toBeVisible();
  await control(guest, 'Disconnect and reset pairing').click();
  const secondCode = await pair(host, guest); expect(secondCode).not.toBe(firstCode);
  await control(host, 'Approve this guest').click(); await control(guest, 'Confirm this host').click();
  await guest.getByRole('textbox', { name: 'Write to the room', exact: true }).fill('Fresh connection works');
  await expect(control(guest, 'Send to participant')).toBeEnabled(); await control(guest, 'Send to participant').click();
  await expect(host.getByRole('list', { name: 'Room discussion', exact: true })).toContainText('Fresh connection works');
  await control(host, 'Disconnect and reset pairing').click(); await control(guest, 'Disconnect and reset pairing').click();
});

test('approved nearby readers complete the source-linked detective mission together', async ({ page: host, context }) => {
  test.setTimeout(90_000);
  const guest = await context.newPage();
  await host.goto(route); await guest.goto(route);
  await pair(host, guest);
  await control(host, 'Approve this guest').click();
  await expect(guest.getByText('The other participant has approved.', { exact: true })).toBeVisible();
  await control(guest, 'Confirm this host').click();
  await expect(control(host, 'Start shared Good Samaritan mission')).toBeEnabled();
  await guest.getByRole('combobox', { name: 'Your Bible edition', exact: true }).selectOption('deu1912');
  await control(host, 'Start shared Good Samaritan mission').click();
  await expect(host.getByText('Evidence clue 1 of 5', { exact: false })).toBeVisible();
  await expect(guest.getByText('Evidence clue 1 of 5', { exact: false })).toBeVisible();
  await control(guest, 'Open this clue in my selected edition').click();
  const german = JSON.parse(await readFile(new URL('../data/editions/deu1912/books/LUK.json', import.meta.url), 'utf8'));
  const germanVerse = german.chapters.find((row: {number:number}) => row.number === 10).verses.find((row: {number:number}) => row.number === 25).text;
  await expect(guest.locator('.nearby-source')).toContainText('Lutherbibel 1912');
  await expect(guest.locator('.nearby-source')).toContainText(germanVerse);

  await guest.getByLabel('A Roman soldier', { exact: true }).check();
  await control(guest, 'Send answer to host').click();
  await expect(control(guest, 'Send answer to host')).toBeDisabled();
  await expect(host.getByText('Guest reader suggested: A Roman soldier', { exact: true })).toBeVisible();
  await control(host, 'Check guest answer').click();
  await expect(guest.getByText('Not quite. Re-read the cited passage and discuss it before trying again.', { exact: true })).toBeVisible();
  await expect(control(guest, 'Send answer to host')).toBeEnabled();
  await guest.getByLabel('A lawyer', { exact: true }).check();
  await control(guest, 'Send answer to host').click();
  await expect(host.getByText('Guest reader suggested: A lawyer', { exact: true })).toBeVisible();
  await control(host, 'Check guest answer').click();
  await expect(host.getByText('Evidence clue 2 of 5', { exact: false })).toBeVisible();
  await expect(guest.getByText('Evidence clue 2 of 5', { exact: false })).toBeVisible();

  const answers = [
    ['A priest and a Levite', 'Evidence clue 3 of 5'],
    ['A Samaritan', 'Evidence clue 4 of 5'],
    ['He treated the wounds, used his animal and arranged care at an inn', 'Evidence clue 5 of 5'],
    ['The one who showed mercy', 'Mission complete'],
  ] as const;
  for (const [answer, next] of answers) {
    await guest.getByLabel(answer, { exact: true }).check();
    await control(guest, 'Send answer to host').click();
    await expect(host.getByRole('button', { name: 'Check guest answer', exact: true })).toBeEnabled();
    await control(host, 'Check guest answer').click();
    await expect(host.getByText(next, { exact: false })).toBeVisible();
    await expect(guest.getByText(next, { exact: false })).toBeVisible();
  }
  await control(host, 'Disconnect and reset pairing').click();
  await control(guest, 'Disconnect and reset pairing').click();
});

test('reset remains available during pairing and stale completion cannot restore the old connection', async ({ page }) => {
  await page.addInitScript(() => {
    const state = window as typeof window & { releaseNearbyOffer?: () => void };
    const original = RTCPeerConnection.prototype.createOffer;
    let first = true;
    RTCPeerConnection.prototype.createOffer = async function (options?: RTCOfferOptions) {
      const description = await original.call(this, options);
      if (first) { first = false; await new Promise<void>(resolve => { state.releaseNearbyOffer = resolve; }); }
      return description;
    };
  });
  await page.goto(route);
  await page.getByRole('textbox', { name: 'Your display name', exact: true }).fill('Pairing cancellation');
  await control(page, 'Create pairing offer').click();
  await expect.poll(() => page.evaluate(() => typeof (window as typeof window & { releaseNearbyOffer?: () => void }).releaseNearbyOffer)).toBe('function');
  await expect(control(page, 'Disconnect and reset pairing')).toBeEnabled();
  await control(page, 'Disconnect and reset pairing').click();
  await page.evaluate(async () => { (window as typeof window & { releaseNearbyOffer?: () => void }).releaseNearbyOffer?.(); await new Promise(resolve => setTimeout(resolve, 0)); });
  await expect(page.getByText('Connection: Not connected', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Your pairing code', exact: true })).toHaveCount(0);
  await control(page, 'Create pairing offer').click();
  await expect(page.getByRole('textbox', { name: 'Your pairing code', exact: true })).toBeVisible();
  await control(page, 'Disconnect and reset pairing').click();
});

test('unsupported transport keeps standalone reading and honest limitations at 320px', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'RTCPeerConnection', { value: undefined, configurable: true }));
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto(route);
  await expect(page.getByText('WebRTC data channels are unavailable in this browser or page context. Use the reader and downloaded study tools on this device.', { exact: true })).toBeVisible();
  await expect(page.locator('.nearby-source')).toContainText('World English Bible');
  await expect(page.getByText(/Real internet-disabled testing on two physical devices is still pending/)).toBeVisible();
  await expect(control(page, 'Send to participant')).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

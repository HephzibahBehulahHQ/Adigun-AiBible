import { expect, test } from '@playwright/test';

test('crisis resources open independently of an unavailable scripture edition',async({page})=>{
  await page.goto('#/read/JHN/3?verse=16&edition=missing-edition');
  await page.getByRole('button',{name:'When you’re in crisis: support resources'}).click();
  await expect(page.getByRole('heading',{name:'Support resources',exact:true})).toBeVisible();
  await page.getByLabel('Country',{exact:true}).selectOption('DE');
  await expect(page.getByRole('link',{name:/Call.*112/})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading',{name:'Support resources',exact:true})).toBeVisible();
});

test('assistant actions preserve passage identity and window preferences',async({page,isMobile})=>{
  await page.goto('#/read/JHN/3?verse=16&edition=eng-bsb');
  const launcher=page.getByRole('button',{name:'Open Adigun BOT',exact:true});
  await launcher.click();
  await expect(page.getByRole('dialog',{name:'Adigun BOT'})).toBeVisible();
  if(!isMobile){
    const resize=page.getByRole('button',{name:'Resize assistant with arrow keys'});
    await resize.focus();await page.keyboard.press('ArrowLeft');
    await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('adigun-aibible-bot-layout-v2')||'{}').width)).toBe(430);
  }
  await page.getByRole('button',{name:'Show passage context',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Passage context',exact:true})).toBeVisible();
  await expect(page).toHaveURL(/read\/JHN\/3\?verse=16&edition=eng-bsb/);
  if(isMobile)await page.getByRole('button',{name:'Close inspector',exact:true}).click();
  await launcher.click();
  await page.getByRole('button',{name:'Open Law Diary',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Law Diary',exact:true})).toBeVisible();
  await expect(page).toHaveURL(/book=JHN/);
});

test.describe('offline navigation',()=>{
  test.use({serviceWorkers:'block'});
  test('offline banner distinguishes an unavailable chapter from cached source',async({page,context})=>{
    await page.goto('#/read/GEN/1?verse=1&edition=eng-web');
    await expect(page.locator('#verse-1')).toBeVisible();
    await context.setOffline(true);
    await expect(page.locator('.offline-banner')).toContainText('Offline — showing cached chapters');
    await page.evaluate(()=>{location.hash='#/read/REV/22?verse=1&edition=eng-web';});
    await expect(page.getByText("This chapter isn't cached yet. Reconnect to load it.",{exact:true})).toBeVisible();
    await context.setOffline(false);
  });
});

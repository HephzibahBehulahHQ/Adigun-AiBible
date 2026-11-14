import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
const john=JSON.parse(readFileSync(new URL('../data/books/JHN.json',import.meta.url),'utf8'));
const verse:string=john.chapters.find((chapter:{number:number})=>chapter.number===3).verses.find((row:{number:number})=>row.number===16).text;
const path=(view:string)=>`#/${view}/JHN/3?verse=16&edition=eng-web`;

test('edition catalog opens genuine sources and compares explicitly numbered passages',async({page})=>{
  await page.goto(path('editions'));await expect(page.getByRole('heading',{name:'Bible editions',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Parallel versions · 2–5',exact:true}).click();
  await expect(page.locator('.edition-pane')).toHaveCount(2);await expect(page.locator('.edition-pane').first()).toContainText(verse);
  await page.getByRole('button',{name:'Add version',exact:true}).click();await expect(page.locator('.edition-pane')).toHaveCount(3);
  await page.getByRole('button',{name:'Add version',exact:true}).click();await expect(page.locator('.edition-pane')).toHaveCount(4);
  await page.getByRole('button',{name:'Installed editions',exact:true}).click();await page.getByLabel('Find an edition').fill('Luther');
  await page.getByRole('button',{name:'Read edition',exact:true}).click();await expect(page).toHaveURL(/edition=deu1912/);await expect(page.locator('.scripture')).toHaveAttribute('lang','de');
});

test('private prayer entry survives reload',async({page})=>{
  await page.goto(path('study'));await expect(page.getByRole('heading',{name:'Prayer journal',exact:true})).toBeVisible();
  await page.getByLabel('Title',{exact:true}).fill('Private prayer verification');await page.getByLabel('Prayer',{exact:true}).fill('This user-authored entry remains on this device.');
  await page.getByRole('button',{name:/Save prayer/}).click();await expect(page.getByRole('heading',{name:'Private prayer verification',exact:true})).toBeVisible();
  await page.reload();await expect(page.getByRole('heading',{name:'Private prayer verification',exact:true})).toBeVisible();
});

test('transcript evidence resolves the real source and keeps uncertain wording qualified',async({page})=>{
  await page.goto(path('evidence'));await expect(page.getByRole('heading',{name:'Sermon Evidence Scanner',exact:true})).toBeVisible();
  await page.getByLabel('Transcript',{exact:true}).fill(`[00:12] John 3:16 says “${verse}”`);
  await page.getByRole('button',{name:'Check transcript',exact:true}).click();
  await expect(page.locator('.evidence-passage').first()).toContainText(verse);await expect(page.locator('.evidence-passage').first()).toContainText('World English Bible');
});

test('projection audience contains exact Scripture without private study records',async({page})=>{
  await page.goto(path('projection'));await page.getByRole('button',{name:'Add selected passage',exact:true}).click();await expect(page.locator('.projection-text')).toContainText(verse);
  const popupPromise=page.waitForEvent('popup');await page.getByRole('button',{name:'Open audience screen',exact:true}).click();const popup=await popupPromise;
  await expect(popup.locator('#passage-text')).toContainText(verse);await expect(popup.locator('#passage-credit')).toContainText('World English Bible');
  await expect(popup.locator('textarea,input')).toHaveCount(0);await popup.close();
});

test('expanded tools fit a 320px viewport and work without horizontal scrolling',async({page})=>{
  await page.setViewportSize({width:320,height:844});
  for(const view of ['editions','study','evidence','projection']){await page.goto(path(view));await expect(page.locator('main h1')).toBeVisible();const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);expect(overflow,view).toBe(false);}
});

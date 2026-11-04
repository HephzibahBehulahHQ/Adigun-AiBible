import type { Edition, Reference, Verse } from './types';

/** A missing source position must not disappear inside an apparently complete range. */
export function assertCompletePassage(verses: readonly Verse[], range: Pick<Reference, 'verse' | 'endVerse'>): void {
  const end = range.endVerse ?? range.verse;
  if (!Number.isSafeInteger(range.verse) || !Number.isSafeInteger(end) || range.verse < 1 || end < range.verse) {
    throw new Error('Choose a valid passage range.');
  }
  if (verses.length !== end - range.verse + 1 || verses.some((verse, index) => verse.number !== range.verse + index || !verse.text.trim())) {
    throw new Error('This range has missing source wording. Choose a range with text at every verse number.');
  }
}

export async function printPassage(edition:Edition,verses:Verse[],label:string,range:Pick<Reference,'verse'|'endVerse'>):Promise<void>{
  assertCompletePassage(verses,range);
  const [{ sourceCredit }, { requirePermission }] = await Promise.all([import('./data'), import('./permissions')]);
  await requirePermission(edition,'printExport');
  const popup=window.open('','_blank','popup,width=850,height=800');
  if(!popup)throw new Error('Allow this site to open a print window, then try again.');
  const doc=popup.document;doc.title=`${label} · ${edition.name}`;
  const style=doc.createElement('style');style.textContent='body{font:18px/1.7 Georgia,serif;color:#111;background:white;max-width:48rem;margin:2rem auto;padding:1rem}h1{font:700 26px system-ui}footer{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.5 system-ui;border-top:1px solid #bbb;padding-top:1rem;margin-top:2rem}p{orphans:3;widows:3}button{padding:14px;font:16px system-ui}@media print{button{display:none}@page{margin:18mm}}';doc.head.append(style);
  const title=doc.createElement('h1');title.textContent=`${label} · ${edition.name}`;doc.body.append(title);
  for(const verse of verses){const line=doc.createElement('p');line.lang=edition.language;line.textContent=`${verse.number} ${verse.text}`;doc.body.append(line);}
  const credit=doc.createElement('footer');credit.textContent=sourceCredit(edition);doc.body.append(credit);
  const button=doc.createElement('button');button.textContent='Print or save as PDF';button.onclick=()=>popup.print();doc.body.prepend(button);
}

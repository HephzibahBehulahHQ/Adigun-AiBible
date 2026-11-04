import type { Edition, Verse } from './types';
import { sourceCredit } from './data';
import { requirePermission } from './permissions';
export async function printPassage(edition:Edition,verses:Verse[],label:string):Promise<void>{
  await requirePermission(edition,'printExport');
  if(!verses.length||verses.some(verse=>!verse.text.trim()))throw new Error('Choose a passage with complete source wording before printing.');
  const popup=window.open('','_blank','popup,width=850,height=800');
  if(!popup)throw new Error('Allow this site to open a print window, then try again.');
  const doc=popup.document;doc.title=`${label} · ${edition.name}`;
  const style=doc.createElement('style');style.textContent='body{font:18px/1.7 Georgia,serif;color:#111;background:white;max-width:48rem;margin:2rem auto;padding:1rem}h1{font:700 26px system-ui}footer{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.5 system-ui;border-top:1px solid #bbb;padding-top:1rem;margin-top:2rem}p{orphans:3;widows:3}button{padding:14px;font:16px system-ui}@media print{button{display:none}@page{margin:18mm}}';doc.head.append(style);
  const title=doc.createElement('h1');title.textContent=`${label} · ${edition.name}`;doc.body.append(title);
  for(const verse of verses){const line=doc.createElement('p');line.lang=edition.language;line.textContent=`${verse.number} ${verse.text}`;doc.body.append(line);}
  const credit=doc.createElement('footer');credit.textContent=sourceCredit(edition);doc.body.append(credit);
  const button=doc.createElement('button');button.textContent='Print or save as PDF';button.onclick=()=>popup.print();doc.body.prepend(button);
}

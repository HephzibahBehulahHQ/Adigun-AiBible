import type { View } from '../types';

export interface BotGeometry { right: number; bottom: number; width: number; height: number }
export const BOT_GEOMETRY_KEY = 'adigun-aibible-bot-layout-v2';
export const defaultGeometry: BotGeometry = {right:24,bottom:96,width:420,height:600};

export function clampGeometry(value: Partial<BotGeometry>, viewport: {width:number;height:number}): BotGeometry {
  const finite = (n: number | undefined, fallback: number) => typeof n === 'number' && Number.isFinite(n) ? n : fallback;
  const maxWidth = Math.max(160, viewport.width - 24), maxHeight = Math.max(160, viewport.height - 104);
  const width = Math.min(maxWidth, Math.max(Math.min(320,maxWidth),finite(value.width,420)));
  const height = Math.min(maxHeight, Math.max(Math.min(400,maxHeight),finite(value.height,600)));
  return { width, height,
    right:Math.min(Math.max(12,viewport.width-width-12), Math.max(12,finite(value.right,24))),
    bottom:Math.min(Math.max(80,viewport.height-height-12), Math.max(80,finite(value.bottom,96))),
  };
}

export function restoreGeometry(raw: string | null, viewport: {width:number;height:number}): BotGeometry {
  try { const value: unknown = JSON.parse(raw || 'null'); if (value && typeof value === 'object' && !Array.isArray(value)) return clampGeometry(value as Partial<BotGeometry>,viewport); }
  catch { /* Optional presentation state never blocks study. */ }
  return clampGeometry(defaultGeometry,viewport);
}

export const botDestinations: {id:string;label:string;description:string;view:View}[] = [
  {id:'speakers',label:'Open speaker collections',description:'Browse source-marked speech and its review coverage.',view:'speakers'},
  {id:'coverage',label:'Show comparison coverage',description:'Inspect the real source and editorial counts.',view:'sources'},
  {id:'comparisons',label:'Open reviewed comparisons',description:'See recorded comparisons or their explicit review gap.',view:'compare'},
  {id:'plan',label:'Draft a reading plan',description:'Open the private plan editor; no generated plan is implied.',view:'study'},
  {id:'export',label:'Prepare a passage export',description:'Open Share Studio with the selected source passage.',view:'share'},
  {id:'downloads',label:'Show download status',description:'Inspect this edition’s saved offline books.',view:'settings'},
  {id:'tools',label:'Open study tools',description:'Choose an available local study experience.',view:'tools'},
  {id:'law',label:'Open Law Diary',description:'Inspect law and teaching passages with their sources.',view:'law-diary'},
  {id:'teaching',label:'Prepare a teaching outline',description:'Open the private teaching workspace.',view:'ministry'},
];

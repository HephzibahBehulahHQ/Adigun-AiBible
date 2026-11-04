import type { Reference } from '../types';
import type { ReflectionEntry } from './model.ts';
import { explicitReference, newEntryBase, referenceLabel } from './model.ts';

export interface RetellingSelfCheck {
  people: boolean;
  events: boolean;
  sequence: boolean;
  mainPoint: boolean;
}
export function createRetellingPracticeReflection(ref: Reference, retelling: string, checks: RetellingSelfCheck, now = new Date()): ReflectionEntry {
  if (typeof retelling !== 'string' || !retelling.trim() || retelling.length > 10000) throw new Error('Write a retelling of up to 10,000 characters before saving.');
  if (!checks || typeof checks !== 'object' || ['people','events','sequence','mainPoint'].some(key => typeof checks[key as keyof RetellingSelfCheck] !== 'boolean')) {
    throw new Error('Complete the retelling self-check before saving.');
  }
  const labels:Record<keyof RetellingSelfCheck,string>={people:'Key people or participants',events:'Key events or actions',sequence:'Order or sequence',mainPoint:'Main point or message'};
  const selfCheck=(Object.keys(labels) as (keyof RetellingSelfCheck)[]).map(key=>`${checks[key]?'Reviewed':'Not yet reviewed'}: ${labels[key]}`).join('\\n');
  const text=[
    'Self-guided retelling practice — not a verbatim recitation or an automated assessment.',
    `Passage: ${referenceLabel(ref)}`,
    `My retelling in my own words:\\n${retelling.trim()}`,
    `My self-check (not a score):\\n${selfCheck}`,
    'Compare this retelling with the exact source passage in the selected edition.'
  ].join('\\n\\n');
  return { ...newEntryBase(now), title:`Retelling practice · ${referenceLabel(ref)}`, kind:'application', state:'unresolved',
    text, reason:'', refs:[explicitReference(ref)], sources:['Self-guided retelling practice'], history:[] };
}

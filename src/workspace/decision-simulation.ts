import type { Reference } from '../types';
import type { ReflectionEntry } from './model';
import { explicitReference, newEntryBase } from './model';

export const decisionSimulation = {
  id: 'workplace-report',
  title: 'The report before the deadline',
  audience: 'Adult study use',
  language: 'English',
  label: 'Fictional learning exercise',
  situation: 'Your team is preparing a report that will guide an important decision. You notice that one figure does not match the source record. A colleague asks you to leave it unchanged until after the report is sent because correcting it may delay the deadline.',
  considerations: [
    'Verify the source record before deciding what the discrepancy means.',
    'Consider who may rely on the report and who could be affected by an incorrect figure.',
    'Your colleague may be under time pressure; address the issue without assuming their motive.',
    'Accuracy, fairness, confidentiality and the deadline may all need consideration.'
  ],
  choices: [
    {
      id: 'pause-and-verify',
      label: 'Ask the team to pause and verify the figure before sending the report.',
      consequence: 'This makes the discrepancy visible and gives the team a chance to correct the record before others rely on it. It may delay delivery and require a difficult conversation.'
    },
    {
      id: 'private-correction',
      label: 'Speak privately with your colleague and agree on a correction before the report goes out.',
      consequence: 'This can preserve cooperation while creating a practical route to correction. It depends on follow-through; if the report is about to be sent or the risk remains, you may need to raise the issue with the responsible lead.'
    },
    {
      id: 'send-unchanged',
      label: 'Send the report unchanged and hope the figure has little effect.',
      consequence: 'This avoids immediate friction and protects the deadline. The report could still mislead people who rely on it, and trust may be damaged if the error is discovered later.'
    }
  ],
  reflectionPrompt: 'What would you verify first? Who could be affected by the report? How could you raise the concern respectfully while protecting accuracy?',
  followUps: [
    'Compare the figure with the original source record and note what is still uncertain.',
    'Ask the colleague what information they have and agree who will verify the discrepancy.',
    'If the report is about to be sent and the risk remains unresolved, raise it with the responsible lead.'
  ],
  passageReferences: [
    { bookId: 'PRO', chapter: 12, verse: 22 },
    { bookId: 'EPH', chapter: 4, verse: 25 },
    { bookId: 'JAS', chapter: 1, verse: 19 }
  ]
} as const;

export function decisionSimulationReferences(editionId: string): Reference[] {
  if (typeof editionId !== 'string' || !editionId.trim() || editionId.length > 100) throw new Error('Choose a valid source edition for this exercise.');
  return decisionSimulation.passageReferences.map(ref => ({ ...ref, editionId }));
}

export function createDecisionSimulationReflection(choiceId: string, reflection: string, editionId: string, now = new Date()): ReflectionEntry {
  const choice = decisionSimulation.choices.find(item => item.id === choiceId);
  if (!choice) throw new Error('Choose one of the available responses before saving.');
  if (typeof reflection !== 'string' || !reflection.trim() || reflection.length > 5000) throw new Error('Write a reflection of up to 5,000 characters before saving.');
  const refs = decisionSimulationReferences(editionId).map(explicitReference);
  const text = [
    'Fictional learning exercise — not Scripture.',
    `Situation: ${decisionSimulation.situation}`,
    `My chosen response: ${choice.label}`,
    `A plausible consequence: ${choice.consequence}`,
    `My reflection: ${reflection.trim()}`
  ].join('\n\n');
  return { ...newEntryBase(now), title:`Decision simulation · ${decisionSimulation.title}`, kind:'application', state:'unresolved',
    text, reason:'', refs, sources:[`Decision simulation: ${decisionSimulation.id}`], history:[] };
}

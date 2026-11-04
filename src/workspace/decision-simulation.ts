import type { Reference } from '../types';
import type { ReflectionEntry } from './model.ts';
import { explicitReference, newEntryBase } from './model.ts';

const workplaceReport = {
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
} as const;;
const privateSupport = {
  id: 'private-support',
  title: 'A request for private details',
  audience: 'Adult study use',
  language: 'English',
  label: 'Fictional learning exercise',
  situation: 'A friend tells you about a personal difficulty and asks you to keep it private. Later, a group organizer asks for details so the group can offer support. You want to help without taking control of your friend’s story.',
  considerations: [
    'Respect the confidence and your friend’s agency.',
    'Ask what kind of support your friend actually wants before acting on their behalf.',
    'Consider whether general practical help can be offered without identifying the person.',
    'If your friend agrees to involve someone, share only the information needed for that purpose.'
  ],
  choices: [
    {
      id: 'ask-permission',
      label: 'Ask your friend what they are comfortable sharing and offer to connect them with the organizer.',
      consequence: 'This gives your friend control over their story and creates a route to practical support. It may take more time, and you will need to follow through on the agreed boundary.'
    },
    {
      id: 'offer-general-help',
      label: 'Keep the details private and ask the organizer what general support can be offered to anyone who needs it.',
      consequence: 'This protects the confidence while making help available without identifying your friend. The support may be less tailored until your friend chooses whether to ask for more.'
    },
    {
      id: 'forward-message',
      label: 'Forward your friend’s full message to the group so people can respond quickly.',
      consequence: 'This may prompt an immediate response, but it discloses personal details without permission and could damage trust or expose information beyond the intended audience.'
    }
  ],
  reflectionPrompt: 'What did your friend actually consent to share? How could you offer useful support while respecting their privacy and choice?',
  followUps: [
    'Ask your friend what kind of help they want and whether anyone else may be told.',
    'Offer practical, non-identifying support while respecting the boundary they set.',
    'If permission is given, agree exactly what to share, with whom and for what purpose.'
  ],
  passageReferences: [
    { bookId: 'PRO', chapter: 11, verse: 13 },
    { bookId: 'MAT', chapter: 5, verse: 37 },
    { bookId: 'GAL', chapter: 6, verse: 2 }
  ]
} as const;

export const decisionSimulations = [workplaceReport, privateSupport] as const;
export const decisionSimulation = workplaceReport;

export function getDecisionSimulation(id: string) {
  const simulation = decisionSimulations.find(item => item.id === id);
  if (!simulation) throw new Error('Choose an available decision simulation.');
  return simulation;
}

export function decisionSimulationReferences(editionId: string, simulationId = decisionSimulation.id): Reference[] {
  if (typeof editionId !== 'string' || !editionId.trim() || editionId.length > 100) throw new Error('Choose a valid source edition for this exercise.');
  return getDecisionSimulation(simulationId).passageReferences.map(ref => ({ ...ref, editionId }));
}

export function createDecisionSimulationReflection(choiceId: string, reflection: string, editionId: string, now = new Date(), simulationId = decisionSimulation.id): ReflectionEntry {
  const simulation = getDecisionSimulation(simulationId);
  const choice = simulation.choices.find(item => item.id === choiceId);
  if (!choice) throw new Error('Choose one of the available responses before saving.');
  if (typeof reflection !== 'string' || !reflection.trim() || reflection.length > 5000) throw new Error('Write a reflection of up to 5,000 characters before saving.');
  const refs = decisionSimulationReferences(editionId, simulationId).map(explicitReference);
  const text = [
    'Fictional learning exercise — not Scripture.',
    `Situation: ${simulation.situation}`,
    `My chosen response: ${choice.label}`,
    `A plausible consequence: ${choice.consequence}`,
    `My reflection: ${reflection.trim()}`
  ].join('\\n\\n');
  return { ...newEntryBase(now), title:`Decision simulation · ${simulation.title}`, kind:'application', state:'unresolved',
    text, reason:'', refs, sources:[`Decision simulation: ${simulation.id}`], history:[] };
}

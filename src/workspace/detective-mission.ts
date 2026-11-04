import type { Reference } from '../types';
import type { ReflectionEntry } from './model.ts';
import { explicitReference, newEntryBase } from './model.ts';

export const detectiveMission = {
  id: 'good-samaritan-evidence',
  title: 'The Good Samaritan: follow the evidence',
  audience: 'Adult study use',
  language: 'English',
  introduction: 'Solve five evidence clues by reading the cited narrative in your selected Bible edition. Each clue is about what the passage says; this is a comprehension mission, not a test of faith.',
  clues: [
    {
      id:'questioner', question:'Who first asked Jesus a question about inheriting eternal life?',
      options:[{id:'lawyer',label:'A lawyer'},{id:'soldier',label:'A Roman soldier'},{id:'fisherman',label:'A fisherman'}],
      answerId:'lawyer', hint:'Start with the opening exchange in Luke 10:25–29.',
      references:[{bookId:'LUK',chapter:10,verse:25,endVerse:29}],
      evidence:'The narrative identifies the questioner as a lawyer and records the exchange that introduces the parable.'
    },
    {
      id:'passersby', question:'Who saw the injured traveller and passed by before the Samaritan arrived?',
      options:[{id:'priest-levite',label:'A priest and a Levite'},{id:'two-merchants',label:'Two merchants'},{id:'two-disciples',label:'Two disciples'}],
      answerId:'priest-levite', hint:'Compare the two people described immediately before the Samaritan in Luke 10:30–32.',
      references:[{bookId:'LUK',chapter:10,verse:30,endVerse:32}],
      evidence:'The account names a priest and then a Levite as the two people who passed by.'
    },
    {
      id:'helper', question:'Who stopped, felt compassion and cared for the injured traveller?',
      options:[{id:'samaritan',label:'A Samaritan'},{id:'innkeeper',label:'The innkeeper'},{id:'traveller',label:'Another traveller'}],
      answerId:'samaritan', hint:'Read the turning point in Luke 10:33.',
      references:[{bookId:'LUK',chapter:10,verse:33,endVerse:35}],
      evidence:'The narrative identifies the Samaritan as the person who stopped and provided care.'
    },
    {
      id:'care', question:'Which actions did the Samaritan take to arrange care?',
      options:[{id:'bandage-inn',label:'He treated the wounds, used his animal and arranged care at an inn'},{id:'left-money',label:'He left money beside the road and continued'},{id:'called-guards',label:'He called guards and waited for them'}],
      answerId:'bandage-inn', hint:'Look closely at the practical actions in Luke 10:34–35.',
      references:[{bookId:'LUK',chapter:10,verse:34,endVerse:35}],
      evidence:'The account describes treatment for the wounds, transport to an inn, care there and payment toward the cost.'
    },
    {
      id:'neighbour', question:'In Jesus’ closing question, who acted as a neighbour to the injured man?',
      options:[{id:'showed-mercy',label:'The one who showed mercy'},{id:'the-priest',label:'The priest'},{id:'the-questioner',label:'The person who asked the first question'}],
      answerId:'showed-mercy', hint:'Read the final exchange in Luke 10:36–37.',
      references:[{bookId:'LUK',chapter:10,verse:36,endVerse:37}],
      evidence:'The closing exchange points to the person who showed mercy.'
    }
  ]
} as const;

export function detectiveMissionReferences(editionId:string, clueId?:string):Reference[] {
  if(typeof editionId!=='string'||!editionId.trim()||editionId.length>100) throw new Error('Choose a valid source edition for this mission.');
  const clues=clueId?detectiveMission.clues.filter(clue=>clue.id===clueId):detectiveMission.clues;
  if(clueId&&!clues.length) throw new Error('That evidence clue does not exist.');
  return clues.flatMap(clue=>clue.references.map(ref=>({...ref,editionId})));
}

export function createDetectiveMissionReflection(editionId:string,solvedCount:number,now=new Date()):ReflectionEntry {
  if(solvedCount!==detectiveMission.clues.length) throw new Error('Solve all five evidence clues before saving the mission result.');
  const refs=detectiveMissionReferences(editionId).map(explicitReference);
  const evidence=detectiveMission.clues.map((clue,index)=>`${index+1}. ${clue.question}\\nEvidence: ${clue.evidence}`).join('\\n\\n');
  const text=[
    'Scripture evidence mission — comprehension progress, not a faith score.',
    `Mission: ${detectiveMission.title}`,
    `Result: ${solvedCount}/${detectiveMission.clues.length} evidence clues solved.`,
    evidence,
    'Open the linked source passages in the selected edition to review the evidence.'
  ].join('\\n\\n');
  return {...newEntryBase(now),title:`Detective mission · ${detectiveMission.title}`,kind:'application',state:'unresolved',
    text,reason:'',refs,sources:[`Scripture evidence mission: ${detectiveMission.id}`],history:[]};
}

import type { Reference } from './types';
export const reference = (bookId: string, chapter: number, verse = 1, endVerse?: number): Reference => ({ bookId, chapter, verse, ...(endVerse ? { endVerse } : {}) });
export const moods = [
  { id:'anxious', name:'Anxious', symbol:'≈', refs:[reference('PHP',4,6,7),reference('PSA',23,1,6),reference('MAT',6,25,34)] },
  { id:'lonely', name:'Lonely', symbol:'◌', refs:[reference('PSA',139,1,10),reference('HEB',13,5,6),reference('JHN',14,18)] },
  { id:'grateful', name:'Grateful', symbol:'✧', refs:[reference('PSA',100,1,5),reference('1TH',5,16,18),reference('COL',3,15,17)] },
  { id:'angry', name:'Angry', symbol:'↯', refs:[reference('JAS',1,19,20),reference('EPH',4,26,32),reference('PRO',15,1)] },
  { id:'hopeful', name:'Hopeful', symbol:'↗', refs:[reference('ROM',15,13),reference('PSA',42,11),reference('ISA',40,28,31)] },
  { id:'confused', name:'Confused', symbol:'⌁', refs:[reference('JAS',1,5),reference('PRO',3,5,6),reference('PSA',119,105)] },
  { id:'burnt-out', name:'Burnt out', symbol:'☾', refs:[reference('MAT',11,28,30),reference('MRK',6,31),reference('PSA',62,5,8)] },
  { id:'in-love', name:'In love', symbol:'♡', refs:[reference('1CO',13,4,7),reference('SNG',8,6,7),reference('1JN',4,7,12)] },
  { id:'grieving', name:'Grieving', symbol:'◡', refs:[reference('PSA',34,18),reference('JHN',11,32,36),reference('REV',21,1,5)] }
];
export const plans = [
  { id:'steady', title:'A quieter rhythm', subtitle:'3 sessions a week · 3 weeks', description:'Read at your own pace. These nine sessions introduce creation, wisdom, the life of Jesus, and hope. Allow around ten minutes for reading and personal reflection.', sessions:[
    { title:'In the beginning', ref:reference('GEN',1), prompt:'Read the whole chapter. Note its repeated words and what changes from day to day.' },
    { title:'The shepherd', ref:reference('PSA',23), prompt:'Read slowly. Which image would you like to understand more deeply?' },
    { title:'Wisdom and trust', ref:reference('PRO',3), prompt:'Read the surrounding instructions before applying a single line to your life.' },
    { title:'The Word and the world', ref:reference('JHN',1), prompt:'Notice how the opening connects its ideas. Write down one question.' },
    { title:'On the mountain', ref:reference('MAT',5), prompt:'Identify who is speaking and who is listening. Read one section twice.' },
    { title:'Learning to pray', ref:reference('MAT',6), prompt:'Read the chapter before reflecting on one phrase from the prayer.' },
    { title:'The lost and the found', ref:reference('LUK',15), prompt:'Compare the three stories. What do they have in common?' },
    { title:'Love in practice', ref:reference('1CO',13), prompt:'Read the chapter in context with the chapters beside it.' },
    { title:'A vision of renewal', ref:reference('REV',21), prompt:'Notice the imagery. Keep questions alongside your reflections.' }
  ] },
  { id:'anxiety', title:'Room to breathe', subtitle:'7 gentle reading sessions', description:'A reading companion for anxious seasons. There are no deadlines or lost streaks. This is spiritual reading, not treatment or a promise of relief.', sessions:[
    { title:'A place to begin', ref:reference('PSA',23), prompt:'Take your time with the whole psalm. You can stop whenever you need.' },
    { title:'One day at a time', ref:reference('MAT',6,25,34), prompt:'Read the passage and its surrounding teaching. Write what you notice.' },
    { title:'Words for prayer', ref:reference('PHP',4,4,9), prompt:'Read the complete paragraph, including its instructions and context.' },
    { title:'Honest words', ref:reference('PSA',13), prompt:'This psalm includes questions. Make room for your own questions too.' },
    { title:'An invitation to rest', ref:reference('MAT',11,25,30), prompt:'Read before and after the invitation. Note who is speaking.' },
    { title:'A companion in difficulty', ref:reference('ROM',8,31,39), prompt:'Read this within the wider chapter. Keep a private reflection if helpful.' },
    { title:'Continue gently', ref:reference('PSA',121), prompt:'Choose a passage to revisit. There is no requirement to feel a certain way.' }
  ] }
];
export const dailyRefs = [reference('PSA',119,105),reference('JHN',1,5),reference('MAT',5,14,16),reference('PSA',46,10),reference('PHP',4,8),reference('PRO',3,5,6),reference('ROM',12,2),reference('JAS',1,5),reference('1CO',13,4,7)];
export const questionPrompts = ['What does this passage mean in its surrounding chapter?','What questions do I have about prayer?','How do I understand doubt and faith?','What do different Christian traditions say about this question?','What am I noticing about justice and money?','What would I like to discuss with someone I trust?'];

import exodus from '../../data/context/EXO.json' with { type: 'json' };
import matthew from '../../data/context/MAT.json' with { type: 'json' };
import luke from '../../data/context/LUK.json' with { type: 'json' };
import john from '../../data/context/JHN.json' with { type: 'json' };
import acts from '../../data/context/ACT.json' with { type: 'json' };
import timothy from '../../data/context/1TI.json' with { type: 'json' };
import revelation from '../../data/context/REV.json' with { type: 'json' };
import thessalonians from '../../data/context/2TH.json' with { type: 'json' };
import { validateContextRecords } from './model.ts';
import type { DebateRecord } from './model';
import type { Reference } from '../types';

export const contextRecords = validateContextRecords([...exodus, ...matthew, ...luke, ...john, ...acts, ...timothy, ...revelation, ...thessalonians]);
export const contextDebates: Record<string, DebateRecord> = {
  'pastoral-authorship': {
    id: 'pastoral-authorship', title: 'The authorship of the Pastoral Letters', reviewStatus: 'draft',
    summary: 'The letter names Paul. These sources illustrate a traditional reading and a modern discussion of competing proposals; naming in the letter and historical authorship are distinct questions.',
    positions: [
      { name: 'Chrysostom’s Pauline reading', summary: 'Chrysostom reads First Timothy as Paul’s instruction to Timothy and interprets its opening in that relationship.', representativeSources: [{ label: 'John Chrysostom · Homily 1 on First Timothy', url: 'https://www.newadvent.org/fathers/230601.htm' }] },
      { name: 'Authorship debate in the USCCB introduction', summary: 'The introduction describes arguments for and against direct Pauline authorship, as well as secretarial and compilation proposals. It does not present one date as independent of that debate.', representativeSources: [{ label: 'USCCB · Introduction to First Timothy', url: 'https://bible.usccb.org/bible/1timothy/0' }] },
    ],
  },
};

export const contextFor = (reference: Reference) => contextRecords.filter(record => record.bookId === reference.bookId && record.fromChapter <= reference.chapter && record.toChapter >= reference.chapter);

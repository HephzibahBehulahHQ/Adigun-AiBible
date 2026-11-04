import type { Reference, View } from './types';

// The View contract makes adding a screen without its startup route a type error.
const routeRegistry = {
  home: true,
  read: true,
  compare: true,
  discover: true,
  plans: true,
  saved: true,
  questions: true,
  library: true,
  sources: true,
  settings: true,
  share: true,
  atlas: true,
  study: true,
  evidence: true,
  editions: true,
  projection: true,
  tools: true,
  family: true,
  audio: true,
  drop: true,
  support: true,
} as const satisfies Record<View, true>;

export const ROUTE_VIEWS: readonly View[] = Object.freeze(Object.keys(routeRegistry) as View[]);
export interface ParsedRoute {
  view: View;
  ref: Reference;
  explicitPassage: boolean;
}

function integer(value: string): number {
  return /^\d+$/.test(value) ? Number(value) : NaN;
}

/** Pure parsing shared by the app and startup recovery; no browser or storage access. */
export function parseRoute(hash: string): ParsedRoute {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const question = raw.indexOf('?');
  const path = question < 0 ? raw : raw.slice(0, question);
  const pieces = path.split('/').filter(Boolean);
  const knownView = Object.hasOwn(routeRegistry, pieces[0]);
  const view = knownView ? pieces[0] as View : 'home';
  const explicitPassage = knownView && pieces.length > 1;
  const query = new URLSearchParams(question < 0 ? '' : raw.slice(question + 1));
  let bookId = pieces[1] || 'GEN';
  let malformedPath = explicitPassage && pieces.length > 3;
  try { bookId = decodeURIComponent(bookId); }
  catch { malformedPath = true; }
  return {
    view,
    explicitPassage,
    ref: {
      bookId,
      // Preserve invalid explicit links for the reader's validation/error flow.
      chapter: malformedPath ? NaN : integer(pieces[2] ?? '1'),
      verse: integer(query.get('verse') ?? '1'),
      ...(query.has('end') ? { endVerse: integer(query.get('end')!) } : {}),
      ...(query.has('edition') ? { editionId: query.get('edition')! } : {}),
    },
  };
}

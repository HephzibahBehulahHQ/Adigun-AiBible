import type { Reference, View } from './types';

const views = new Set<View>(['home','read','compare','discover','plans','saved','questions','library','sources','settings','share','atlas','study','evidence','editions','projection','tools','family','audio','drop','support','law-diary','widget','ministry']);

/** Section names are navigation state, never Scripture book identifiers. */
export function parseRoute(hash: string): { view: View; ref: Reference } {
  const [path, query] = hash.replace(/^#/, '').split('?');
  const pieces = (path || '/home').split('/').filter(Boolean);
  const view = views.has(pieces[0] as View) ? pieces[0] as View : 'home';
  const q = new URLSearchParams(query);
  const sectionRoute = view === 'law-diary';
  return { view, ref: {
    bookId: (sectionRoute ? q.get('book') : pieces[1]) || 'GEN',
    chapter: Number((sectionRoute ? q.get('chapter') : pieces[2]) || 1),
    verse: Number(q.get('verse') || 1),
    ...(q.has('end') ? { endVerse: Number(q.get('end')) } : {}),
    ...(q.get('edition') ? { editionId: q.get('edition')! } : {}),
  } };
}

export function routeHref(view: View, reference: Reference, editionId = 'eng-web'): string {
  const q = new URLSearchParams({ verse: String(reference.verse) });
  if (reference.endVerse !== undefined) q.set('end', String(reference.endVerse));
  q.set('edition', reference.editionId || editionId);
  if (view === 'law-diary') {
    q.set('book', reference.bookId);
    q.set('chapter', String(reference.chapter));
    return `#/law-diary/timeline?${q}`;
  }
  return `#/${view}/${encodeURIComponent(reference.bookId)}/${reference.chapter}?${q}`;
}

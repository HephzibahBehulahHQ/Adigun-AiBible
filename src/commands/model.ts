import { fold, parseReference } from '../domain.ts';
import type { BookInfo, Reference, View } from '../types';

export type CommandAction = 'focus' | 'context' | 'notes' | 'source' | 'search';
export interface WorkspaceCommand {
  id: string;
  label: string;
  detail: string;
  keywords: string;
  view?: View;
  action?: CommandAction;
  reference?: Reference;
  query?: string;
}

const destinations: WorkspaceCommand[] = [
  { id: 'read', label: 'Read Scripture', detail: 'Open the current passage and edition.', keywords: 'bible reader chapter passage', view: 'read' },
  { id: 'compare', label: 'Bible–Quran comparison', detail: 'Open the current passage with comparison coverage.', keywords: 'quran compare context', view: 'compare' },
  { id: 'editions', label: 'Bible editions', detail: 'Browse actual installed editions and compare passages.', keywords: 'versions translation catalog parallel', view: 'editions' },
  { id: 'study', label: 'Personal workspace', detail: 'Private prayer, collections, plans, memory and reflections.', keywords: 'journal memorization learning', view: 'study' },
  { id: 'saved', label: 'Saved & Notes', detail: 'Open bookmarks and private notes.', keywords: 'bookmark highlights notebook saved', view: 'saved' },
  { id: 'plans', label: 'Reading plans', detail: 'Continue a reading session.', keywords: 'plan schedule progress', view: 'plans' },
  { id: 'audio', label: 'Listening queue', detail: 'Open device-speech controls; playback starts only when you choose.', keywords: 'audio listen speech voice', view: 'audio' },
  { id: 'share', label: 'Share Studio', detail: 'Prepare attributed passage cards and print layouts.', keywords: 'export print image png passage', view: 'share' },
  { id: 'projection', label: 'Church projection', detail: 'Prepare a passage queue and audience view.', keywords: 'presenter church presentation screen', view: 'projection' },
  { id: 'family', label: 'Family archive', detail: 'Open private family memories and original recordings.', keywords: 'legacy testimony recording', view: 'family' },
  { id: 'evidence', label: 'Transcript evidence scanner', detail: 'Check a pasted transcript against available sources.', keywords: 'sermon quotation evidence scan', view: 'evidence' },
  { id: 'library', label: 'Historical & Additional Texts', detail: 'Browse the classified catalog and source library.', keywords: 'historical lost books library canon', view: 'library' },
  { id: 'discover', label: 'Discover', detail: 'Explore reading entry points and source passages.', keywords: 'moods discovery', view: 'discover' },
  { id: 'drop', label: 'Verse Drop', detail: 'Open a finite passage feed with chapter context.', keywords: 'verse feed discover', view: 'drop' },
  { id: 'questions', label: 'Private question journal', detail: 'Write and revisit your own questions.', keywords: 'doubt questions journal', view: 'questions' },
  { id: 'sources', label: 'Sources & permissions', detail: 'Inspect edition identity, rights and actual review coverage.', keywords: 'license copyright source attribution review', view: 'sources' },
  { id: 'settings', label: 'Settings & saved layouts', detail: 'Reading appearance, workspace layouts, downloads and backups.', keywords: 'theme font offline download backup layout settings', view: 'settings' },
  { id: 'support', label: 'Support resources', detail: 'Choose a country to see its official support links.', keywords: 'help support country', view: 'support' },
  { id: 'tools', label: 'Study Tools', detail: 'Browse the available study tools.', keywords: 'tools workspace', view: 'tools' },
  { id: 'home', label: 'Home', detail: 'Return to reading and study entry points.', keywords: 'home continue', view: 'home' },
];

/** This registry contains local UI actions only. No command sends or publishes data. */
export function workspaceCommands(query: string, books: BookInfo[], editionId: string, focus: boolean, sourceReady = true): WorkspaceCommand[] {
  const input = query.trim().slice(0, 200);
  const actions: WorkspaceCommand[] = sourceReady ? [
    { id: 'focus', label: focus ? 'Leave Reading Focus' : 'Enter Reading Focus', detail: 'Keep the passage and reading controls in view.', keywords: 'focus quiet distraction reading', action: 'focus' },
    { id: 'context', label: 'Show passage context', detail: 'Open the current passage with its context inspector.', keywords: 'inspector surrounding chapter context', action: 'context' },
    { id: 'notes', label: 'Write a passage note', detail: 'Open the private note editor for this passage.', keywords: 'write create note inspector', action: 'notes' },
    { id: 'source', label: 'Inspect current source', detail: 'Show the exact edition and attribution.', keywords: 'source inspector edition provenance', action: 'source' },
  ] : [];
  const words = fold(input).split(' ').filter(Boolean);
  const matching = [...actions, ...destinations].filter(item => words.every(word => fold(`${item.label} ${item.detail} ${item.keywords}`).includes(word)));
  if (!input || !sourceReady) return matching;
  const parsed = parseReference(input, books);
  const direct: WorkspaceCommand[] = parsed ? [{
    id: 'open-reference', label: `Open ${books.find(book => book.id === parsed.bookId)?.name} ${parsed.chapter}:${parsed.verse}${parsed.endVerse && parsed.endVerse !== parsed.verse ? `–${parsed.endVerse}` : ''}`,
    detail: `Use the selected edition (${editionId}).`, keywords: '', view: 'read', reference: { ...parsed, editionId },
  }] : [];
  return [...direct, ...matching, { id: 'search-query', label: `Search source text for “${input}”`, detail: `Search only the selected edition (${editionId}).`, keywords: '', action: 'search', query: input }];
}

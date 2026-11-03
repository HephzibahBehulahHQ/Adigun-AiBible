import { refKey } from './domain.ts';
import type { Book, Manifest, Reference, StudyState } from './types';
interface Sources { manifest:(edition:string)=>Promise<Manifest>; book:(book:string,edition:string)=>Promise<Book> }

/** Preserve private writing even when an offline source excerpt is unavailable. */
export async function buildNotebook(study:StudyState,sources:Sources):Promise<string> {
  const selected=[...new Map([...study.bookmarks,...study.notes.map(note=>note.ref)].map(ref=>[refKey(ref),ref])).values()];
  const credits=new Map<string,string>();
  const passages=await Promise.all(selected.map(async(ref:Reference)=>{
    const edition=ref.editionId||'eng-web';
    let title=`${ref.bookId} ${ref.chapter}:${ref.verse}${ref.endVerse?`–${ref.endVerse}`:''}`,excerpt='Source excerpt unavailable on this device. Reconnect to view the named edition.';
    try {
      const [manifest,book]=await Promise.all([sources.manifest(edition),sources.book(ref.bookId,edition)]);
      if(manifest.edition.id!==edition||book.id!==ref.bookId)throw new Error('Source identity mismatch.');
      title=`${book.name} ${ref.chapter}:${ref.verse}${ref.endVerse?`–${ref.endVerse}`:''}`;
      const verses=book.chapters.find(ch=>ch.number===ref.chapter)?.verses.filter(v=>v.number>=ref.verse&&v.number<=(ref.endVerse||ref.verse));
      excerpt=verses?.some(v=>v.text.trim())?verses.map(v=>`> ${v.number}. ${v.text}`).join('\n\n'):'The publisher has no main-text wording for this selection; no replacement text is supplied.';
      const e=manifest.edition;credits.set(edition,[e.name,e.attribution,e.license,e.licenseUrl,e.sourceUrl].filter(Boolean).join('\n\n'));
    }catch{ /* The saved note remains exportable independently of source downloads. */ }
    const notes=study.notes.filter(note=>refKey(note.ref)===refKey(ref)).map(note=>`### Personal note\n\n${note.text}\n\nUpdated: ${note.updatedAt}`).join('\n\n');
    const bookmarked=study.bookmarks.some(saved=>refKey(saved)===refKey(ref));
    return `## ${title} · ${edition}\n\n${bookmarked?'Bookmarked passage.\n\n':''}${excerpt}${notes?`\n\n${notes}`:''}`;
  }));
  return ['# My Adigun-AiBible notebook','This export includes private study writing. Keep it in a trusted location. Scripture excerpts retain their named editions; personal notes are separate.',...passages,'## Highlights',study.highlights.length?study.highlights.map(id=>`- ${id}`).join('\n'):'No saved highlights.','## Completed plan sessions',study.completedSessions.length?study.completedSessions.map(id=>`- ${id}`).join('\n'):'No completed sessions.','## Reading days',study.readingDays.join(', ')||'No recorded reading days.','## Private questions',study.journal.map(entry=>`### ${entry.createdAt}\n\n${entry.text}`).join('\n\n')||'No saved questions.','## Source attribution',...credits.values()].join('\n\n')+'\n';
}

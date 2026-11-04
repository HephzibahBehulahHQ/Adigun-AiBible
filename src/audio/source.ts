import { getBook, getManifest } from '../data';
import { validateReference } from '../domain';
import { requirePermission } from '../permissions';
import { assertCompletePassage } from '../print';
import type { Reference } from '../types';
import { assertAudioSourceIdentity } from './model';
import type { AudioEntry, AudioState } from './model';

export async function prepareListeningPassage(ref: Reference, expectedSha256?: string) {
  const editionId = ref.editionId || 'eng-web'; const manifest = await getManifest(editionId);
  if (!validateReference({ ...ref, editionId }, manifest.books, editionId)) throw new Error('This passage is outside the selected edition.');
  if (!manifest.edition.sha256) throw new Error('The edition has no verified source revision.');
  if (expectedSha256 && manifest.edition.sha256 !== expectedSha256) throw new Error('This edition revision changed. Remove the old queue entry and add the passage again after checking its source.');
  await requirePermission(manifest.edition, 'tts');
  const book = await getBook(ref.bookId, editionId); const chapter = book.chapters.find(chapter => chapter.number === ref.chapter);
  if (!chapter) throw new Error('This chapter is absent from the selected source.');
  const verses = chapter.verses.filter(verse => verse.number >= ref.verse && verse.number <= (ref.endVerse ?? ref.verse));
  assertCompletePassage(verses, ref);
  return { edition: manifest.edition, verses };
}
export async function loadListeningEntry(entry: AudioEntry) {
  const source = await prepareListeningPassage(entry.ref, entry.sourceSha256);
  assertAudioSourceIdentity(entry, source.edition);
  return source.verses;
}
/** Backup labels and language choices are data, never authority over an installed edition. */
export async function verifyListeningBackup(state: AudioState): Promise<AudioState> {
  for (const item of [...state.entries, ...state.bookmarks]) {
    const manifest = await getManifest(item.ref.editionId);
    assertAudioSourceIdentity(item, manifest.edition);
    if (!validateReference(item.ref, manifest.books, manifest.edition.id)) throw new Error('A backup reference is outside its source edition.');
  }
  return state;
}

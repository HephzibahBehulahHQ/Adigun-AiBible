import { getManifest } from '../data';
import { validateReaderLayoutSettings } from './model';
import type { ReaderLayoutSettings } from './model';

/** Check saved pane choices against installed edition inventories before applying/importing. */
export async function validateLayoutSources(settings: ReaderLayoutSettings): Promise<ReaderLayoutSettings> {
  const clean = validateReaderLayoutSettings(settings);
  const manifests = new Map(await Promise.all([...new Set(clean.panes.map(pane => pane.id))].map(async id => [id, await getManifest(id)] as const)));
  for (const pane of clean.panes) {
    const manifest = manifests.get(pane.id);
    if (!manifest || manifest.edition.id !== pane.id) throw new Error('A comparison edition in this layout is unavailable.');
    if (!pane.linked) {
      const book = manifest.books.find(book => book.id === pane.bookId);
      if (!book || pane.chapter > book.chapters) throw new Error('A saved comparison chapter is absent from its edition. Existing layouts have not been replaced.');
    }
  }
  return clean;
}

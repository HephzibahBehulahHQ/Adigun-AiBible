import { useEffect, useMemo, useRef, useState } from 'react';
import type { Manifest, Reference, Verse } from '../types';
import { getBook, getManifest } from '../data';
import { sourceReferences, sourceReferenceRanges } from './source-links';

export interface SourceDetail {
  title: string;
  kind: 'footnote' | 'heading';
  text: string;
  content?: unknown;
  trigger: HTMLElement | null;
}

interface PreviewPassage { reference: Reference; label: string; verses: Verse[]; missing: number[] }
interface Preview { location: string; loading: boolean; error: string; passages: PreviewPassage[] }

type SourceDetailsProps = { detail: SourceDetail; manifest: Manifest; onClose: () => void; onOpenReference: (reference: Reference) => void };

export default function SourceDetails(props: SourceDetailsProps) {
  const { manifest, detail } = props;
  return <SourceDetailsPanel key={`${manifest.edition.id}:${manifest.edition.sha256}:${detail.kind}:${detail.title}:${detail.text}`} {...props} />;
}

function SourceDetailsPanel({ detail, manifest, onClose, onOpenReference }: SourceDetailsProps) {
  const panel = useRef<HTMLElement>(null);
  const [location, setLocation] = useState('');
  const [requestVersion, setRequestVersion] = useState(0);
  const [preview, setPreview] = useState<Preview>({ location: '', loading: false, error: '', passages: [] });
  const links = useMemo(() => {
    try { return { values: sourceReferences(detail.content), error: '' }; }
    catch (error) { return { values: [], error: error instanceof Error ? error.message : 'Reference links could not be read.' }; }
  }, [detail.content]);
  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
    return () => { if (detail.trigger?.isConnected) detail.trigger.focus({ preventScroll: true }); };
  }, [detail]);
  useEffect(() => {
    if (!location) return;
    let active = true;
    const ranges = sourceReferenceRanges(location, manifest);
    const pending = { location, loading: true, error: '', passages: [] };
    // Begin on a microtask so a stale effect cannot overwrite the selected link.
    void Promise.resolve().then(async () => {
      if (!active) return;
      setPreview(pending);
      try {
        if (!ranges) throw new Error('This reference does not identify an available passage in this edition. Its source label has been retained.');
        if (ranges.reduce((sum, ref) => sum + (ref.endVerse || ref.verse) - ref.verse + 1, 0) > 200) throw new Error('This reference is too long for a preview. Use the reader links below to open its chapters.');
        const current = await getManifest(manifest.edition.id);
        if (current.edition.sha256 !== manifest.edition.sha256) throw new Error('The source revision changed. Reopen the passage before following its annotations.');
        const books = new Map(await Promise.all([...new Set(ranges.map(ref => ref.bookId))].map(async id => [id, await getBook(id, manifest.edition.id)] as const)));
        const passages = ranges.map(reference => {
          const book = books.get(reference.bookId)!;
          const chapter = book.chapters.find(value => value.number === reference.chapter);
          if (!chapter) throw new Error('The referenced chapter is unavailable in this source.');
          const verses = chapter.verses.filter(verse => verse.number >= reference.verse && verse.number <= (reference.endVerse || reference.verse));
          const missing = Array.from({ length: (reference.endVerse || reference.verse) - reference.verse + 1 }, (_, offset) => reference.verse + offset).filter(number => !verses.some(verse => verse.number === number));
          return { reference, verses, missing, label: `${book.name} ${reference.chapter}:${reference.verse}${reference.endVerse ? `–${reference.endVerse}` : ''}` };
        });
        if (active) setPreview({ location, loading: false, error: '', passages });
      } catch (error) { if (active) setPreview({ location, loading: false, error: error instanceof Error ? error.message : 'The reference preview is unavailable.', passages: [] }); }
    });
    return () => { active = false; };
  }, [location, manifest, requestVersion]);
  const ranges = location ? sourceReferenceRanges(location, manifest) : null;
  const visiblePreview = preview.location === location ? preview : { location, loading: true, error: '', passages: [] };
  return <section className="source-detail-drawer" ref={panel} tabIndex={-1} aria-label="Publisher source details" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); } }}>
    <div className="source-detail-heading"><div><span className="eyebrow">PUBLISHER {detail.kind === 'footnote' ? 'FOOTNOTE' : 'HEADING'}</span><h2>{detail.title}</h2></div><button type="button" className="text-button" onClick={onClose} aria-label="Close publisher source details">Close</button></div>
    <p className="source-note-body" lang={manifest.edition.language}>{detail.text}</p>
    <p className="source-detail-credit">{manifest.edition.name}. This annotation is supplied by the publisher and is separate from the verse wording.</p>
    {links.error && <p role="alert">{links.error}</p>}
    {links.values.length > 0 && <div className="source-reference-links"><h3>References supplied in this annotation</h3>{links.values.map(link => <button type="button" className="secondary" key={`${link.location}:${link.label}`} onClick={() => { setLocation(link.location); setRequestVersion(version => version + 1); }} aria-pressed={location === link.location}>Preview {link.label}</button>)}</div>}
    {location && <div className="source-reference-preview" aria-label="Source cross-reference preview" aria-busy={visiblePreview.loading}>
      <h3>{location} · {manifest.edition.name}</h3>
      {visiblePreview.loading && <p role="status">Opening the referenced source…</p>}
      {visiblePreview.error && <><p role="alert">{visiblePreview.error}</p><button type="button" className="secondary" onClick={() => setRequestVersion(version => version + 1)}>Retry source preview</button></>}
      {visiblePreview.passages.map(passage => <section key={`${passage.reference.bookId}:${passage.reference.chapter}`}><h4>{passage.label}</h4>{passage.missing.length > 0 && <p className="source-preview-gap">The source has no verse record at: {passage.missing.join(', ')}. No replacement wording has been added.</p>}{passage.verses.map(verse => <p key={verse.number} lang={manifest.edition.language}><sup>{verse.number}</sup> {verse.text || <span className="source-omission">No main-text wording at this number in this edition.</span>}</p>)}</section>)}
      {ranges?.map(reference => <button type="button" className="secondary" key={`${reference.bookId}:${reference.chapter}`} onClick={() => { onOpenReference(reference); onClose(); }}>Open {manifest.books.find(book => book.id === reference.bookId)?.name} {reference.chapter} in the reader</button>)}
    </div>}
  </section>;
}

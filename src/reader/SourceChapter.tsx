import { sourceDirection } from '../source-typography';
import { Fragment, useEffect, useMemo, useState } from 'react';
import type { Dispatch, MouseEvent, ReactNode, SetStateAction } from 'react';
import { Bookmark, Highlighter, NotebookPen } from 'lucide-react';
import type { Chapter, Manifest, Reference, StudyState, Verse } from '../types';
import { refKey } from '../domain';
import { buildChapterStructure } from './source-structure';
import type { HeadingStructure, NormalizedNote, SourceSegment, VerseStructure } from './source-structure';
import SourceDetails from './SourceDetails';
import type { SourceDetail } from './SourceDetails';
import './source-reader.css';
import type { SourceAppearance } from '../reader-layouts/model';

const poetryLevel = (style: string | null) => style?.match(/^qm?([1-4])?$/)?.[1] || (style === 'q' ? '1' : undefined);
interface Props {
  appearance: SourceAppearance; onAppearanceChange: Dispatch<SetStateAction<SourceAppearance>>;
  chapter: Chapter; manifest: Manifest; reference: Reference; study: StudyState; storageReady: boolean; comparison: boolean;
  labels: { bookmark: string; removeBookmark: string; note: string; highlight: string };
  onSelect: (reference: Reference) => void; onOpenReference: (reference: Reference) => void;
  onBookmark: (reference: Reference) => void; onNote: (reference: Reference) => void; onHighlight: (reference: Reference) => void;
  renderParaphrase: (verse: Verse) => ReactNode; renderComparison: (verse: Verse) => ReactNode;
}
interface ParagraphPiece { verse: VerseStructure; segments: SourceSegment[]; first: boolean; last: boolean }
interface ParagraphBlock { key: string; style: string | null; pieces: ParagraphPiece[]; headingsAfter: HeadingStructure[] }

export default function SourceChapter(props: Props) {
  const { chapter, manifest, reference, study, storageReady, comparison, labels } = props;
  const structure = useMemo(() => buildChapterStructure(chapter), [chapter]);
  const options = props.appearance, setOptions = props.onAppearanceChange;
  const [detail, setDetail] = useState<SourceDetail | null>(null);
  const visibleDetail = detail && (detail.kind === 'footnote' ? options.notes : options.headings) ? detail : null;
  useEffect(() => {
    if (detail && (detail.kind === 'footnote' ? !options.notes : !options.headings)) setDetail(null);
  }, [detail, options.notes, options.headings]);
  const bookName = manifest.books.find(book => book.id === reference.bookId)?.name || reference.bookId;
  const hasParagraphs = structure.paragraphs.some(paragraph => paragraph.spans.some(span => span.end > span.start));
  const markedVerses = structure.verses.filter(verse => verse.segments.some(segment => segment.markers.includes('wj'))).length;
  const noteCount = structure.verses.reduce((sum, verse) => sum + verse.notes.length, 0) + structure.headings.reduce((sum, heading) => sum + heading.notes.length, 0);
  const paragraphMode = !comparison && hasParagraphs && options.layout === 'paragraphs';
  const verseReference = (number: number): Reference => ({ bookId: reference.bookId, chapter: chapter.number, verse: number, editionId: manifest.edition.id });
  const selected = (number: number) => number >= reference.verse && number <= (reference.endVerse || reference.verse);
  const highlighted = (number: number) => study.highlights.includes(refKey(verseReference(number)));
  const openNote = (note: NormalizedNote, title: string, event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setDetail({ title: `${title} · Note ${note.index + 1}`, kind: 'footnote', text: note.text, content: note.content, trigger: event.currentTarget });
  };
  const noteButtons = (notes: NormalizedNote[], title: string) => options.notes && notes.map(note => <button type="button" className="source-note-marker" key={note.index} aria-label={`Publisher note ${note.index + 1} for ${title}`} onClick={event => openNote(note, title, event)}>{note.index + 1}</button>);
  function runs(segments: SourceSegment[], title: string, heading = false) {
    return segments.map((segment, index) => <Fragment key={`${segment.start}:${segment.end}:${index}`}>{noteButtons(segment.notesBefore, title)}<span data-source-run={heading ? undefined : ''} data-source-heading-run={heading ? '' : undefined} className={[options.redLetters && segment.markers.includes('wj') ? 'source-publisher-jesus' : '', segment.markers.includes('add') ? 'source-added-word' : ''].filter(Boolean).join(' ')}>{segment.text}</span></Fragment>);
  }
  function heading(row: HeadingStructure) {
    if (!options.headings) return null;
    const title = `${bookName} ${chapter.number} heading ${row.index + 1}`;
    return <div key={`heading-${row.index}`} className={`source-heading ${row.style === 'r' ? 'source-heading-reference' : row.style === 'd' ? 'source-heading-description' : ''}`}>
      <span className="source-heading-kind">Publisher {row.style === 'r' ? 'cross-reference' : row.style === 'd' ? 'description' : 'heading'}</span>
      <span className="source-heading-text">{runs(row.segments, title, true)}{noteButtons(row.trailingNotes, title)}</span>
      {row.content && <button type="button" className="source-heading-link" aria-label={`Details for ${title}`} onClick={event => setDetail({ title, kind: 'heading', text: row.text, content: row.content, trigger: event.currentTarget })}>Details</button>}
    </div>;
  }
  function actions(number: number, inline = false) {
    const ref = verseReference(number), marked = study.bookmarks.some(bookmark => refKey(bookmark) === refKey(ref));
    return <span className={inline ? 'source-paragraph-actions' : 'verse-actions'}>
      <button type="button" disabled={!storageReady} className={`icon-button ${marked ? 'gold' : ''}`} aria-label={`${marked ? labels.removeBookmark : labels.bookmark} ${number}`} onClick={event => { event.stopPropagation(); props.onBookmark(ref); }}><Bookmark size={15} fill={marked ? 'currentColor' : 'none'} /></button>
      <button type="button" className="icon-button" aria-label={`${labels.note} ${number}`} onClick={event => { event.stopPropagation(); props.onNote(ref); }}><NotebookPen size={15} /></button>
      <button type="button" disabled={!storageReady} className="icon-button" aria-label={`${labels.highlight} ${number}`} onClick={event => { event.stopPropagation(); props.onHighlight(ref); }}><Highlighter size={15} /></button>
    </span>;
  }
  function verseText(verse: VerseStructure) {
    const lines: { index: number | null; style: string | null; segments: SourceSegment[] }[] = [];
    for (const segment of verse.segments) {
      const previous = lines.at(-1);
      if (previous && (segment.paragraphIndex === previous.index || segment.paragraphIndex === null && !segment.text.trim())) previous.segments.push(segment);
      else lines.push({ index: segment.paragraphIndex, style: segment.paragraphStyle, segments: [segment] });
    }
    const title = `${bookName} ${chapter.number}:${verse.number}`;
    return <>{lines.map((line, index) => <span className={hasParagraphs && lines.length > 1 ? 'source-line' : undefined} data-poetry-level={poetryLevel(line.style)} key={index}>{runs(line.segments, title)}</span>)}{noteButtons(verse.trailingNotes, title)}{!verse.text && <span className="source-omission">No main-text wording at this number in this edition. See the publisher’s footnotes; no replacement text has been added.</span>}</>;
  }
  const blocks: ParagraphBlock[] = [];
  if (paragraphMode) {
    let forceBreak = false;
    for (const verse of structure.verses) {
      const groups: { index: number | null; style: string | null; segments: SourceSegment[] }[] = [];
      for (const segment of verse.segments) {
        const previous = groups.at(-1);
        if (previous && (previous.index === segment.paragraphIndex || segment.paragraphIndex === null && !segment.text.trim())) previous.segments.push(segment);
        else groups.push({ index: segment.paragraphIndex, style: segment.paragraphStyle, segments: [segment] });
      }
      if (!groups.length) groups.push({ index: null, style: null, segments: [] });
      groups.forEach((group, index) => {
        const key = group.index === null ? `plain-${verse.number}-${index}` : `paragraph-${group.index}`;
        const last = blocks.at(-1);
        const piece = { verse, segments: group.segments, first: index === 0, last: index === groups.length - 1 };
        if (!forceBreak && last?.key === key) last.pieces.push(piece);
        else blocks.push({ key, style: group.style, pieces: [piece], headingsAfter: [] });
        forceBreak = false;
      });
      const after = structure.headings.filter(row => row.validAnchor && row.afterVerse === verse.number);
      if (after.length) { blocks.at(-1)!.headingsAfter.push(...after); forceBreak = true; }
    }
  }
  return <>
    <div className="source-reading-controls" aria-label="Source presentation">
      <label>Reading layout<select aria-label="Reading layout" value={paragraphMode ? 'paragraphs' : 'verses'} onChange={event => setOptions(previous => ({ ...previous, layout: event.target.value as SourceAppearance['layout'] }))}><option value="verses">Verse by verse</option><option value="paragraphs" disabled={!hasParagraphs || comparison}>{hasParagraphs ? comparison ? 'Paragraphs · use the reader view' : 'Publisher paragraphs and poetry' : 'Paragraph layout not supplied'}</option></select></label>
      <label><input type="checkbox" checked={options.headings} disabled={!structure.headings.length} onChange={event => setOptions(previous => ({ ...previous, headings: event.target.checked }))} />Publisher headings</label>
      <label><input type="checkbox" checked={options.notes} disabled={!noteCount} onChange={event => { setDetail(null); setOptions(previous => ({ ...previous, notes: event.target.checked })); }} />Publisher notes</label>
      <label><input type="checkbox" checked={options.redLetters} disabled={!markedVerses} onChange={event => setOptions(previous => ({ ...previous, redLetters: event.target.checked }))} />Publisher red letters</label>
    </div>
    <details className="source-coverage"><summary>Source annotation coverage · this chapter</summary><p>{structure.headings.length} supplied headings · {noteCount} notes · {markedVerses} of {chapter.verses.length} verse records contain publisher marks for Jesus’ words.</p><p>{structure.hasMetadata ? 'Headings, notes and formatting come from this edition’s imported source. Italics follow its marked additions. Publisher speech marks have not been independently reviewed by this app; unmarked text has no speaker assignment here.' : 'The imported source supplies verse wording without this annotation layer. Missing headings, paragraphs or speech assignments have not been invented.'}</p>{options.redLetters && markedVerses > 0 && <p>Red, underlined words follow the publisher’s Jesus-speech marks. Verse labels identify the same marking without relying on color.</p>}{structure.issues.length > 0 && <p role="alert">Some source annotations could not be positioned safely. Their text remains separate and the original verse wording is unchanged. {structure.issues.join(' ')}</p>}</details>
    <div className={`scripture ${paragraphMode ? 'source-paragraph-view' : ''}`} lang={manifest.edition.language} dir={sourceDirection(manifest.edition.language)}>
      {structure.headings.filter(row => row.validAnchor && row.afterVerse === null).map(heading)}
      {paragraphMode ? blocks.map((block, blockIndex) => <Fragment key={`${block.key}-${blockIndex}`}><p className="source-paragraph-block" data-poetry-level={poetryLevel(block.style)}>{block.pieces.map((piece, pieceIndex) => {
        const { verse } = piece, title = `${bookName} ${chapter.number}:${verse.number}`;
        return <Fragment key={`${verse.number}:${pieceIndex}`}>{pieceIndex > 0 && piece.first ? ' ' : null}<span id={piece.first ? `verse-${verse.number}` : undefined} data-verse={verse.number} className={`source-paragraph-verse ${selected(verse.number) ? 'selected' : ''} ${highlighted(verse.number) ? 'highlighted' : ''}`} onClick={() => props.onSelect(verseReference(verse.number))}>{piece.first && <button type="button" className="verse-number" aria-label={`Select verse ${verse.number}`} onClick={event => { event.stopPropagation(); props.onSelect(verseReference(verse.number)); }}>{verse.number}</button>}<span className="source-text">{runs(piece.segments, title)}{piece.last && noteButtons(verse.trailingNotes, title)}{!verse.text && <span className="source-paragraph-empty">No main-text wording at this number in this edition.</span>}</span>{piece.last && actions(verse.number, true)}</span></Fragment>;
      })}</p>{block.pieces.filter(piece => piece.last).map(piece => <Fragment key={piece.verse.number}>{options.redLetters && piece.verse.segments.some(segment => segment.markers.includes('wj')) && <span className="source-speaker-label">Verse {piece.verse.number} · Jesus’ words marked by the publisher</span>}{props.renderParaphrase(piece.verse)}</Fragment>)}{block.headingsAfter.map(heading)}</Fragment>) : structure.verses.map(verse => <Fragment key={verse.number}><div className={comparison ? 'comparison-group' : 'verse-group'}><div className="source-verse"><article id={`verse-${verse.number}`} className={`verse-row ${selected(verse.number) ? 'selected' : ''} ${highlighted(verse.number) ? 'highlighted' : ''}`}><button type="button" className="verse-number" aria-label={`Select verse ${verse.number}`} onClick={() => props.onSelect(verseReference(verse.number))}>{String(verse.number).padStart(2, '0')}</button><p className="source-text" onClick={() => props.onSelect(verseReference(verse.number))}>{verseText(verse)}</p>{actions(verse.number)}</article>{options.redLetters && verse.segments.some(segment => segment.markers.includes('wj')) && <span className="source-speaker-label">Verse {verse.number} · Jesus’ words marked by the publisher</span>}{props.renderParaphrase(verse)}</div>{comparison && props.renderComparison(verse)}</div>{structure.headings.filter(row => row.validAnchor && row.afterVerse === verse.number).map(heading)}</Fragment>)}
      {structure.headings.some(row => !row.validAnchor) && <section className="source-unplaced"><h2>Unplaced publisher annotations</h2><p>The supplied verse anchor could not be validated.</p>{structure.headings.filter(row => !row.validAnchor).map(heading)}</section>}
    </div>
    {visibleDetail && <SourceDetails detail={visibleDetail} manifest={manifest} onClose={() => setDetail(null)} onOpenReference={props.onOpenReference} />}
  </>;
}

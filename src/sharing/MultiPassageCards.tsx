import { useEffect, useId, useRef, useState } from 'react';
import { getBook, getEditionCatalog, getManifest, sourceCredit } from '../data';
import { dimensions, downloadBlob, palettes } from '../media';
import type { CardSize } from '../media';
import { requirePermission } from '../permissions';
import type { Edition, Reference } from '../types';
import { drawPassageCard, paginatePassageCards } from './pagination';
import type { CardLayout } from './pagination';
import { loadCardSources } from './sources';
import type { PreparedCardSources } from './sources';
import './sharing.css';

const templateNames: Record<keyof typeof palettes, string> = { gold: 'Observatory Gold', ivory: 'Minimal Ivory', paper: 'Warm Paper', night: 'Quiet Night' };
interface Prepared { sources: PreparedCardSources; layout: CardLayout; palette: keyof typeof palettes }

export default function MultiPassageCards({ reference }: { reference: Reference }) {
  const [editions, setEditions] = useState<Edition[]>([]), [catalogError, setCatalogError] = useState('');
  const [size, setSize] = useState<CardSize>('story'), [palette, setPalette] = useState<keyof typeof palettes>('gold');
  const [margin, setMargin] = useState(96), [secondEdition, setSecondEdition] = useState(''), [wholeChapter, setWholeChapter] = useState(false);
  const [prepared, setPrepared] = useState<Prepared | null>(null), [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false), [status, setStatus] = useState(''), [error, setError] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null), generation = useRef(0), locked = useRef(false), alternativeId = useId();
  const editionId = reference.editionId || 'eng-web';
  const selectionKey = `${editionId}:${reference.bookId}:${reference.chapter}:${reference.verse}:${reference.endVerse ?? reference.verse}`;

  useEffect(() => {
    let active = true;
    getEditionCatalog().then(catalog => { if (active) setEditions(catalog.editions.filter(edition => edition.corpus === 'bible')); }).catch(cause => { if (active) setCatalogError(cause instanceof Error ? cause.message : 'Additional editions could not be loaded.'); });
    return () => { active = false; generation.current++; };
  }, []);
  useEffect(() => { generation.current++; locked.current = false; setBusy(false); setPrepared(null); setIndex(0); setError(''); setStatus(''); }, [selectionKey]);
  useEffect(() => {
    if (!prepared || !canvas.current) return;
    try { drawPassageCard(canvas.current, prepared.layout, index, prepared.palette); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The card preview could not be drawn.'); }
  }, [prepared, index]);

  function invalidate() { generation.current++; locked.current = false; setBusy(false); setPrepared(null); setIndex(0); setStatus(''); setError(''); }

  async function prepare() {
    if (locked.current) return;
    const run = ++generation.current; locked.current = true; setBusy(true); setPrepared(null); setError(''); setStatus('Checking source wording, permissions and card layout…');
    try {
      const sources = await loadCardSources(reference, secondEdition === editionId ? '' : secondEdition, wholeChapter, { getBook, getManifest, requirePermission, sourceCredit });
      await document.fonts.ready;
      if (run !== generation.current) return;
      const measuringCanvas = document.createElement('canvas'), context = measuringCanvas.getContext('2d');
      if (!context) throw new Error('This browser cannot create PNG passage cards.');
      const layout = paginatePassageCards(sources.title, sources.passages, sources.sources, { size, margin }, (text, font) => { context.font = font; return context.measureText(text).width; });
      setPrepared({ sources, layout, palette }); setIndex(0);
      setStatus(`Prepared ${layout.pages.length} ${layout.pages.length === 1 ? 'card' : 'cards'}. Every selected verse and source credit is included. Download each card you want to keep.`);
    } catch (cause) { if (run === generation.current) { setError(cause instanceof Error ? cause.message : 'Passage cards could not be prepared.'); setStatus('No new cards were prepared.'); } }
    finally { if (run === generation.current) { locked.current = false; setBusy(false); } }
  }

  async function exportCard(asText: boolean) {
    if (!prepared || locked.current) return;
    const current = prepared, pageIndex = index, run = generation.current;
    locked.current = true; setBusy(true); setError('');
    try {
      await Promise.all(current.sources.editions.map(edition => requirePermission(edition, asText ? 'documentExport' : 'imageExport')));
      if (run !== generation.current) return;
      const stem = `Adigun-AiBible-${current.sources.editions.map(edition => edition.id).join('-')}-${current.sources.title.replace(/[^a-zA-Z0-9]+/g, '-')}`;
      if (asText) {
        const text = [current.sources.title, current.sources.editions.length > 1 ? 'Source Scripture. Editions paired by verse number; this is not a reviewed translation alignment.' : 'Source Scripture.', ...current.sources.passages.map(passage => `${passage.reference} · ${passage.editionName}\n${passage.text}`), 'Sources and permissions', ...current.sources.sources.map(source => `${source.name}\n${source.credit}`)].join('\n\n');
        downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), `${stem}.txt`);
        setStatus('Downloaded the complete selected text with references and source credits.');
      } else {
        const output = document.createElement('canvas');
        drawPassageCard(output, current.layout, pageIndex, current.palette);
        const blob = await new Promise<Blob>((resolve, reject) => output.toBlob(value => value ? resolve(value) : reject(new Error('The browser could not encode this PNG.')), 'image/png'));
        output.width = 0; output.height = 0;
        if (run !== generation.current) return;
        downloadBlob(blob, `${stem}-card-${pageIndex + 1}-of-${current.layout.pages.length}.png`);
        setStatus(`Downloaded card ${pageIndex + 1} of ${current.layout.pages.length}.`);
      }
    } catch (cause) { if (run === generation.current) setError(cause instanceof Error ? cause.message : 'This export could not be created.'); }
    finally { if (run === generation.current) { locked.current = false; setBusy(false); } }
  }

  const page = prepared?.layout.pages[index];
  return <section className="multi-cards panel" aria-labelledby={`${alternativeId}-title`} lang="en">
    <header><span className="eyebrow">PASSAGE CARD COLLECTION</span><h2 id={`${alternativeId}-title`}>Multiple cards and bilingual text</h2><p>Keep a longer passage readable across separate images. Each card retains its source label and attribution.</p></header>
    <div className="multi-cards-content">
      <div className="multi-cards-controls">
        <label>Passage for the cards<select aria-label="Multi-card passage" value={wholeChapter ? 'chapter' : 'selection'} onChange={event => { invalidate(); setWholeChapter(event.target.value === 'chapter'); }}><option value="selection">Selected verses · {reference.bookId} {reference.chapter}:{reference.verse}{reference.endVerse && reference.endVerse !== reference.verse ? `–${reference.endVerse}` : ''}</option><option value="chapter">Whole chapter · {reference.bookId} {reference.chapter}</option></select></label>
        <label>Second source edition<select aria-label="Second source edition" value={secondEdition === editionId ? '' : secondEdition} onChange={event => { invalidate(); setSecondEdition(event.target.value); }}><option value="">One edition only</option>{editions.filter(edition => edition.id !== editionId).map(edition => <option key={edition.id} value={edition.id}>{edition.name} · {edition.language}</option>)}</select></label>
        {catalogError && <p className="multi-cards-help">{catalogError} You can still prepare a downloaded passage from the current edition.</p>}
        {secondEdition && secondEdition !== editionId && <p className="multi-cards-help">The same chapter and verse numbers are shown for each edition. Numbering can differ; this is not a verified translation alignment. Missing wording prevents export.</p>}
        <div className="multi-cards-options"><label>Format<select aria-label="Multi-card format" value={size} onChange={event => { invalidate(); setSize(event.target.value as CardSize); }}>{Object.entries(dimensions).map(([key, [width, height]]) => <option key={key} value={key}>{key === 'story' ? 'Story' : key === 'square' ? 'Square' : 'Portrait'} · {width} × {height}</option>)}</select></label><label>Template<select aria-label="Multi-card template" value={palette} onChange={event => { invalidate(); setPalette(event.target.value as keyof typeof palettes); }}>{Object.entries(templateNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label></div>
        <label>Safe margin <span>{margin} px</span><input aria-label="Multi-card safe margin" type="range" min={48} max={160} step={8} value={margin} onChange={event => { invalidate(); setMargin(Number(event.target.value)); }}/></label>
        <p className="multi-cards-help">Long verses continue on the next card at a fixed, readable text size. Larger margins or two editions may require more cards.</p>
        <button type="button" className="secondary" disabled={busy} onClick={() => void prepare()}>{busy ? 'Working…' : 'Prepare passage cards'}</button>
        {prepared && <button type="button" disabled={busy} onClick={() => void exportCard(true)}>Download all text and sources</button>}
        {status && <p className="multi-cards-status" role="status">{status}</p>}
        {error && <p className="multi-cards-error" role="alert">{error}</p>}
      </div>
      {prepared && page ? <div className="multi-cards-preview">
        <div className="multi-cards-navigation"><button type="button" disabled={busy || index === 0} onClick={() => setIndex(value => value - 1)} aria-label="Previous prepared card">Previous</button><label>Card<select aria-label="Prepared card number" value={index} disabled={busy} onChange={event => setIndex(Number(event.target.value))}>{prepared.layout.pages.map((_, pageIndex) => <option key={pageIndex} value={pageIndex}>{pageIndex + 1} of {prepared.layout.pages.length}</option>)}</select></label><button type="button" disabled={busy || index === prepared.layout.pages.length - 1} onClick={() => setIndex(value => value + 1)} aria-label="Next prepared card">Next</button></div>
        <canvas ref={canvas} role="img" aria-label={`Prepared passage card ${index + 1} of ${prepared.layout.pages.length}`} aria-describedby={alternativeId}/>
        <button type="button" className="secondary" disabled={busy} onClick={() => void exportCard(false)}>Download card {index + 1} PNG</button>
        <details className="multi-cards-alternative" id={alternativeId}><summary>Text alternative for this card</summary><p>{prepared.sources.title} · Card {index + 1} of {prepared.layout.pages.length}</p>{page.fragments.map((fragment, fragmentIndex) => <div key={`${fragment.passage.id}:${fragmentIndex}`}><h3>{fragment.passage.reference} · {fragment.passage.editionName}{fragment.continued ? ' · continued' : ''}</h3><p lang={fragment.passage.language}>{fragment.lines.join('')}</p></div>)}<pre>{prepared.sources.sources.map(source => `${source.name}\n${source.credit}`).join('\n\n')}</pre></details>
      </div> : <div className="multi-cards-empty"><p>Choose the passage, format and source editions, then prepare the cards. No image is downloaded automatically.</p></div>}
    </div>
  </section>;
}

import { ensureSourceFont } from '../source-typography';
import { useEffect, useId, useRef, useState } from 'react';
import { getBook, getManifest, sourceCredit } from '../data';
import { downloadBlob, palettes } from '../media';
import { requirePermission } from '../permissions';
import type { Locale, Reference } from '../types';
import type { PreparedCardSources } from '../sharing/sources';
import { contextKey } from '../context/model';
import { drawWidget, layoutWidget, loadWidgetSource } from './model';
import type { WidgetLayout } from './model';
import './widget.css';

interface Props { reference: Reference; locale: Locale; editionId?: string; onOpenReference?: (reference: Reference) => void }
interface Prepared { key: string; palette: keyof typeof palettes; source: PreparedCardSources; layout: WidgetLayout }
const templates: Record<keyof typeof palettes, string> = { gold: 'Observatory Gold', ivory: 'Minimal Ivory', paper: 'Warm Paper', night: 'Quiet Night' };

export default function WidgetCard({ reference, locale, editionId, onOpenReference }: Props) {
  const chosen = { ...reference, endVerse: undefined, editionId: editionId || reference.editionId || 'eng-web' }, key = contextKey(chosen);
  const [palette, setPalette] = useState<keyof typeof palettes>('gold'), [prepared, setPrepared] = useState<Prepared | null>(null);
  const [failure, setFailure] = useState({ key: '', message: '' }), [status, setStatus] = useState(''), [busy, setBusy] = useState(false), [retry, setRetry] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null), generation = useRef(0), locked = useRef(false), alternativeId = useId();
  const current = prepared?.key === key && prepared.palette === palette ? prepared : null;
  const error = failure.key === `${key}:${palette}` ? failure.message : '';
  const canCopy = typeof ClipboardItem !== 'undefined' && typeof navigator.clipboard?.write === 'function' && window.isSecureContext;

  useEffect(() => {
    const run = ++generation.current; locked.current = false; setBusy(false); setStatus('');
    void (async () => {
      try {
        const source = await loadWidgetSource(chosen, { getBook, getManifest, requirePermission, sourceCredit });
        await ensureSourceFont(source.passages[0].language, source.passages[0].text);
        await document.fonts.ready;
        const measuring = document.createElement('canvas'), context = measuring.getContext('2d');
        if (!context) throw new Error('This browser cannot create verse images.');
        const layout = layoutWidget(source, (text, font) => { context.font = font; return context.measureText(text).width; });
        if (run === generation.current) { setPrepared({ key, palette, source, layout }); setFailure({ key: '', message: '' }); }
      } catch (cause) { if (run === generation.current) { setPrepared(null); setFailure({ key: `${key}:${palette}`, message: cause instanceof Error ? cause.message : 'The verse image could not be prepared.' }); } }
    })();
    return () => { generation.current++; };
  }, [key, palette, retry]);

  useEffect(() => {
    if (!current || !canvas.current) return;
    try { drawWidget(canvas.current, current.layout, current.palette); }
    catch (cause) { setFailure({ key: `${key}:${palette}`, message: cause instanceof Error ? cause.message : 'The preview could not be drawn.' }); setPrepared(null); }
  }, [current, key, palette]);

  async function encode(candidate: Prepared, run: number): Promise<Blob> {
    await requirePermission(candidate.source.editions[0], 'imageExport');
    if (run !== generation.current) throw new Error('The selected verse changed. Use the current preview.');
    const output = document.createElement('canvas');
    drawWidget(output, candidate.layout, candidate.palette);
    const blob = await new Promise<Blob>((resolve, reject) => output.toBlob(value => value ? resolve(value) : reject(new Error('The browser could not encode this PNG.')), 'image/png'));
    output.width = 0; output.height = 0;
    if (run !== generation.current) throw new Error('The selected verse changed. No previous card was exported.');
    return blob;
  }

  async function exportImage(copy: boolean) {
    if (!current || locked.current) return;
    const candidate = current, run = generation.current;
    locked.current = true; setBusy(true); setFailure({ key: '', message: '' }); setStatus('');
    try {
      if (copy) {
        if (!canCopy) throw new Error('Image copying is unavailable in this browser. Download the PNG instead.');
        // Supply a promise during the user gesture, preserving Clipboard API activation.
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': encode(candidate, run) })]);
        if (run === generation.current) setStatus('Copied the verse image. Paste it into an application that accepts images.');
      } else {
        const blob = await encode(candidate, run);
        if (run !== generation.current) return;
        downloadBlob(blob, `Adigun-AiBible-lock-screen-${chosen.editionId}-${chosen.bookId}-${chosen.chapter}-${chosen.verse}.png`);
        setStatus('Downloaded the 1080 × 1920 PNG with its complete verse and source credit.');
      }
    } catch (cause) {
      if (run === generation.current) setFailure({ key: `${key}:${palette}`, message: copy ? 'The image was not copied. Your browser may require clipboard permission. Download the PNG instead.' : cause instanceof Error ? cause.message : 'The image could not be exported.' });
    } finally { if (run === generation.current) { locked.current = false; setBusy(false); } }
  }

  return <div className="page widget-page" lang="en">
    <header className="page-heading"><span className="eyebrow">A VERSE TO KEEP NEAR</span><h1>Lock-screen verse card</h1><p>Create a portrait image with space for your phone’s clock. This is a web image export; set the downloaded image as wallpaper using your device’s own controls.</p></header>
    {locale !== 'en' && <p className="widget-help">(EN fallback) · Card controls await reviewed translation. The verse keeps the selected source language.</p>}
    {reference.endVerse && reference.endVerse !== reference.verse && <p className="widget-help">Your reader selection is a range. This single-verse format uses {reference.bookId} {reference.chapter}:{reference.verse}; use Share Studio for the complete range.</p>}
    <div className="widget-layout">
      <section className="panel widget-controls" aria-label="Verse card settings">
        <h2>{current?.source.title || `${chosen.bookId} ${chosen.chapter}:${chosen.verse}`}</h2>
        <label>Card template<select aria-label="Lock-screen card template" value={palette} onChange={event => { generation.current++; setPrepared(null); setFailure({ key: '', message: '' }); setPalette(event.target.value as keyof typeof palettes); }}>{Object.entries(templates).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <p className="widget-help">1080 × 1920 pixels · 9:16. The upper area is left clear for a clock. Preview placement on your device before setting the wallpaper.</p>
        {!current && !error && <p role="status">Checking the source, image permission and text layout…</p>}
        {current && <div className="widget-actions"><button type="button" className="primary" disabled={busy} onClick={() => void exportImage(false)}>Download lock-screen PNG</button>{canCopy ? <button type="button" className="secondary" disabled={busy} onClick={() => void exportImage(true)}>Copy verse image</button> : <p className="widget-help">Image clipboard copying is unavailable here. Use Download lock-screen PNG.</p>}</div>}
        {onOpenReference && <button type="button" className="text-button" onClick={() => onOpenReference(chosen)}>Open this verse in the reader</button>}
        <a className="widget-studio-link" href={`#/share/${encodeURIComponent(chosen.bookId)}/${chosen.chapter}?verse=${chosen.verse}${reference.endVerse ? `&end=${reference.endVerse}` : ''}&edition=${encodeURIComponent(chosen.editionId)}`}>Open Share Studio for other formats</a>
        {status && <p role="status">{status}</p>}
        {error && <><p role="alert">{error}</p>{!current && <button type="button" className="secondary" onClick={() => { setFailure({ key: '', message: '' }); setRetry(value => value + 1); }}>Retry card preparation</button>}</>}
      </section>
      {current && <section className="widget-preview" aria-label="Lock-screen card preview"><canvas ref={canvas} role="img" aria-label={`${current.source.title}, ${current.source.editions[0].name}, lock-screen card`} aria-describedby={alternativeId}/><details id={alternativeId} className="widget-alternative" open><summary>Complete text and source credit</summary><p>{current.source.title} · {current.source.editions[0].name}</p><blockquote lang={current.source.editions[0].language}>{current.source.passages[0].text}</blockquote><pre>{current.source.sources[0].credit}</pre></details></section>}
    </div>
  </div>;
}

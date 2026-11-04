import { dimensions, palettes } from '../media.ts';
import type { CardSize } from '../media';

export interface CardPassage { id: string; editionId: string; editionName: string; language: string; reference: string; text: string }
export interface CardSource { id: string; name: string; credit: string }
export interface CardFragment { passage: CardPassage; lines: string[]; label: string[]; continued: boolean; y: number; textY: number }
export interface PassageCard { fragments: CardFragment[] }
export interface CardLayout {
  width: number; height: number; margin: number; bodyFont: number; lineHeight: number; bodyTop: number; bodyBottom: number;
  title: string; titleLines: string[]; noteLines: string[]; creditLines: string[]; creditTop: number; pages: PassageCard[];
}
export interface CardOptions { size: CardSize; margin: number }
export type MeasureCardText = (text: string, font: string) => number;
export const BODY_FONT = 'Georgia, "Times New Roman", serif';
export const LABEL_FONT = 'system-ui, sans-serif';
export const MAX_PASSAGE_CARDS = 128;

/** Each returned string is an exact slice. Joining all slices reproduces the original text. */
export function wrapExactText(text: string, width: number, measure: (value: string) => number): string[] {
  if (!Number.isFinite(width) || width <= 0) throw new Error('The card has no usable text width.');
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const clusters = [...segmenter.segment(text)].map(segment => segment.segment);
  const lines: string[] = []; let start = 0, cursor = 0, lastBreak = -1, candidate = '';
  while (cursor < clusters.length) {
    const cluster = clusters[cursor];
    if (/^[\r\n]+$/.test(cluster)) {
      lines.push(clusters.slice(start, cursor + 1).join('')); cursor++; start = cursor; lastBreak = -1; candidate = ''; continue;
    }
    if (measure(candidate + cluster) <= width) {
      candidate += cluster;
      if (/^\s+$/u.test(cluster)) lastBreak = cursor + 1;
      cursor++; continue;
    }
    if (cursor === start) throw new Error('A text character exceeds the card width. Increase the usable width. Nothing has been cropped.');
    const end = lastBreak > start ? lastBreak : cursor;
    lines.push(clusters.slice(start, end).join('')); start = end; cursor = start; lastBreak = -1; candidate = '';
  }
  if (start < clusters.length) lines.push(clusters.slice(start).join(''));
  return lines.length ? lines : [''];
}

const visibleLine = (line: string) => line.replace(/[\r\n]+$/g, '');

export function paginatePassageCards(title: string, passages: readonly CardPassage[], sources: readonly CardSource[], options: CardOptions, measure: MeasureCardText): CardLayout {
  if (!(options.size in dimensions) || !Number.isInteger(options.margin) || options.margin < 48 || options.margin > 160) throw new Error('Choose a valid card size and a safe margin from 48 to 160 pixels.');
  if (!passages.length || !sources.length || sources.length > 2 || new Set(sources.map(source => source.id)).size !== sources.length) throw new Error('Choose one or two actual source editions.');
  if (passages.some(passage => !passage.text.trim() || !sources.some(source => source.id === passage.editionId)) || passages.reduce((sum, passage) => sum + passage.text.length, 0) > 250_000) throw new Error('This selection is empty, lacks a source, or exceeds the export size limit.');
  const [width, height] = dimensions[options.size], margin = options.margin, usable = width - margin * 2;
  const bodyFont = options.size === 'story' ? 50 : options.size === 'portrait' ? 43 : 38;
  const lineHeight = Math.ceil(bodyFont * 1.48);
  const wrap = (text: string, font: string) => wrapExactText(text, usable, value => measure(visibleLine(value), font));
  const titleLines = wrap(title, `600 32px ${LABEL_FONT}`);
  const noteLines = wrap(sources.length > 1 ? 'Source Scripture · Editions paired by verse number' : 'Source Scripture', `18px ${LABEL_FONT}`);
  const bodyTop = margin + 42 + titleLines.length * 42 + noteLines.length * 26 + 24;
  const creditLines = sources.flatMap(source => wrap(`${source.name}\n${source.credit}`, `18px ${LABEL_FONT}`));
  const creditTop = height - margin - 30 - creditLines.length * 24, bodyBottom = creditTop - 36;
  if (bodyBottom - bodyTop < 150) throw new Error('Source attribution leaves too little reading space. Choose Story or reduce the safe margin. Nothing has been cropped.');
  const pages: PassageCard[] = []; let page: PassageCard = { fragments: [] }, y = bodyTop;
  const nextPage = () => { if (page.fragments.length) pages.push(page); if (pages.length >= MAX_PASSAGE_CARDS) throw new Error('This selection needs more than 128 cards. Choose a shorter passage; no partial export was created.'); page = { fragments: [] }; y = bodyTop; };
  for (const passage of passages) {
    const lines = wrap(passage.text, `${bodyFont}px ${BODY_FONT}`); let offset = 0;
    while (offset < lines.length) {
      const continued = offset > 0;
      const label = wrap(`${passage.reference} · ${passage.editionName}${continued ? ' · continued' : ''}`, `600 18px ${LABEL_FONT}`);
      const labelHeight = label.length * 24 + 12;
      const count = Math.floor((bodyBottom - y - labelHeight) / lineHeight);
      if (count < 1) {
        if (!page.fragments.length) throw new Error('This source label cannot fit legibly. Choose Story or reduce the safe margin.');
        nextPage(); continue;
      }
      const fragmentLines = lines.slice(offset, offset + count);
      page.fragments.push({ passage, lines: fragmentLines, label, continued, y, textY: y + labelHeight });
      offset += fragmentLines.length; y += labelHeight + fragmentLines.length * lineHeight + 24;
      if (offset < lines.length) nextPage();
    }
  }
  if (page.fragments.length) pages.push(page);
  return { width, height, margin, bodyFont, lineHeight, bodyTop, bodyBottom, title, titleLines, noteLines, creditLines, creditTop, pages };
}

export function cardTextAlternative(layout: CardLayout, index: number): string {
  const page = layout.pages[index]; if (!page) throw new Error('That passage card does not exist.');
  return [layout.title, `Card ${index + 1} of ${layout.pages.length}`, ...page.fragments.map(fragment => `${fragment.passage.reference} · ${fragment.passage.editionName}${fragment.continued ? ' · continued' : ''}\n${fragment.lines.join('')}`), 'Sources and permissions', layout.creditLines.join('')].join('\n\n');
}

export function drawPassageCard(canvas: HTMLCanvasElement, layout: CardLayout, index: number, palette: keyof typeof palettes): void {
  const page = layout.pages[index]; if (!page || !(palette in palettes)) throw new Error('Choose a valid prepared card and template.');
  canvas.width = layout.width; canvas.height = layout.height;
  const context = canvas.getContext('2d'); if (!context) throw new Error('This browser cannot create PNG passage cards.');
  const colors = palettes[palette]; context.fillStyle = colors.background; context.fillRect(0, 0, layout.width, layout.height);
  context.textBaseline = 'top'; context.fillStyle = colors.accent; context.font = `600 19px ${LABEL_FONT}`;
  context.fillText('ADIGUN–AIBIBLE  /  HB EVANGELISM', layout.margin, layout.margin);
  let y = layout.margin + 42; context.font = `600 32px ${LABEL_FONT}`;
  for (const line of layout.titleLines) { context.fillText(visibleLine(line), layout.margin, y); y += 42; }
  context.fillStyle = colors.ink; context.font = `18px ${LABEL_FONT}`;
  for (const line of layout.noteLines) { context.fillText(visibleLine(line), layout.margin, y); y += 26; }
  for (const fragment of page.fragments) {
    context.fillStyle = colors.accent; context.font = `600 18px ${LABEL_FONT}`;
    fragment.label.forEach((line, lineIndex) => context.fillText(visibleLine(line), layout.margin, fragment.y + lineIndex * 24));
    context.fillStyle = colors.ink; context.font = `${layout.bodyFont}px ${BODY_FONT}`;
    fragment.lines.forEach((line, lineIndex) => context.fillText(visibleLine(line), layout.margin, fragment.textY + lineIndex * layout.lineHeight));
  }
  context.fillStyle = colors.accent; context.fillRect(layout.margin, layout.creditTop - 18, 64, 2);
  context.fillStyle = colors.ink; context.font = `18px ${LABEL_FONT}`;
  layout.creditLines.forEach((line, lineIndex) => context.fillText(visibleLine(line), layout.margin, layout.creditTop + lineIndex * 24));
  context.fillStyle = colors.accent; context.font = `16px ${LABEL_FONT}`;
  context.fillText(`Card ${index + 1} of ${layout.pages.length}`, layout.margin, layout.height - layout.margin);
}

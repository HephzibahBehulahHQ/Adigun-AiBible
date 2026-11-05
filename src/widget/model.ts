import type { Reference } from '../types';
import type { CardSourceDependencies, PreparedCardSources } from '../sharing/sources';
import { loadCardSources } from '../sharing/sources.ts';
import { wrapExactText } from '../sharing/pagination.ts';
import { palettes } from '../media.ts';

export interface WidgetLayout {
  width: number; height: number; margin: number; clockSpace: number;
  referenceLines: string[]; editionLines: string[]; textLines: string[]; creditLines: string[];
  referenceTop: number; editionTop: number; textTop: number; creditTop: number;
  textFont: number; lineHeight: number; alternative: string;
}

export async function loadWidgetSource(reference: Reference, dependencies: CardSourceDependencies): Promise<PreparedCardSources> {
  if (!/^[1-3]?[A-Z]{2,3}$/.test(reference.bookId) || !Number.isSafeInteger(reference.chapter) || reference.chapter < 1 || !Number.isSafeInteger(reference.verse) || reference.verse < 1) throw new Error('Choose a valid single verse for the lock-screen card.');
  const source = await loadCardSources({ ...reference, endVerse: undefined }, '', false, dependencies);
  if (source.passages.length !== 1 || source.editions.length !== 1 || source.editions[0].id !== (reference.editionId || 'eng-web')) throw new Error('A lock-screen card requires one verse from the exact selected edition.');
  return source;
}

const visible = (text: string) => text.replace(/[\r\n]+$/g, '');
const serif = 'Georgia, "Times New Roman", serif';
const sans = 'system-ui, sans-serif';

/** Reserve a blank clock area; wrap exact grapheme slices and reject unfit content. */
export function layoutWidget(source: PreparedCardSources, measure: (text: string, font: string) => number): WidgetLayout {
  if (source.passages.length !== 1 || source.sources.length !== 1 || !source.passages[0].text.trim()) throw new Error('Choose one nonempty source verse.');
  const width = 1080, height = 1920, margin = 104, clockSpace = 420, usable = width - margin * 2;
  const wrap = (text: string, font: string) => wrapExactText(text, usable, value => measure(visible(value), font));
  const referenceLines = wrap(source.title, `600 32px ${sans}`);
  const editionLines = wrap(source.passages[0].editionName, `22px ${sans}`);
  const creditText = source.sources[0].credit;
  const creditLines = wrap(creditText, `18px ${sans}`);
  const referenceTop = clockSpace + 58, editionTop = referenceTop + referenceLines.length * 43 + 12;
  const textTop = editionTop + editionLines.length * 30 + 48;
  const creditTop = height - 128 - creditLines.length * 24, textBottom = creditTop - 60;
  let textFont = 62, textLines: string[] = [], lineHeight = 0;
  for (; textFont >= 32; textFont -= 2) {
    textLines = wrap(source.passages[0].text, `${textFont}px ${serif}`);
    lineHeight = Math.ceil(textFont * 1.48);
    if (textTop + textLines.length * lineHeight <= textBottom) break;
  }
  if (textFont < 32 || textTop + textLines.length * lineHeight > textBottom) throw new Error('This verse and its attribution do not fit a legible lock-screen card. Choose another verse or use Share Studio’s multiple cards. Nothing has been cropped.');
  return {
    width, height, margin, clockSpace, referenceLines, editionLines, textLines, creditLines, referenceTop, editionTop, textTop, creditTop, textFont, lineHeight,
    alternative: `${source.title}\n${source.passages[0].editionName}\n\n${source.passages[0].text}\n\n${creditText}`,
  };
}

export function drawWidget(canvas: HTMLCanvasElement, layout: WidgetLayout, palette: keyof typeof palettes): void {
  const colors = palettes[palette]; if (!colors) throw new Error('Choose an available card template.');
  canvas.width = layout.width; canvas.height = layout.height;
  const context = canvas.getContext('2d'); if (!context) throw new Error('This browser cannot create a verse image.');
  context.textBaseline = 'top'; context.fillStyle = colors.background; context.fillRect(0, 0, layout.width, layout.height);
  context.fillStyle = colors.accent; context.font = `600 19px ${sans}`;
  context.fillText('ADIGUN–AIBIBLE  /  HB EVANGELISM', layout.margin, layout.clockSpace);
  context.font = `600 32px ${sans}`;
  layout.referenceLines.forEach((line, index) => context.fillText(visible(line), layout.margin, layout.referenceTop + index * 43));
  context.fillStyle = colors.ink; context.font = `22px ${sans}`;
  layout.editionLines.forEach((line, index) => context.fillText(visible(line), layout.margin, layout.editionTop + index * 30));
  context.font = `${layout.textFont}px ${serif}`;
  layout.textLines.forEach((line, index) => context.fillText(visible(line), layout.margin, layout.textTop + index * layout.lineHeight));
  context.fillStyle = colors.accent; context.fillRect(layout.margin, layout.creditTop - 24, 72, 3);
  context.fillStyle = colors.ink; context.font = `18px ${sans}`;
  layout.creditLines.forEach((line, index) => context.fillText(visible(line), layout.margin, layout.creditTop + index * 24));
}

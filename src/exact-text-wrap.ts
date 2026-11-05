export class SourceUnitTooWideError extends Error {}

/** Exact slices; Myanmar uses dictionary word boundaries to retain dependent vowels. */
export function wrapExactText(text: string, width: number, measure: (value: string) => number): string[] {
  if (!Number.isFinite(width) || width <= 0) throw new Error('The card has no usable text width.');
  if (typeof Intl.Segmenter !== 'function') throw new Error('This browser cannot safely wrap all source-language characters. Use an up-to-date browser to create cards; no text has been cropped.');
  const myanmar = /\p{Script_Extensions=Myanmar}/u.test(text);
  const segmenter = new Intl.Segmenter(myanmar ? 'my' : undefined, { granularity: myanmar ? 'word' : 'grapheme' });
  const clusters = [...segmenter.segment(text)].map(segment => segment.segment);
  const lines: string[] = []; let start = 0, cursor = 0, lastBreak = -1, candidate = '';
  while (cursor < clusters.length) {
    const cluster = clusters[cursor];
    if (/^[\r\n]+$/.test(cluster)) {
      lines.push(clusters.slice(start, cursor + 1).join('')); cursor++; start = cursor; lastBreak = -1; candidate = ''; continue;
    }
    if (measure(candidate + cluster) <= width) {
      candidate += cluster;
      if (myanmar || /^\s+$/u.test(cluster)) lastBreak = cursor + 1;
      cursor++; continue;
    }
    if (cursor === start) throw new SourceUnitTooWideError(myanmar ? 'A Myanmar word or syllable exceeds the card width. Choose a larger card or smaller margin. Nothing has been cropped.' : 'A text character exceeds the card width. Increase the usable width. Nothing has been cropped.');
    const end = lastBreak > start ? lastBreak : cursor;
    lines.push(clusters.slice(start, end).join('')); start = end; cursor = start; lastBreak = -1; candidate = '';
  }
  if (start < clusters.length) lines.push(clusters.slice(start).join(''));
  return lines.length ? lines : [''];
}

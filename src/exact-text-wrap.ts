/** Each returned string is an exact slice. Joining all slices reproduces the original text. */
export function wrapExactText(text: string, width: number, measure: (value: string) => number): string[] {
  if (!Number.isFinite(width) || width <= 0) throw new Error('The card has no usable text width.');
  if (typeof Intl.Segmenter !== 'function') throw new Error('This browser cannot safely wrap all source-language characters. Use an up-to-date browser to create cards; no text has been cropped.');
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

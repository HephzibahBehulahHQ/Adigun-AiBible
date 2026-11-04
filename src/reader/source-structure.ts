import type { Chapter } from '../types.ts';

export interface NormalizedNote {
  index: number;
  at: number;
  marker: string;
  caller: string;
  text: string;
  content?: unknown[];
}

export interface SourceSegment {
  start: number;
  end: number;
  text: string;
  markers: ('wj' | 'add')[];
  notesBefore: NormalizedNote[];
  paragraphIndex: number | null;
  paragraphStyle: string | null;
  paragraphStart: boolean;
}

export interface VerseStructure {
  number: number;
  text: string;
  segments: SourceSegment[];
  notes: NormalizedNote[];
  trailingNotes: NormalizedNote[];
  issues: string[];
  hasMetadata: boolean;
}

export interface HeadingStructure {
  index: number;
  afterVerse: number | null;
  style: string;
  text: string;
  content?: unknown[];
  segments: SourceSegment[];
  notes: NormalizedNote[];
  trailingNotes: NormalizedNote[];
  validAnchor: boolean;
  issues: string[];
}

export interface ParagraphStructure {
  index: number;
  style: string;
  spans: { verse: number; start: number; end: number }[];
}

export interface ChapterStructure {
  verses: VerseStructure[];
  headings: HeadingStructure[];
  paragraphs: ParagraphStructure[];
  issues: string[];
  hasMetadata: boolean;
}

type Marker = 'wj' | 'add';
type CharacterRange = { start: number; end: number; marker: Marker };
type ParagraphRange = {
  start: number;
  end: number;
  index: number;
  style: string;
  first: boolean;
};
type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOffset(value: unknown, length: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= length;
}

function hasEntries(value: unknown): boolean {
  return value !== undefined && (!Array.isArray(value) || value.length > 0);
}

function plainSegments(text: string): SourceSegment[] {
  if (!text) return [];
  return [{
    start: 0,
    end: Array.from(text).length,
    text,
    markers: [],
    notesBefore: [],
    paragraphIndex: null,
    paragraphStyle: null,
    paragraphStart: false,
  }];
}

function readNotes(value: unknown, length: number, issues: string[]): NormalizedNote[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    issues.push('Notes must be an array.');
    return [];
  }
  const notes: NormalizedNote[] = [];
  value.forEach((note: unknown, index: number) => {
    if (!isRecord(note) || !isOffset(note.at, length) ||
      typeof note.marker !== 'string' || typeof note.caller !== 'string' ||
      typeof note.text !== 'string' || (note.content !== undefined && !Array.isArray(note.content))) {
      issues.push(`Note ${index} has invalid content or a Unicode code point offset outside the text.`);
      return;
    }
    notes.push({
      index,
      at: note.at,
      marker: note.marker,
      caller: note.caller,
      text: note.text,
      ...(Array.isArray(note.content) ? { content: [...note.content] } : {}),
    });
  });
  return notes.sort((a, b) => a.at - b.at || a.index - b.index);
}

function readCharacters(value: unknown, length: number, issues: string[]): CharacterRange[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    issues.push('Character spans must be an array.');
    return [];
  }
  const ranges: CharacterRange[] = [];
  value.forEach((range: unknown, index: number) => {
    if (!isRecord(range) || !isOffset(range.start, length) || !isOffset(range.end, length) ||
      range.end < range.start || (range.marker !== 'wj' && range.marker !== 'add')) {
      issues.push(`Character span ${index} has an unsupported marker or invalid Unicode code point offsets.`);
      return;
    }
    if (range.start !== range.end) ranges.push({ start: range.start, end: range.end, marker: range.marker });
  });
  // Equal and fully nested intervals are valid. Crossing intervals do not describe a source tree.
  const ordered = [...ranges].sort((a, b) => a.start - b.start || b.end - a.end);
  const ends: number[] = [];
  for (const range of ordered) {
    while (ends.length && ends[ends.length - 1] <= range.start) ends.pop();
    if (ends.length && range.end > ends[ends.length - 1]) {
      issues.push('Character spans cross rather than nest.');
      break;
    }
    ends.push(range.end);
  }
  return ranges;
}

function makeSegments(
  text: string,
  characters: CharacterRange[],
  notes: NormalizedNote[],
  paragraphs: ParagraphRange[],
): SourceSegment[] {
  const points = Array.from(text);
  const boundaries = new Set<number>([0, points.length]);
  for (const range of characters) {
    boundaries.add(range.start);
    boundaries.add(range.end);
  }
  for (const note of notes) boundaries.add(note.at);
  for (const range of paragraphs) {
    boundaries.add(range.start);
    boundaries.add(range.end);
  }
  const ordered = [...boundaries].sort((a, b) => a - b);
  const segments: SourceSegment[] = [];
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const start = ordered[index];
    const end = ordered[index + 1];
    if (start === end) continue;
    const paragraph = paragraphs.find((range) => range.start <= start && end <= range.end);
    const markers: Marker[] = [];
    for (const marker of ['wj', 'add'] as const) {
      if (characters.some((range) => range.marker === marker && range.start <= start && end <= range.end)) {
        markers.push(marker);
      }
    }
    segments.push({
      start,
      end,
      text: points.slice(start, end).join(''),
      markers,
      notesBefore: notes.filter((note) => note.at === start),
      paragraphIndex: paragraph?.index ?? null,
      paragraphStyle: paragraph?.style ?? null,
      paragraphStart: Boolean(paragraph?.first && paragraph.start === start),
    });
  }
  return segments;
}

/** Build a render-only view of source metadata without rewriting or interpreting source text. */
export function buildChapterStructure(chapter: Chapter): ChapterStructure {
  const issues: string[] = [];
  const paragraphIssues = new Map<number, string[]>();
  const paragraphRanges = new Map<number, ParagraphRange[]>();
  const verseLengths = new Map(chapter.verses.map((verse) => [verse.number, Array.from(verse.text).length]));
  const verseNumbers = new Set(chapter.verses.map((verse) => verse.number));
  const paragraphs: ParagraphStructure[] = [];
  const hasMetadata = hasEntries(chapter.headings) || hasEntries(chapter.paragraphs) ||
    chapter.verses.some((verse) => hasEntries(verse.notes) || hasEntries(verse.characterSpans));
  const offsetValid = chapter.offsetUnit === 'unicode-codepoint';
  const addParagraphIssue = (verse: number, message: string) => {
    const local = paragraphIssues.get(verse) ?? [];
    local.push(message);
    paragraphIssues.set(verse, local);
  };
  const rawParagraphs: unknown = chapter.paragraphs;
  if (hasEntries(rawParagraphs) && !offsetValid) {
    issues.push('Paragraph offsets require offsetUnit "unicode-codepoint"; paragraph metadata was not applied.');
    for (const verse of chapter.verses) addParagraphIssue(verse.number, 'Paragraph offset unit is missing or unsupported.');
  } else if (rawParagraphs !== undefined && !Array.isArray(rawParagraphs)) {
    issues.push('Paragraphs must be an array; paragraph metadata was not applied.');
    for (const verse of chapter.verses) addParagraphIssue(verse.number, 'Paragraph metadata is malformed.');
  } else if (Array.isArray(rawParagraphs)) {
    rawParagraphs.forEach((paragraph: unknown, index: number) => {
      if (!isRecord(paragraph) || typeof paragraph.style !== 'string' || !Array.isArray(paragraph.spans)) {
        issues.push(`Paragraph ${index} has invalid style or spans; paragraph metadata was not applied.`);
        for (const verse of chapter.verses) addParagraphIssue(verse.number, `Paragraph ${index} is malformed.`);
        return;
      }
      const spans: ParagraphStructure['spans'] = [];
      let invalid = false;
      for (const span of paragraph.spans as unknown[]) {
        const length = isRecord(span) && typeof span.verse === 'number' ? verseLengths.get(span.verse) : undefined;
        if (!isRecord(span) || length === undefined || !isOffset(span.start, length) ||
          !isOffset(span.end, length) || span.end < span.start) {
          invalid = true;
          issues.push(`Paragraph ${index} contains an unknown verse or invalid Unicode code point offsets.`);
          continue;
        }
        spans.push({ verse: span.verse as number, start: span.start, end: span.end });
      }
      if (invalid) {
        // A malformed span can obscure the paragraph's extent, so suppress its formatting throughout.
        const affected = new Set(spans.map((span) => span.verse));
        for (const span of paragraph.spans as unknown[]) {
          if (isRecord(span) && typeof span.verse === 'number' && verseNumbers.has(span.verse)) affected.add(span.verse);
        }
        if (!affected.size) for (const verse of chapter.verses) affected.add(verse.number);
        for (const verse of affected) addParagraphIssue(verse, `Paragraph ${index} has invalid spans.`);
        return;
      }
      paragraphs.push({ index, style: paragraph.style, spans });
      let first = true;
      for (const span of spans) {
        // Carryovers at a verse end contain no text and do not consume a paragraph's first visible start.
        if (span.start === span.end) continue;
        const ranges = paragraphRanges.get(span.verse) ?? [];
        ranges.push({ start: span.start, end: span.end, index, style: paragraph.style, first });
        paragraphRanges.set(span.verse, ranges);
        first = false;
      }
    });
  }
  for (const [verse, ranges] of paragraphRanges) {
    const ordered = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
    for (let index = 1; index < ordered.length; index += 1) {
      if (ordered[index].start < ordered[index - 1].end) {
        addParagraphIssue(verse, 'Paragraph spans overlap.');
        break;
      }
    }
  }

  const verses: VerseStructure[] = chapter.verses.map((verse) => {
    const localIssues = [...(paragraphIssues.get(verse.number) ?? [])];
    const length = verseLengths.get(verse.number) ?? 0;
    const hasOwnOffsets = hasEntries(verse.notes) || hasEntries(verse.characterSpans);
    const hasVerseMetadata = hasOwnOffsets || paragraphRanges.has(verse.number) || paragraphIssues.has(verse.number) ||
      paragraphs.some((paragraph) => paragraph.spans.some((span) => span.verse === verse.number));
    if (hasOwnOffsets && !offsetValid) localIssues.push('Verse offsets require offsetUnit "unicode-codepoint".');
    const notes = offsetValid ? readNotes(verse.notes, length, localIssues) : [];
    const characters = offsetValid ? readCharacters(verse.characterSpans, length, localIssues) : [];
    const valid = localIssues.length === 0;
    for (const issue of localIssues) issues.push(`Verse ${verse.number}: ${issue}`);
    return {
      number: verse.number,
      text: verse.text,
      segments: valid ? makeSegments(verse.text, characters, notes, paragraphRanges.get(verse.number) ?? []) : plainSegments(verse.text),
      notes: valid ? notes : [],
      trailingNotes: valid ? notes.filter((note) => note.at === length) : [],
      issues: localIssues,
      hasMetadata: hasVerseMetadata,
    };
  });

  const headings: HeadingStructure[] = [];
  const rawHeadings: unknown = chapter.headings;
  if (rawHeadings !== undefined && !Array.isArray(rawHeadings)) {
    issues.push('Headings must be an array; heading metadata was not applied.');
  } else if (Array.isArray(rawHeadings)) {
    rawHeadings.forEach((heading: unknown, index: number) => {
      if (!isRecord(heading)) {
        issues.push(`Heading ${index} is malformed.`);
        return;
      }
      const localIssues: string[] = [];
      const text = typeof heading.text === 'string' ? heading.text : '';
      if (typeof heading.text !== 'string') localIssues.push('Heading text must be a string.');
      const style = typeof heading.style === 'string' ? heading.style : '';
      if (typeof heading.style !== 'string') localIssues.push('Heading style must be a string.');
      if (heading.content !== undefined && !Array.isArray(heading.content)) localIssues.push('Heading content must be an array.');
      const validAnchor = heading.afterVerse === null ||
        (typeof heading.afterVerse === 'number' && Number.isInteger(heading.afterVerse) && verseNumbers.has(heading.afterVerse));
      if (!validAnchor) localIssues.push('Heading anchor does not name a verse in this chapter.');
      const afterVerse = typeof heading.afterVerse === 'number' ? heading.afterVerse : null;
      const unit = heading.offsetUnit === undefined ? chapter.offsetUnit : heading.offsetUnit;
      const noteIssues: string[] = [];
      const length = Array.from(text).length;
      if (hasEntries(heading.notes) && unit !== 'unicode-codepoint') {
        noteIssues.push('Heading offsets require offsetUnit "unicode-codepoint".');
      }
      const notes = unit === 'unicode-codepoint' ? readNotes(heading.notes, length, noteIssues) : [];
      localIssues.push(...noteIssues);
      const usableNotes = localIssues.length === 0 ? notes : [];
      headings.push({
        index,
        afterVerse,
        style,
        text,
        ...(Array.isArray(heading.content) ? { content: [...heading.content] } : {}),
        segments: localIssues.length === 0 ? makeSegments(text, [], usableNotes, []) : plainSegments(text),
        notes: usableNotes,
        trailingNotes: usableNotes.filter((note) => note.at === length),
        validAnchor,
        issues: localIssues,
      });
      for (const issue of localIssues) issues.push(`Heading ${index}: ${issue}`);
    });
  }
  return { verses, headings, paragraphs, issues, hasMetadata };
}

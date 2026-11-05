import type { MemoryRetelling } from './model';
import { sameRecording, validateRetellingRecording } from './retelling-media.ts';
import type { RetellingRecording } from './retelling-media';

export interface RetellingTranscriptDraft {
  id: string;
  at: string;
  originalText: string;
  text: string;
  recording: RetellingRecording;
}

/** A transcript draft belongs to one saved original, never to its current list position. */
export function beginRetellingTranscript(item: MemoryRetelling): RetellingTranscriptDraft {
  if (!item.id || !item.recording || item.recording.id !== item.id) throw new Error('Choose a saved original recording before editing its transcript.');
  return { id:item.id, at:item.at, originalText:item.text, text:item.text, recording:validateRetellingRecording(item.recording) };
}

export function retellingTranscriptChanged(draft: RetellingTranscriptDraft): boolean {
  return draft.text !== draft.originalText;
}

export function retellingTranscriptTarget(items: MemoryRetelling[], draft: RetellingTranscriptDraft): MemoryRetelling | undefined {
  return items.find(item => item.id === draft.id && !!item.recording && sameRecording(item.recording, draft.recording));
}

/** A removed or replaced original must not transfer its unsaved writing to another recording. */
export function applyRetellingTranscript(items: MemoryRetelling[], draft: RetellingTranscriptDraft): MemoryRetelling[] {
  if (typeof draft.text !== 'string' || draft.text.length > 5000) throw new Error('Manual transcripts are limited to 5,000 characters.');
  if (!retellingTranscriptTarget(items, draft)) throw new Error('This original recording was removed or replaced. Your transcript draft is still shown; keep it as a new written retelling or copy it before leaving.');
  return items.map(item => item.id === draft.id ? { ...item, text:draft.text } : item);
}

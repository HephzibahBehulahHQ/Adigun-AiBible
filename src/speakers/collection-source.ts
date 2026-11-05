import { hashSourceText } from '../editorial.ts';
import type { PublisherSpeech } from './model';
import { loadPublisherStudy } from './source.ts';
import type { PublisherStudy, SpeakerDependencies } from './source';
import { MAX_SPEECH_COLLECTIONS, MAX_SPEECH_ENTRIES, MAX_SPEECH_COLLECTION_BACKUP_BYTES, validateSpeechCollections, validateSpeechPin } from './collection-model.ts';
import type { SpeechCollectionsState, SpeechPin } from './collection-model';

function checkCancellation(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error('Speech collection source checking cancelled. Nothing was changed.');
}

async function matchPinnedSpeech(pin: SpeechPin, study: PublisherStudy, signal?: AbortSignal): Promise<PublisherSpeech> {
  checkCancellation(signal);
  const edition = study.edition;
  if (edition.id !== pin.reference.editionId || edition.sha256 !== pin.editionSha256
    || edition.name !== pin.editionName || edition.language !== pin.language || edition.sourceUrl !== pin.sourceUrl
    || edition.corpus !== 'bible') throw new Error('This saved speech belongs to a different source revision or publisher label. No replacement wording was used.');
  const speech = study.speeches.find(entry => entry.id === pin.id);
  if (!speech || speech.bookName !== pin.bookName || speech.marker !== pin.marker || speech.offsetUnit !== pin.offsetUnit
    || speech.reference.bookId !== pin.reference.bookId || speech.reference.chapter !== pin.reference.chapter
    || speech.reference.verse !== pin.reference.verse || speech.reference.editionId !== pin.reference.editionId
    || speech.start !== pin.start || speech.end !== pin.end) throw new Error('The saved publisher marking, source label or exact speech boundaries are unavailable or changed. No substitute speech was used.');
  const sourceTextHash = await hashSourceText(speech.fullVerse);
  checkCancellation(signal);
  if (sourceTextHash !== pin.sourceTextHash) throw new Error('The saved speech source wording changed. Reopen matching source files; no replacement wording was used.');
  return speech;
}

export async function loadPinnedSpeech(value: SpeechPin, dependencies: SpeakerDependencies, signal?: AbortSignal): Promise<PublisherSpeech> {
  const [speech] = await loadPinnedSpeeches([value], dependencies, signal);
  return speech;
}

/** Results retain input order; identical pins share checks only within this operation. */
export async function loadPinnedSpeeches(values: SpeechPin[], dependencies: SpeakerDependencies, signal?: AbortSignal): Promise<PublisherSpeech[]> {
  checkCancellation(signal);
  if (!Array.isArray(values) || values.length > MAX_SPEECH_COLLECTIONS * MAX_SPEECH_ENTRIES) throw new Error('Too many saved speech sources to check.');
  const pins = Array.from(values, validateSpeechPin);
  if (new TextEncoder().encode(JSON.stringify(pins)).byteLength > MAX_SPEECH_COLLECTION_BACKUP_BYTES) throw new Error('Saved speech sources exceed the 2 MiB backup limit.');
  const unique = new Map<string, SpeechPin>();
  for (const pin of pins) {
    const previous = unique.get(pin.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(pin)) throw new Error('The same speech identifier has conflicting source pins. Nothing was changed.');
    unique.set(pin.id, pin);
  }
  const studies = new Map<string, PublisherStudy>(), verified = new Map<string, PublisherSpeech>();
  for (const pin of unique.values()) {
    checkCancellation(signal);
    const key = `${pin.reference.editionId}:${pin.reference.bookId}`;
    let study = studies.get(key);
    if (!study) {
      study = await loadPublisherStudy(pin.reference.editionId, pin.reference.bookId, dependencies, signal);
      checkCancellation(signal);
      studies.set(key, study);
    }
    verified.set(pin.id, await matchPinnedSpeech(pin, study, signal));
    checkCancellation(signal);
  }
  return pins.map(pin => verified.get(pin.id)!);
}

export async function pinPublisherSpeech(speech: PublisherSpeech, dependencies: SpeakerDependencies, signal?: AbortSignal): Promise<SpeechPin> {
  checkCancellation(signal);
  if (typeof speech.fullVerse !== 'string' || typeof speech.text !== 'string') throw new Error('The publisher source wording is unavailable.');
  const sourceTextHash = await hashSourceText(speech.fullVerse);
  checkCancellation(signal);
  const pin = validateSpeechPin({
    id: speech.id, reference: speech.reference, editionSha256: speech.edition.sha256, sourceTextHash,
    editionName: speech.edition.name, bookName: speech.bookName, language: speech.edition.language, sourceUrl: speech.edition.sourceUrl,
    marker: speech.marker, offsetUnit: speech.offsetUnit, start: speech.start, end: speech.end,
  });
  const checked = await loadPinnedSpeech(pin, dependencies, signal);
  checkCancellation(signal);
  if (checked.text !== speech.text) throw new Error('The selected publisher speech no longer matches its exact source wording. Nothing was saved.');
  return pin;
}

export async function checkSpeechCollectionSources(value: SpeechCollectionsState, dependencies: SpeakerDependencies, signal?: AbortSignal): Promise<SpeechCollectionsState> {
  checkCancellation(signal);
  const state = validateSpeechCollections(value);
  await loadPinnedSpeeches(state.collections.flatMap(collection => collection.entries), dependencies, signal);
  checkCancellation(signal);
  return state;
}

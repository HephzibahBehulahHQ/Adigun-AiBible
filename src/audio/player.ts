import type { AudioCursor, AudioEntry, AudioSettings } from './model';
import type { Verse } from '../types';

export interface ListeningVoice { voiceURI: string; name: string; lang: string; localService: boolean }
export interface SpeechEvents { start: () => void; end: () => void; error: () => void; pause: () => void; resume: () => void }
export interface SpeechDriver {
  voices: () => ListeningVoice[];
  speak: (text: string, voice: ListeningVoice, rate: number, events: SpeechEvents) => void;
  cancel: () => void;
  pause: () => boolean;
  resume: () => boolean;
}
export interface PlaybackState {
  phase: 'idle' | 'loading' | 'playing' | 'paused' | 'stopped' | 'ended' | 'error';
  message: string;
  cursor: AudioCursor | null;
  sleepAt: number | null;
}
export const languageKey = (language: string): string => language.replace(/_/g, '-').toLowerCase().split('-')[0];
export const voiceKey = (voice: ListeningVoice): string => `${voice.voiceURI}|${voice.lang}`;
export function matchingVoices(voices: ListeningVoice[], language: string): ListeningVoice[] { return voices.filter(voice => languageKey(voice.lang) === languageKey(language)); }
export function selectVoice(voices: ListeningVoice[], language: string, selected?: string): ListeningVoice | undefined {
  const matches = matchingVoices(voices, language);
  return selected ? matches.find(voice => voiceKey(voice) === selected) : matches.find(voice => voice.localService) || matches[0];
}
export function browserSpeechDriver(): SpeechDriver | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return null;
  const synthesis = window.speechSynthesis;
  let utterance: SpeechSynthesisUtterance | null = null;
  return {
    voices: () => synthesis.getVoices(),
    cancel: () => { synthesis.cancel(); utterance = null; },
    pause: () => { synthesis.pause(); return synthesis.paused; },
    resume: () => { synthesis.resume(); return !synthesis.paused; },
    speak: (text, voice, rate, events) => {
      const actual = synthesis.getVoices().find(candidate => voiceKey(candidate) === voiceKey(voice));
      if (!actual) throw new Error('The selected voice is no longer installed. Refresh the voice list.');
      utterance = new SpeechSynthesisUtterance(text); utterance.voice = actual; utterance.lang = actual.lang; utterance.rate = rate;
      utterance.onstart = events.start; utterance.onend = events.end; utterance.onerror = events.error; utterance.onpause = events.pause; utterance.onresume = events.resume;
      synthesis.speak(utterance);
    },
  };
}

/** Only a user action starts this engine. Each event belongs to one cancellable run. */
export class ListeningPlayer {
  private run = 0;
  private sleepTimer: ReturnType<typeof setTimeout> | undefined;
  private startTimer: ReturnType<typeof setTimeout> | undefined;
  private sleepAt: number | null = null;
  private cursor: AudioCursor | null = null;
  private phase: PlaybackState['phase'] = 'idle';
  private entry: AudioEntry | undefined;
  private currentVoice: ListeningVoice | undefined;
  constructor(private readonly driver: SpeechDriver, private readonly load: (entry: AudioEntry) => Promise<Verse[]>, private readonly onState: (state: PlaybackState) => void, private readonly onPosition: (cursor: AudioCursor) => void, private readonly online: () => boolean = () => navigator.onLine) {}
  private emit(phase: PlaybackState['phase'], message: string): void { this.phase = phase; this.onState({ phase, message, cursor: this.cursor ? { ...this.cursor } : null, sleepAt: this.sleepAt }); }
  private clearTimers(): void { if (this.sleepTimer) clearTimeout(this.sleepTimer); if (this.startTimer) clearTimeout(this.startTimer); this.sleepTimer = undefined; this.startTimer = undefined; }
  stop(message = 'Playback stopped. Resume begins at the start of the unfinished verse.'): void {
    ++this.run; this.clearTimers(); this.sleepAt = null; this.currentVoice = undefined; this.driver.cancel(); this.emit('stopped', message);
  }
  dispose(): void { ++this.run; this.clearTimers(); this.driver.cancel(); }
  connectionChanged(): void { if (!this.online() && this.currentVoice && !this.currentVoice.localService && ['loading', 'playing', 'paused'].includes(this.phase)) this.stop('Internet disconnected. This network voice has stopped; choose an available local voice to continue.'); }
  voicesChanged(): void { if (this.currentVoice && !this.driver.voices().some(voice => voiceKey(voice) === voiceKey(this.currentVoice!))) this.stop('The active voice is no longer available. Choose an available matching voice.'); }
  pause(): void {
    if (this.phase !== 'playing') return;
    try { if (this.driver.pause()) this.emit('paused', 'Paused. The sleep timer continues to run.'); else this.stop('This browser did not confirm pause. Playback stopped; Play queue resumes from this verse.'); }
    catch { this.stop('Pause is unavailable in this browser. Playback stopped.'); }
  }
  resume(): void {
    if (this.phase !== 'paused') return;
    try { if (this.driver.resume()) this.emit('playing', 'Resuming the current verse…'); else this.stop('This browser did not resume. Play queue restarts from this verse.'); }
    catch { this.stop('Resume is unavailable in this browser. Playback stopped.'); }
  }
  async start(entries: AudioEntry[], settings: AudioSettings, allowNetwork: boolean, from: AudioCursor | null = null): Promise<void> {
    this.stop('Preparing the listening queue…');
    if (!entries.length) { this.emit('error', 'Add a passage before playing.'); return; }
    const run = this.run; this.cursor = null;
    let entryIndex = from && !from.completed ? entries.findIndex(entry => entry.id === from.entryId) : 0;
    if (entryIndex < 0) entryIndex = 0;
    this.sleepAt = settings.sleepMinutes ? Date.now() + settings.sleepMinutes * 60_000 : null;
    if (this.sleepAt) this.sleepTimer = setTimeout(() => { if (this.run === run) this.stop('Sleep timer finished. Playback stopped at the current verse.'); }, settings.sleepMinutes * 60_000);
    const fail = (message: string) => { if (this.run !== run) return; ++this.run; this.clearTimers(); this.sleepAt = null; this.driver.cancel(); this.currentVoice = undefined; this.emit('error', message); };
    const playEntry = async (): Promise<void> => {
      if (this.run !== run) return;
      if (entryIndex >= entries.length) { this.clearTimers(); this.sleepAt = null; this.currentVoice = undefined; if (this.cursor) { this.cursor = { ...this.cursor, completed: true }; this.onPosition(this.cursor); } this.emit('ended', 'Queue finished. Nothing else will play automatically.'); return; }
      const entry = this.entry = entries[entryIndex];
      this.emit('loading', `Checking source and voice for ${entry.editionName}…`);
      try {
        const verses = await this.load(entry); if (this.run !== run) return;
        const selected = selectVoice(this.driver.voices(), entry.language, settings.voices[languageKey(entry.language)]);
        if (!selected) throw new Error(`No selected matching ${entry.language} voice is available. Choose a reported voice for this language; no other language is substituted.`);
        if (!selected.localService && !allowNetwork) throw new Error('This passage needs a network voice. Allow network-voice processing explicitly, or select a local voice.');
        if (!selected.localService && !this.online()) throw new Error('The selected network voice needs an internet connection.');
        if (!verses.length) throw new Error('No source wording is available for this queue entry.');
        this.currentVoice = selected;
        let repetition = from?.entryId === entry.id && !from.completed ? from.repetition : 0;
        let index = from?.entryId === entry.id && !from.completed ? verses.findIndex(verse => verse.number === from.verse) : 0;
        if (index < 0 || repetition >= entry.repeats) throw new Error('The saved listening position is absent from this source. Restart this queue entry.');
        from = null;
        const speakNext = (): void => {
          if (this.run !== run) return;
          if (repetition >= entry.repeats) { entryIndex++; void playEntry(); return; }
          if (!selected.localService && !this.online()) { fail('Internet disconnected. The network voice could not continue.'); return; }
          const verse = verses[index]; this.cursor = { entryId: entry.id, verse: verse.number, repetition, completed: false }; this.onPosition({ ...this.cursor });
          this.emit('loading', `Starting ${entry.ref.bookId} ${entry.ref.chapter}:${verse.number}, repeat ${repetition + 1} of ${entry.repeats}…`);
          this.startTimer = setTimeout(() => fail('The selected voice did not start. Check device audio or choose another available voice.'), 15_000);
          const current = () => this.run === run;
          try {
            this.driver.speak(verse.text, selected, settings.rate, {
              start: () => { if (!current()) return; if (this.startTimer) clearTimeout(this.startTimer); this.emit('playing', `Reading ${entry.ref.bookId} ${entry.ref.chapter}:${verse.number} · ${entry.editionName} · repeat ${repetition + 1} of ${entry.repeats}.`); },
              end: () => { if (!current()) return; if (this.startTimer) clearTimeout(this.startTimer); index++; if (index >= verses.length) { index = 0; repetition++; } speakNext(); },
              error: () => fail('The browser voice could not finish this verse. Playback stopped; no completed passage is claimed.'),
              pause: () => { if (current()) this.emit('paused', 'Paused. The sleep timer continues to run.'); },
              resume: () => { if (current()) this.emit('playing', `Reading ${entry.ref.bookId} ${entry.ref.chapter}:${verse.number} · ${entry.editionName}.`); },
            });
          } catch (error) { fail(error instanceof Error ? error.message : 'Speech playback could not start.'); }
        };
        speakNext();
      } catch (error) { fail(error instanceof Error ? error.message : 'This source could not be prepared for listening.'); }
    };
    await playEntry();
  }
}

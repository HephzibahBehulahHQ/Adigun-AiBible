import { useEffect, useRef, useState } from 'react';
import { browserSpeechDriver, languageKey, ListeningPlayer, matchingVoices, voiceKey } from '../audio/player';
import type { ListeningVoice, PlaybackState } from '../audio/player';
import { loadListeningEntry } from '../audio/source';
import type { TourPassage } from './model';

export default function TourNarration({ passage }: { passage: TourPassage }) {
  const [voices,setVoices] = useState<ListeningVoice[]>([]), [voice,setVoice] = useState(''), [supported,setSupported] = useState(false);
  const [state,setState] = useState<PlaybackState>({phase:'idle',message:'Choose Play passage to start. No audio plays automatically.',cursor:null,sleepAt:null});
  const player = useRef<ListeningPlayer | null>(null);
  useEffect(() => {
    let alive = true; const driver = browserSpeechDriver(); setSupported(!!driver);
    if (driver) player.current = new ListeningPlayer(driver,loadListeningEntry,state => { if (alive) setState(state); },cursor => { if (alive) setState(previous => ({ ...previous, cursor })); });
    const refresh = () => { if (driver) { setVoices(driver.voices().filter(voice => voice.localService)); player.current?.voicesChanged(); } };
    const leaving = () => player.current?.stop('Passage narration stopped when this page was left.');
    refresh(); if (driver) window.speechSynthesis.addEventListener('voiceschanged',refresh); window.addEventListener('pagehide',leaving);
    return () => { alive = false; player.current?.dispose(); player.current = null; if (driver) window.speechSynthesis.removeEventListener('voiceschanged',refresh); window.removeEventListener('pagehide',leaving); };
  },[]);
  const matches = matchingVoices(voices,passage.edition.language), chosen = matches.find(candidate => voiceKey(candidate) === voice) || matches[0];
  const active = ['loading','playing','paused'].includes(state.phase), currentVerse = passage.verses.find(verse => verse.number === state.cursor?.verse);
  function play() {
    if (!chosen || !player.current) return;
    const entry = {id:'athens-current-stop',ref:{...passage.reference,endVerse:passage.reference.endVerse ?? passage.reference.verse},editionName:passage.edition.name,language:passage.edition.language,sourceSha256:passage.edition.sha256!,repeats:1};
    void player.current.start([entry],{rate:1,sleepMinutes:0,voices:{[languageKey(passage.edition.language)]:voiceKey(chosen)}},false);
  }
  return <section className="tour-narration" aria-label="Device passage narration">
    <h3>Device narration · exact Scripture only</h3><p>Only browser-reported local voices in the source language are offered. There is no recorded narrator or character impersonation. Source permission is checked again before playback.</p>
    {!supported ? <p>This browser does not supply device speech. The full written passage below remains available.</p> : !matches.length ? <p>No local {passage.edition.language} voice is reported by this device. No other language or network voice is substituted.</p> : <><label>Device voice<select value={chosen ? voiceKey(chosen) : ''} disabled={active} onChange={event => setVoice(event.target.value)}>{matches.map(candidate => <option key={voiceKey(candidate)} value={voiceKey(candidate)}>{candidate.name} · {candidate.lang}</option>)}</select></label><div className="tour-controls"><button type="button" className="secondary" disabled={active} onClick={play}>Play passage</button>{state.phase === 'playing' && <button type="button" className="secondary" onClick={() => player.current?.pause()}>Pause narration</button>}{state.phase === 'paused' && <button type="button" className="secondary" onClick={() => player.current?.resume()}>Resume narration</button>}<button type="button" className="secondary" disabled={!active} onClick={() => player.current?.stop('Passage narration stopped.')}>Stop narration</button></div></>}
    <p role="status">{state.message}</p>{currentVerse && <div className="tour-caption" aria-label="Current narration caption" lang={passage.edition.language}><strong>Acts 17:{currentVerse.number}</strong><p>{currentVerse.text}</p></div>}
  </section>;
}

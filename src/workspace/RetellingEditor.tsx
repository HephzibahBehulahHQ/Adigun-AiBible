import { sourceDirection, sourceFont } from '../source-typography';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Edition, Verse } from '../types';
import { sourceCredit } from '../data';
import type { MemoryCard, MemoryRetelling } from './model';
import { explicitReference } from './model';
import type { WorkspaceChange } from './useWorkspace';
import { appendRetellingPrompts } from './retelling';
import type { RetellingDraft, RetellingMedia } from './retelling-media';
import { useRetellingGuard } from './retelling-guard';
import RetellingRecorder from './RetellingRecorder';
import RetellingPlayer from './RetellingPlayer';
import { applyRetellingTranscript, beginRetellingTranscript, retellingTranscriptChanged, retellingTranscriptTarget } from './retelling-transcript';
import type { RetellingTranscriptDraft } from './retelling-transcript';

export default function RetellingEditor({ card, source, busy, commit, onRecordingChange }: { card:MemoryCard; source:{ edition:Edition; verses:Verse[] } | null; busy:boolean; commit:WorkspaceChange; onRecordingChange:(active:boolean) => void }) {
  const [text,setText] = useState(''); const [draft,setDraft] = useState<RetellingDraft | null>(null);
  const [active,setActive] = useState(false); const [error,setError] = useState(''); const [notice,setNotice] = useState('');
  const [open,setOpen] = useState(false); const [transcriptEdit,setTranscriptEdit] = useState<RetellingTranscriptDraft | null>(null);
  const baseline = useRef(JSON.stringify(card.retellings));
  const [,refresh] = useState(0);
  const sourceBinding = useMemo(() => source?.edition.sha256 && /^[a-f0-9]{64}$/.test(source.edition.sha256) ? { ref:explicitReference(card.ref),editionSha256:source.edition.sha256 } : null,[card.ref,source]);
  const preview = useMemo<RetellingMedia | undefined>(() => { if (!draft) return undefined; const { blob,...metadata } = draft; return { recording:{ id:'unsaved-preview',...metadata },blob }; },[draft]);
  const transcriptTarget = transcriptEdit ? retellingTranscriptTarget(card.retellings,transcriptEdit) : undefined;
  const dirty = !!text || !!draft || !!(transcriptEdit && retellingTranscriptChanged(transcriptEdit));
  useRetellingGuard(dirty,active,busy);
  const callback = useRef(onRecordingChange); callback.current = onRecordingChange;
  useEffect(() => () => callback.current(false),[]);
  useEffect(() => { if (!dirty && !active && !transcriptEdit) baseline.current = JSON.stringify(card.retellings); },[card.retellings,dirty,active,transcriptEdit]);

  async function changeHistory(change:(items:MemoryRetelling[]) => MemoryRetelling[], media:RetellingMedia[] = []) {
    let next:MemoryRetelling[] = [];
    const saved = await commit(state => {
      if (!state.cards.some(item => item.id === card.id)) throw new Error('This practice card was removed elsewhere. Your unsaved writing and original recording are still in the form.');
      return { ...state,cards:state.cards.map(item => {
        if (item.id !== card.id) return item;
        if (JSON.stringify(item.retellings) !== baseline.current) throw new Error('Your saved retelling history changed. Reload the workspace, review the history, then use the refreshed history while keeping this draft.');
        next = change(item.retellings);
        return { ...item,retellings:next,updatedAt:new Date().toISOString() };
      }) };
    },media);
    if (saved) baseline.current = JSON.stringify(next);
    return saved;
  }
  async function save(event:FormEvent) {
    event.preventDefault(); setError(''); setNotice('');
    const writing = text.trim();
    if (active || (!writing && !draft) || writing.length > 5000) { setError('Stop recording first, then add writing or a valid original recording. Writing is limited to 5,000 characters.'); return; }
    const id = crypto.randomUUID(); const at = new Date().toISOString();
    const original = draft ? (() => { const { blob,...metadata } = draft; return { recording:{ id,...metadata },blob }; })() : undefined;
    const entry:MemoryRetelling = { id,at,text:writing,...(original ? { recording:original.recording } : {}) };
    if (await changeHistory(items => { if (items.length >= 50) throw new Error('This passage already has 50 saved retellings. Delete one before adding another.'); return [...items,entry]; },original ? [original] : [])) {
      setText(''); setDraft(null); setNotice('Private retelling saved on this device.');
    }
  }
  async function remove(index:number, audioOnly=false) {
    const removesEditedOriginal = !!(transcriptEdit && retellingTranscriptTarget([card.retellings[index]],transcriptEdit));
    if (removesEditedOriginal && transcriptEdit && retellingTranscriptChanged(transcriptEdit) && !window.confirm('Discard this unsaved transcript edit?')) return;
    const saved = await changeHistory(items => items.flatMap((item,i) => {
      if (i !== index) return [item];
      if (audioOnly && item.text.trim()) { const { recording:_recording,...writing } = item; void _recording; return [writing]; }
      return [];
    }));
    if (saved) { if (removesEditedOriginal) setTranscriptEdit(null); setNotice(audioOnly ? 'Original recording deleted. Undo last change can restore it.' : 'Retelling deleted. Undo last change can restore it.'); }
  }
  function editTranscript(item:MemoryRetelling) {
    if (transcriptEdit && retellingTranscriptChanged(transcriptEdit) && !window.confirm('Discard this unsaved transcript edit and edit another retelling?')) return;
    setTranscriptEdit(beginRetellingTranscript(item));
  }
  async function saveTranscript(event:FormEvent) {
    event.preventDefault(); if (!transcriptEdit) return;
    if (await changeHistory(items => applyRetellingTranscript(items,transcriptEdit))) { setTranscriptEdit(null); setNotice('Manual transcript saved. The original recording was not changed.'); }
  }
  return <section aria-labelledby="retelling-heading">
    <h4 id="retelling-heading">Retell in your own words</h4>
    <p className="workspace-help">Read or listen to the exact passage, then explain its meaning in your own words. This is a personal paraphrase exercise, not a verbatim test. Your writing and optional voice recording stay on this device and are never automatically scored or sent to an AI service.</p>
    {source && <details><summary>Review the exact source wording · {source.edition.name}</summary><div className="workspace-source" lang={source.edition.language} dir={source.edition.direction || sourceDirection(source.edition.language)} style={{ fontFamily:sourceFont(source.edition.language) }}>{source.verses.map(v => <p key={v.number}><sup>{v.number}</sup>{v.text}</p>)}</div><p className="workspace-source-credit">{sourceCredit(source.edition)}</p></details>}
    <form onSubmit={save}>
      <div className="button-row"><button type="button" disabled={busy || active} onClick={() => setText(current => appendRetellingPrompts(current))}>Insert optional reflection prompts</button></div>
      <p className="workspace-help">Use any prompts that help; leave out anything that does not fit. They are writing aids, not a checklist or score.</p>
      <label>My retelling<textarea dir="auto" rows={6} maxLength={5000} disabled={busy} value={text} onChange={e => setText(e.target.value)} placeholder="Describe the passage in your own words…" /></label>
      <p className="workspace-help">Up to 5,000 characters. With a recording, this writing is your optional manual transcript. No automatic transcription or source comparison is running.</p>
      <RetellingRecorder disabled={busy || !!draft || !!transcriptEdit} source={sourceBinding} onReady={setDraft} onActiveChange={value => { setActive(value); onRecordingChange(value); }} />
      {preview && <section className="retelling-draft" aria-label="Unsaved recording"><h5>Unsaved original recording</h5><RetellingPlayer recording={preview.recording} original={preview} disabled={active} /><button type="button" disabled={busy} onClick={() => setDraft(null)}>Discard unsaved recording</button></section>}
      <button type="submit" disabled={busy || active || (!text.trim() && !draft)}>Save private retelling</button>
    </form>
    {error && <p role="alert" className="workspace-error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {baseline.current !== JSON.stringify(card.retellings) && <button type="button" disabled={busy || active} onClick={() => { baseline.current = JSON.stringify(card.retellings); refresh(n => n + 1); setNotice('Refreshed history selected. Your current draft has been kept.'); }}>Use refreshed history and keep draft</button>}
    {transcriptEdit && <section className="workspace-history" aria-label="Manual transcript editor">
      <h5>Edit manual transcript</h5>
      <p className="workspace-help">Draft for the original recorded on {new Date(transcriptEdit.at).toLocaleString()}. Your own writing; it has not been transcribed or verified automatically.</p>
      {!transcriptTarget && <p role="alert" className="workspace-error">This original recording was removed or replaced. Your transcript draft is kept below and will not overwrite another retelling.</p>}
      <form onSubmit={saveTranscript}>
        <label>Manual transcript<textarea dir="auto" aria-label="Manual transcript" rows={5} maxLength={5000} disabled={busy} value={transcriptEdit.text} onChange={e => setTranscriptEdit(current => current ? { ...current,text:e.target.value } : null)} /></label>
        <div className="button-row">
          <button type="submit" disabled={busy || active || !transcriptTarget}>Save manual transcript</button>
          {!transcriptTarget && <button type="button" disabled={busy || active || !!text || !!draft} onClick={() => { setText(transcriptEdit.text); setTranscriptEdit(null); setNotice('Transcript moved to a new written retelling draft. Save it to keep it on this device.'); }}>Use transcript as new written retelling</button>}
          <button type="button" disabled={busy} onClick={() => setTranscriptEdit(null)}>Cancel transcript edit</button>
        </div>
        {!transcriptTarget && (!!text || !!draft) && <p className="workspace-help">Save or discard your new retelling draft before moving this transcript into it. You can also copy the transcript from this field.</p>}
      </form>
    </section>}
    {!!card.retellings.length && <details open={open} onToggle={e => setOpen(e.currentTarget.open)}><summary>Saved retellings ({card.retellings.length})</summary>{open && card.retellings.map((item,index) => <article className="workspace-history" key={item.id || `${item.at}-${index}`}>
      <time dateTime={item.at}>{new Date(item.at).toLocaleString()}</time>
      {item.recording && <RetellingPlayer recording={item.recording} disabled={active} />}
      <p className="workspace-writing" dir="auto">{item.text || 'No manual transcript added.'}</p>{item.recording && <button type="button" disabled={busy || active || transcriptTarget?.id === item.id} onClick={() => editTranscript(item)}>Edit manual transcript</button>}
      <div className="button-row">{item.recording && <button type="button" disabled={busy || active} onClick={() => void remove(index,true)}>{item.text.trim() ? 'Delete recording, keep transcript' : 'Delete recording and empty retelling'}</button>}<button type="button" disabled={busy || active} aria-label={`Delete retelling from ${new Date(item.at).toLocaleString()}`} onClick={() => void remove(index)}>Delete retelling</button></div>
    </article>)}{card.retellings.length >= 50 && <p className="workspace-help">This passage has 50 saved retellings. Delete an entry before adding more; older entries are never silently removed.</p>}</details>}
  </section>;
}

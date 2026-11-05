import { useEffect, useRef, useState } from 'react';
import { getBook, getManifest } from '../data';
import { hashSourceText } from '../editorial';
import { checkSpeakerSource, validateSpeakerPayload } from './model';
import type { CorrectionProposal, PublisherSpeech, SpeakerPayload } from './model';

export default function CorrectionForm({ speech, storageBusy, onSave, onClose }: { speech: PublisherSpeech; storageBusy: boolean; onSave: (proposal: CorrectionProposal) => Promise<boolean>; onClose: () => void }) {
  const [speaker, setSpeaker] = useState('Jesus'), [audience, setAudience] = useState(''), [quotedSpeaker, setQuotedSpeaker] = useState(''), [reason, setReason] = useState('');
  const [start, setStart] = useState(speech.start + 1), [end, setEnd] = useState(speech.end), [uncertainty, setUncertainty] = useState<SpeakerPayload['uncertainty']>('disputed'), [kind, setKind] = useState<SpeakerPayload['speechKind']>('direct');
  const [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const guard = useRef({ dirty, busy }), heading = useRef<HTMLHeadingElement>(null), locked = useRef(false);
  guard.current = { dirty, busy: busy || storageBusy };
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    const unload = (event: BeforeUnloadEvent) => { if (guard.current.dirty || guard.current.busy) { event.preventDefault(); event.returnValue = ''; } };
    const navigate = (event: Event) => { if (guard.current.busy || guard.current.dirty && !window.confirm('Leave this unsaved speaker correction? Save it or copy your writing first.')) event.preventDefault(); };
    const update = (event: Event) => { if (guard.current.dirty || guard.current.busy) event.preventDefault(); };
    window.addEventListener('beforeunload', unload); window.addEventListener('adigun:before-navigation', navigate); window.addEventListener('adigun:before-update', update);
    return () => { window.removeEventListener('beforeunload', unload); window.removeEventListener('adigun:before-navigation', navigate); window.removeEventListener('adigun:before-update', update); };
  }, []);
  const points = Array.from(speech.fullVerse), validSpan = Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 1 && end >= start && end <= points.length;
  async function save() {
    if (locked.current || storageBusy) return;
    locked.current = true; setBusy(true); setError('');
    try {
      if (!reason.trim() || reason.trim().length > 6000 || !validSpan) throw new Error('Add your reason and choose a valid character range.');
      const id = `speaker-${crypto.randomUUID()}`;
      const annotation = validateSpeakerPayload({ schemaVersion: 1, id, reference: speech.reference, editionSha256: speech.edition.sha256, sourceTextHash: await hashSourceText(speech.fullVerse), offsetUnit: 'unicode-codepoint', start: start - 1, end, speakerId: speaker.trim(), audience: audience.split(',').map(value => value.trim()).filter(Boolean), ...(quotedSpeaker.trim() ? { quotedSpeakerId: quotedSpeaker.trim() } : {}), speechKind: kind, uncertainty, evidenceIds: [`${speech.edition.id}:${speech.reference.bookId}:${speech.reference.chapter}:${speech.reference.verse}`] });
      const manifest = await getManifest(speech.edition.id), book = await getBook(speech.reference.bookId, speech.edition.id);
      const verse = book.chapters.find(value => value.number === speech.reference.chapter)?.verses.find(value => value.number === speech.reference.verse);
      if (!verse) throw new Error('The original source verse is unavailable. Your draft remains here.');
      await checkSpeakerSource(annotation, manifest.edition, verse.text);
      if (await onSave({ id, annotation, reason: reason.trim(), createdAt: new Date().toISOString(), status: 'draft' })) { guard.current = { dirty: false, busy: false }; setDirty(false); onClose(); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The correction could not be prepared.'); }
    finally { locked.current = false; setBusy(false); }
  }
  return <section className="speaker-correction-form panel" aria-label="Speaker correction proposal">
    <h3 ref={heading} tabIndex={-1}>Suggest a speaker correction</h3><p>{speech.bookName} {speech.reference.chapter}:{speech.reference.verse} · {speech.edition.name}</p><p className="speaker-help">Your proposal is a private draft. It does not alter the publisher’s text or annotations, and it is not a human editorial approval.</p>
    <blockquote lang={speech.edition.language}>{speech.fullVerse}</blockquote>
    <div className="speaker-form-grid"><label>Suggested speaker<input value={speaker} maxLength={120} onChange={event => { setDirty(true); setSpeaker(event.target.value); }}/></label><label>Audience, if known<input value={audience} maxLength={600} placeholder="Separate people or groups with commas" onChange={event => { setDirty(true); setAudience(event.target.value); }}/></label><label>Quoted speaker, if different<input value={quotedSpeaker} maxLength={120} onChange={event => { setDirty(true); setQuotedSpeaker(event.target.value); }}/></label><label>Speech type<select value={kind} onChange={event => { setDirty(true); setKind(event.target.value as SpeakerPayload['speechKind']); }}><option value="direct">Direct speech</option><option value="quotation">Quotation of earlier speech</option><option value="narration">Narration</option><option value="prayer">Prayer</option><option value="song">Song</option></select></label><label>Attribution confidence<select value={uncertainty} onChange={event => { setDirty(true); setUncertainty(event.target.value as SpeakerPayload['uncertainty']); }}><option value="disputed">Disputed</option><option value="unknown">Uncertain</option><option value="asserted">My proposed attribution</option></select></label></div>
    <details><summary>Adjust the marked words</summary><p className="speaker-help">Count characters from 1. The preview shows the proposed exact span; the original verse stays unchanged.</p><div className="speaker-form-grid"><label>Start character<input type="number" min={1} max={points.length} value={start} onChange={event => { setDirty(true); setStart(Number(event.target.value)); }}/></label><label>End character<input type="number" min={start} max={points.length} value={end} onChange={event => { setDirty(true); setEnd(Number(event.target.value)); }}/></label></div><p lang={speech.edition.language}>{validSpan ? points.slice(start - 1, end).join('') : 'Choose a character range inside the source verse.'}</p></details>
    <label>Your reason and supporting evidence<textarea value={reason} maxLength={6000} rows={4} onChange={event => { setDirty(true); setReason(event.target.value); }}/></label>
    <div className="speaker-actions"><button type="button" className="primary" disabled={busy || storageBusy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save private correction'}</button><button type="button" className="secondary" disabled={busy || storageBusy} onClick={() => { if (!dirty || window.confirm('Discard this unsaved speaker correction?')) onClose(); }}>Cancel correction</button></div>
    {error && <p role="alert">{error}</p>}
  </section>;
}

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SpeechCollectionsState } from './collection-model';
import { loadSpeechCollections, saveSpeechCollections } from './collection-storage';

export function useSpeechCollections() {
  const [state, setState] = useState<SpeechCollectionsState | null>(null);
  const [busy, setBusy] = useState(false), [saving, setSaving] = useState(false);
  const [error, setError] = useState(''), [status, setStatus] = useState('Opening private speech collections…');
  const current = useRef<SpeechCollectionsState | null>(null), locked = useRef(false), mounted = useRef(false);
  const reload = useCallback(async () => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError('');
    try {
      const loaded = await loadSpeechCollections(); current.current = loaded;
      if (mounted.current) { setState(loaded); setStatus('Speech collections are saved on this device only.'); }
    } catch (reason) {
      if (mounted.current) { setError(reason instanceof Error ? reason.message : 'Private storage could not be read.'); setStatus('Storage unavailable. Existing collections have not been replaced.'); }
    } finally { locked.current = false; if (mounted.current) setBusy(false); }
  }, []);
  useEffect(() => { mounted.current = true; void reload(); return () => { mounted.current = false; }; }, [reload]);
  const commit = useCallback(async (change: (state: SpeechCollectionsState) => SpeechCollectionsState): Promise<SpeechCollectionsState | null> => {
    if (locked.current || !current.current) return null;
    locked.current = true; setBusy(true); setSaving(true); setError(''); setStatus('Saving private speech collections…');
    try {
      const next = await saveSpeechCollections(change(current.current), current.current.revision); current.current = next;
      if (mounted.current) { setState(next); setStatus('Speech collections are saved on this device only.'); }
      return next;
    } catch (reason) {
      if (mounted.current) { setError(reason instanceof Error ? reason.message : 'The collection was not saved.'); setStatus('Latest change was not saved. Your draft and saved records are retained.'); }
      return null;
    } finally { locked.current = false; if (mounted.current) { setBusy(false); setSaving(false); } }
  }, []);
  return { state, busy, saving, error, status, reload, commit };
}

export function useSpeechCollectionGuard(dirty: boolean, blocked: boolean) {
  const current = useRef({ dirty, blocked }); current.current = { dirty, blocked };
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => { if (current.current.dirty || current.current.blocked) { event.preventDefault(); event.returnValue = ''; } };
    const navigate = (event: Event) => {
      if (current.current.blocked || (current.current.dirty && !window.confirm('Leave this unsaved collection name? Save or download the draft first.'))) event.preventDefault();
    };
    const update = (event: Event) => { if (current.current.dirty || current.current.blocked) event.preventDefault(); };
    window.addEventListener('beforeunload', unload); window.addEventListener('adigun:before-navigation', navigate); window.addEventListener('adigun:before-update', update);
    return () => { window.removeEventListener('beforeunload', unload); window.removeEventListener('adigun:before-navigation', navigate); window.removeEventListener('adigun:before-update', update); };
  }, []);
}

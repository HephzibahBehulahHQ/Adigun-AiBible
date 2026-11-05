import { useCallback, useEffect, useRef, useState } from 'react';
import type { GospelStudyState } from './study-model';
import { loadGospelStudy, saveGospelStudy } from './study-storage';

export function useGospelStudy() {
  const [state, setState] = useState<GospelStudyState | null>(null);
  const [busy, setBusy] = useState(false), [saving, setSaving] = useState(false);
  const [error, setError] = useState(''), [status, setStatus] = useState('Opening private Gospel storage…');
  const current = useRef<GospelStudyState | null>(null), locked = useRef(false), mounted = useRef(false);
  const reload = useCallback(async () => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError('');
    try {
      const loaded = await loadGospelStudy(); current.current = loaded;
      if (mounted.current) { setState(loaded); setStatus('Gospel studies are saved on this device only.'); }
    } catch (reason) {
      if (mounted.current) { setError(reason instanceof Error ? reason.message : 'Gospel storage could not be read.'); setStatus('Storage unavailable. Existing studies have not been replaced.'); }
    } finally { locked.current = false; if (mounted.current) setBusy(false); }
  }, []);
  useEffect(() => { mounted.current = true; void reload(); return () => { mounted.current = false; }; }, [reload]);
  const commit = useCallback(async (change: (state: GospelStudyState) => GospelStudyState): Promise<GospelStudyState | null> => {
    if (locked.current || !current.current) return null;
    locked.current = true; setBusy(true); setSaving(true); setError(''); setStatus('Saving Gospel studies…');
    try {
      const next = await saveGospelStudy(change(current.current), current.current.revision); current.current = next;
      if (mounted.current) { setState(next); setStatus('Gospel studies are saved on this device only.'); }
      return next;
    } catch (reason) {
      if (mounted.current) { setError(reason instanceof Error ? reason.message : 'Gospel changes were not saved.'); setStatus('Latest change was not saved. Keep or download your draft.'); }
      return null;
    } finally { locked.current = false; if (mounted.current) { setBusy(false); setSaving(false); } }
  }, []);
  return { state, busy, saving, error, status, reload, commit };
}

/** A readonly startup may be left; unsaved writing and pending mutations are protected. */
export function useGospelStudyGuard(dirty: boolean, writing: boolean) {
  const current = useRef({ dirty, writing }); current.current = { dirty, writing };
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (current.current.dirty || current.current.writing) { event.preventDefault(); event.returnValue = ''; }
    };
    const navigate = (event: Event) => {
      if (current.current.writing || (current.current.dirty && !window.confirm('Leave Gospel study with unsaved changes? Save or download your draft first.'))) event.preventDefault();
    };
    const update = (event: Event) => { if (current.current.dirty || current.current.writing) event.preventDefault(); };
    window.addEventListener('beforeunload', unload); window.addEventListener('adigun:before-navigation', navigate); window.addEventListener('adigun:before-update', update);
    return () => { window.removeEventListener('beforeunload', unload); window.removeEventListener('adigun:before-navigation', navigate); window.removeEventListener('adigun:before-update', update); };
  }, []);
}

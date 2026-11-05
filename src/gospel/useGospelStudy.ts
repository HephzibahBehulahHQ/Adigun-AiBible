import { useCallback, useEffect, useRef, useState } from 'react';
import type { GospelState } from './model';
import { loadGospel, saveGospel } from './storage';

export function useGospelStudy() {
  const [state, setState] = useState<GospelState | null>(null), [busy, setBusy] = useState(false), [saving, setSaving] = useState(false);
  const [error, setError] = useState(''), [status, setStatus] = useState('Opening private Gospel storage…');
  const current = useRef<GospelState | null>(null), locked = useRef(false), mounted = useRef(false);
  const reload = useCallback(async () => {
    if (locked.current) return; locked.current = true; setBusy(true); setError('');
    try { const loaded = await loadGospel(); current.current = loaded; if (mounted.current) { setState(loaded); setStatus('Gospel rows saved on this device only.'); } }
    catch (reason) { if (mounted.current) { setError(reason instanceof Error ? reason.message : 'Gospel storage could not be read.'); setStatus('Storage unavailable. Existing records have not been replaced.'); } }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  }, []);
  useEffect(() => { mounted.current = true; void reload(); return () => { mounted.current = false; }; }, [reload]);
  const commit = useCallback(async (change: (state: GospelState) => GospelState): Promise<boolean> => {
    if (locked.current || !current.current) return false;
    locked.current = true; setBusy(true); setSaving(true); setError(''); setStatus('Saving Gospel rows…');
    try {
      const next = await saveGospel(change(current.current), current.current.revision); current.current = next;
      if (mounted.current) { setState(next); setStatus('Gospel rows saved on this device only.'); } return true;
    } catch (reason) { if (mounted.current) { setError(reason instanceof Error ? reason.message : 'Gospel changes were not saved.'); setStatus('Latest change was not saved. Keep or export your draft.'); } return false; }
    finally { locked.current = false; if (mounted.current) { setBusy(false); setSaving(false); } }
  }, []);
  return { state, busy, saving, error, status, reload, commit };
}

/** Readonly startup never blocks navigation. Only actual writes, downloads and drafts do. */
export function useGospelGuard(dirty: boolean, writing: boolean) {
  const current = useRef({ dirty, writing }); current.current = { dirty, writing };
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => { if (current.current.dirty || current.current.writing) { event.preventDefault(); event.returnValue = ''; } };
    const navigate = (event: Event) => {
      if (current.current.writing || (current.current.dirty && !window.confirm('Leave Gospel study and discard the unsaved draft? Save or export it first.'))) event.preventDefault();
    };
    const update = (event: Event) => { if (current.current.dirty || current.current.writing) event.preventDefault(); };
    window.addEventListener('beforeunload', unload); window.addEventListener('adigun:before-navigation', navigate); window.addEventListener('adigun:before-update', update);
    return () => { window.removeEventListener('beforeunload', unload); window.removeEventListener('adigun:before-navigation', navigate); window.removeEventListener('adigun:before-update', update); };
  }, []);
}

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MinistryState } from './model';
import { loadMinistry, saveMinistry } from './storage';

export function useMinistry() {
  const [state, setState] = useState<MinistryState | null>(null), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [status, setStatus] = useState('Opening private ministry storage…');
  const current = useRef<MinistryState | null>(null), locked = useRef(false), mounted = useRef(false);
  const reload = useCallback(async () => {
    if (locked.current) return; locked.current = true; setBusy(true); setError('');
    try { const loaded = await loadMinistry(); current.current = loaded; if (mounted.current) { setState(loaded); setStatus('Saved on this device only.'); } }
    catch (reason) { if (mounted.current) { setError(reason instanceof Error ? reason.message : 'Ministry storage could not be read.'); setStatus('Storage unavailable. Existing records have not been replaced.'); } }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  }, []);
  useEffect(() => { mounted.current = true; void reload(); return () => { mounted.current = false; }; }, [reload]);
  const commit = useCallback(async (change: (state: MinistryState) => MinistryState): Promise<boolean> => {
    if (locked.current || !current.current) return false;
    locked.current = true; setBusy(true); setError(''); setStatus('Saving ministry records…');
    try {
      const next = await saveMinistry(change(current.current), current.current.revision); current.current = next;
      if (mounted.current) { setState(next); setStatus('Saved on this device only.'); } return true;
    } catch (reason) { if (mounted.current) { setError(reason instanceof Error ? reason.message : 'Ministry changes were not saved.'); setStatus('Latest change was not saved. Keep or export your draft.'); } return false; }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  }, []);
  return { state, busy, error, status, reload, commit };
}

export function useMinistryGuard(dirty: boolean, busy: boolean) {
  const current = useRef({ dirty, busy }); current.current = { dirty, busy };
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => { if (current.current.dirty || current.current.busy) { event.preventDefault(); event.returnValue = ''; } };
    const navigate = (event: Event) => {
      if (current.current.busy || (current.current.dirty && !window.confirm('Leave ministry preparation and discard the unsaved draft? Save or export the draft first.'))) event.preventDefault();
    };
    const update = (event: Event) => { if (current.current.dirty || current.current.busy) event.preventDefault(); };
    window.addEventListener('beforeunload', unload); window.addEventListener('adigun:before-navigation', navigate); window.addEventListener('adigun:before-update', update);
    return () => { window.removeEventListener('beforeunload', unload); window.removeEventListener('adigun:before-navigation', navigate); window.removeEventListener('adigun:before-update', update); };
  }, []);
}

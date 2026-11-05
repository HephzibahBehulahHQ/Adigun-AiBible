import { useCallback, useEffect, useRef, useState } from 'react';
import type { InterpretationNotebook } from './model';
import { loadInterpretationNotebook, saveInterpretationNotebook } from './storage';

export function useInterpretationNotebook() {
  const [state, setState] = useState<InterpretationNotebook | null>(null), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [status, setStatus] = useState('Opening private interpretation storage…');
  const current = useRef<InterpretationNotebook | null>(null), locked = useRef(false), mounted = useRef(false);
  const reload = useCallback(async () => {
    if (locked.current) return; locked.current = true; setBusy(true); setError('');
    try { const loaded = await loadInterpretationNotebook(); current.current = loaded; if (mounted.current) { setState(loaded); setStatus('Saved on this device only.'); } }
    catch (reason) { if (mounted.current) { setError(reason instanceof Error ? reason.message : 'Interpretation storage could not be read.'); setStatus('Storage unavailable. Existing records have not been replaced.'); } }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  }, []);
  useEffect(() => { mounted.current = true; void reload(); return () => { mounted.current = false; }; }, [reload]);
  const commit = useCallback(async (change: (state: InterpretationNotebook) => InterpretationNotebook): Promise<boolean> => {
    if (locked.current || !current.current) return false;
    locked.current = true; setBusy(true); setError(''); setStatus('Saving interpretation records…');
    try {
      const next = await saveInterpretationNotebook(change(current.current), current.current.revision); current.current = next;
      if (mounted.current) { setState(next); setStatus('Saved on this device only.'); } return true;
    } catch (reason) { if (mounted.current) { setError(reason instanceof Error ? reason.message : 'Interpretation changes were not saved.'); setStatus('Latest change was not saved. Keep or export your draft.'); } return false; }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  }, []);
  return { state, busy, error, status, reload, commit };
}

export function useInterpretationGuard(dirty: boolean, busy: boolean) {
  const current = useRef({ dirty, busy }); current.current = { dirty, busy };
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => { if (current.current.dirty || current.current.busy) { event.preventDefault(); event.returnValue = ''; } };
    const navigate = (event: Event) => {
      if (current.current.busy || (current.current.dirty && !window.confirm('Leave the interpretation notebook and discard the unsaved draft? Save or export the draft first.'))) event.preventDefault();
    };
    const update = (event: Event) => { if (current.current.dirty || current.current.busy) event.preventDefault(); };
    window.addEventListener('beforeunload', unload); window.addEventListener('adigun:before-navigation', navigate); window.addEventListener('adigun:before-update', update);
    return () => { window.removeEventListener('beforeunload', unload); window.removeEventListener('adigun:before-navigation', navigate); window.removeEventListener('adigun:before-update', update); };
  }, []);
}

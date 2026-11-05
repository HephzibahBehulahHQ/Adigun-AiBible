import { useCallback, useEffect, useRef, useState } from 'react';
import type { HistoricalStudy } from './model';
import { loadHistoricalStudy, saveHistoricalStudy } from './storage';

export function useHistoricalStudy() {
  const [state, setState] = useState<HistoricalStudy | null>(null), [busy, setBusy] = useState(false), [saving, setSaving] = useState(false);
  const [error, setError] = useState(''), [status, setStatus] = useState('Opening private historical storage…');
  const current = useRef<HistoricalStudy | null>(null), locked = useRef(false), mounted = useRef(false);
  const reload = useCallback(async () => {
    if (locked.current) return; locked.current = true; setBusy(true); setError('');
    try { const loaded = await loadHistoricalStudy(); current.current = loaded; if (mounted.current) { setState(loaded); setStatus('Saved on this device only.'); } }
    catch (reason) { if (mounted.current) { setError(reason instanceof Error ? reason.message : 'Historical storage could not be read.'); setStatus('Storage unavailable. Existing records have not been replaced.'); } }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  }, []);
  useEffect(() => { mounted.current = true; void reload(); return () => { mounted.current = false; }; }, [reload]);
  const commit = useCallback(async (change: (state: HistoricalStudy) => HistoricalStudy): Promise<boolean> => {
    if (locked.current || !current.current) return false;
    locked.current = true; setBusy(true); setSaving(true); setError(''); setStatus('Saving historical records…');
    try {
      const next = await saveHistoricalStudy(change(current.current), current.current.revision); current.current = next;
      if (mounted.current) { setState(next); setStatus('Saved on this device only.'); } return true;
    } catch (reason) { if (mounted.current) { setError(reason instanceof Error ? reason.message : 'Historical changes were not saved.'); setStatus('Latest change was not saved. Keep or export your draft.'); } return false; }
    finally { locked.current = false; if (mounted.current) { setBusy(false); setSaving(false); } }
  }, []);
  return { state, busy, saving, error, status, reload, commit };
}

export function useHistoricalGuard(dirty: boolean, busy: boolean) {
  const current = useRef({ dirty, busy }); current.current = { dirty, busy };
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => { if (current.current.dirty || current.current.busy) { event.preventDefault(); event.returnValue = ''; } };
    const navigate = (event: Event) => {
      if (current.current.busy || (current.current.dirty && !window.confirm('Leave the historical notebook and discard the unsaved draft? Save or export the draft first.'))) event.preventDefault();
    };
    const update = (event: Event) => { if (current.current.dirty || current.current.busy) event.preventDefault(); };
    window.addEventListener('beforeunload', unload); window.addEventListener('adigun:before-navigation', navigate); window.addEventListener('adigun:before-update', update);
    return () => { window.removeEventListener('beforeunload', unload); window.removeEventListener('adigun:before-navigation', navigate); window.removeEventListener('adigun:before-update', update); };
  }, []);
}

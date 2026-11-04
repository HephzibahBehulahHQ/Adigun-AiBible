import { useCallback, useEffect, useRef, useState } from 'react';
import { loadFamilyArchive, saveFamilyArchive } from './storage';
import type { FamilyState } from './model';

export function useFamilyArchive() {
  const [state, setState] = useState<FamilyState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Opening the archive on this device…');
  const current = useRef<FamilyState | null>(null);
  const locked = useRef(false);
  const mounted = useRef(false);

  const reload = useCallback(async () => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError('');
    setStatus('Reading saved items and checking original files…');
    try {
      const loaded = await loadFamilyArchive();
      current.current = loaded;
      if (mounted.current) { setState(loaded); setStatus('Saved items are stored on this device only.'); }
    } catch (e) {
      if (mounted.current) { setError(e instanceof Error ? e.message : 'Could not read this archive.'); setStatus('Archive storage could not be read. Existing data was not replaced.'); }
    } finally { locked.current = false; if (mounted.current) setBusy(false); }
  }, []);

  useEffect(() => { mounted.current = true; void reload(); return () => { mounted.current = false; }; }, [reload]);

  const commit = useCallback(async (change: (previous: FamilyState) => FamilyState): Promise<boolean> => {
    if (locked.current || !current.current) return false;
    locked.current = true; setBusy(true); setError(''); setStatus('Checking originals and saving to this device…');
    try {
      const next = await saveFamilyArchive(change(current.current), current.current.revision);
      current.current = next;
      if (mounted.current) { setState(next); setStatus('Family archive saved on this device.'); }
      return true;
    } catch (e) {
      if (mounted.current) { setError(e instanceof Error ? e.message : 'The archive was not saved.'); setStatus('Latest change was not saved. Your form is still available.'); }
      return false;
    } finally { locked.current = false; if (mounted.current) setBusy(false); }
  }, []);

  return { state, busy, error, status, reload, commit };
}

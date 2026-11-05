import { useCallback, useEffect, useRef, useState } from 'react';
import { loadCorrections, saveCorrections } from './storage';
import type { SpeakerCorrections } from './model';

export function useCorrections() {
  const [state, setState] = useState<SpeakerCorrections | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState('Opening private device storage…');
  const current = useRef<SpeakerCorrections | null>(null), lock = useRef(false), mounted = useRef(false);
  const reload = useCallback(async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { const next = await loadCorrections(); current.current = next; if (mounted.current) { setState(next); setStatus('Proposals stay on this device. Nothing is sent to an editor automatically.'); } }
    catch (cause) { if (mounted.current) { setError(cause instanceof Error ? cause.message : 'Private storage could not be opened.'); setStatus('Storage unavailable.'); } }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }, []);
  useEffect(() => { mounted.current = true; void reload(); return () => { mounted.current = false; }; }, [reload]);
  const commit = useCallback(async (change: (previous: SpeakerCorrections) => SpeakerCorrections) => {
    if (lock.current || !current.current) return false;
    lock.current = true; setBusy(true); setError('');
    try { const previous = current.current, next = await saveCorrections(change(previous), previous.revision); current.current = next; if (mounted.current) { setState(next); setStatus('Saved on this device only. This proposal has no human approval.'); } return true; }
    catch (cause) { if (mounted.current) { setError(cause instanceof Error ? cause.message : 'The correction was not saved.'); setStatus('Latest change was not saved. Your draft is retained.'); } return false; }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }, []);
  return { state, busy, error, status, reload, commit };
}

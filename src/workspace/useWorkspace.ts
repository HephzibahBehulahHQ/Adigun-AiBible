import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorkspaceState } from './model';
import { loadWorkspace, saveWorkspace } from './storage';
export type WorkspaceChange = (change: (state: WorkspaceState) => WorkspaceState) => Promise<boolean>;
export function useWorkspace() {
  const [state, setState] = useState<WorkspaceState | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [status, setStatus] = useState('Opening private device storage…');
  const [canUndo, setCanUndo] = useState(false); const current = useRef<WorkspaceState | null>(null); const undo = useRef<WorkspaceState | null>(null); const locked = useRef(false); const mounted = useRef(false);
  const reload = useCallback(async () => {
    if (locked.current) return; locked.current = true; setBusy(true); setError(''); setStatus('Reading private device storage…');
    try { const loaded = await loadWorkspace(); current.current = loaded; undo.current = null; if (mounted.current) { setState(loaded); setCanUndo(false); setStatus('Saved on this device only.'); } }
    catch (e) { if (mounted.current) { setError(e instanceof Error ? e.message : 'Could not read device storage.'); setStatus('Storage unavailable.'); } }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  }, []);
  useEffect(() => { mounted.current = true; void reload(); return () => { mounted.current = false; }; }, [reload]);
  const commit = useCallback(async (change: (state: WorkspaceState) => WorkspaceState, remember = true) => {
    if (locked.current || !current.current) return false;
    locked.current = true; setBusy(true); setError(''); setStatus('Saving to this device…'); const previous = current.current;
    try { const next = await saveWorkspace(change(previous), previous.revision); current.current = next; if (remember) undo.current = previous; else undo.current = null; if (mounted.current) { setState(next); setCanUndo(!!undo.current); setStatus('Saved on this device only.'); } return true; }
    catch (e) { if (mounted.current) { setError(e instanceof Error ? e.message : 'Saving failed.'); setStatus('Latest change was not saved. Your form is still available.'); } return false; }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  }, []);
  const undoLast = useCallback(async () => { const previous = undo.current; if (previous) await commit(currentState => ({ ...previous, revision: currentState.revision }), false); }, [commit]);
  return { state, busy, error, status, canUndo, reload, commit, undoLast };
}

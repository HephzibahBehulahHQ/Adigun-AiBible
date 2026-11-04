import { useEffect, useRef } from 'react';

/** The app dispatches these cancelable events before routing or activating an update. */
export function useFamilyGuard(dirty: boolean, busy: boolean, recording: boolean) {
  const current = useRef({ dirty, busy, recording });
  current.current = { dirty, busy, recording };
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      const state = current.current;
      if (state.dirty || state.busy || state.recording) { event.preventDefault(); event.returnValue = ''; }
    };
    const navigate = (event: Event) => {
      const state = current.current;
      if (state.busy) { event.preventDefault(); return; }
      if ((state.dirty || state.recording) && !window.confirm('Leave the family archive and discard the unsaved form or current recording? Save the item or download its original first.')) event.preventDefault();
    };
    const update = (event: Event) => { const state = current.current; if (state.dirty || state.busy || state.recording) event.preventDefault(); };
    window.addEventListener('beforeunload', unload);
    window.addEventListener('adigun:before-navigation', navigate);
    window.addEventListener('adigun:before-update', update);
    return () => {
      window.removeEventListener('beforeunload', unload);
      window.removeEventListener('adigun:before-navigation', navigate);
      window.removeEventListener('adigun:before-update', update);
    };
  }, []);
}

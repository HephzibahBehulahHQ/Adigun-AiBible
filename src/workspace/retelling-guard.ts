import { useEffect, useRef } from 'react';

export function requestRetellingNavigation() { return window.dispatchEvent(new Event('adigun:retelling-navigation',{ cancelable:true })); }
export function useRetellingGuard(dirty:boolean, recording:boolean, saving:boolean) {
  const current = useRef({ dirty,recording,saving }); current.current = { dirty,recording,saving };
  useEffect(() => {
    const unload = (event:BeforeUnloadEvent) => { const s = current.current; if (s.dirty || s.recording || s.saving) { event.preventDefault(); event.returnValue = ''; } };
    const navigate = (event:Event) => {
      const s = current.current;
      if (s.saving) event.preventDefault();
      else if ((s.dirty || s.recording) && !window.confirm('Leave this practice view? Unsaved writing or recording may be discarded. Save or download the original first if you want to keep it.')) event.preventDefault();
    };
    const update = (event:Event) => { const s = current.current; if (s.dirty || s.recording || s.saving) event.preventDefault(); };
    window.addEventListener('beforeunload',unload);
    window.addEventListener('adigun:before-navigation',navigate);
    window.addEventListener('adigun:retelling-navigation',navigate);
    window.addEventListener('adigun:before-update',update);
    return () => { window.removeEventListener('beforeunload',unload); window.removeEventListener('adigun:before-navigation',navigate); window.removeEventListener('adigun:retelling-navigation',navigate); window.removeEventListener('adigun:before-update',update); };
  },[]);
}

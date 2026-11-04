import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { assetUrl } from './data';

export default function OfflineUpdate({ saveBeforeUpdate }: { saveBeforeUpdate: () => Promise<void> }) {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    let mounted = true;
    navigator.serviceWorker.register(assetUrl('sw.js'), { scope: assetUrl('') }).then(registration => {
      if (!mounted) return;
      if (registration.waiting) setWaiting(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const next = registration.installing;
        next?.addEventListener('statechange', () => {
          if (mounted && next.state === 'installed' && navigator.serviceWorker.controller) setWaiting(registration.waiting);
        });
      });
    }).catch(() => { if (mounted) setMessage('Offline app installation failed. Reading online still works; reconnect and reload to retry.'); });
    return () => { mounted = false; };
  }, []);
  async function activate() {
    if (!waiting) return;
    if (!window.dispatchEvent(new Event('adigun:before-update', { cancelable: true }))) {
      setMessage('Save or finish the open study tool before updating. Your work remains open.');
      return;
    }
    setBusy(true);
    try {
      await saveBeforeUpdate();
      if (!window.dispatchEvent(new Event('adigun:before-update', { cancelable: true }))) throw new Error('Save or finish the open study tool before updating.');
      navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
      waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
      setMessage('Your study is saved. Activating the update…');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Save failed. Export your study before updating.');
      setBusy(false);
    }
  }
  if (!waiting && !message) return null;
  return <aside className="update-notice" role="status"><RefreshCw size={17}/><span>{message || 'A new version is ready. Your study will be saved before reloading.'}</span>{waiting && <button className="secondary" disabled={busy} onClick={activate}>{busy ? 'Saving…' : 'Save and update'}</button>}</aside>;
}

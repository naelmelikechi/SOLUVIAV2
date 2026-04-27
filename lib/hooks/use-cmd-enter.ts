import { useEffect } from 'react';

/**
 * Listens for Cmd+Enter (Mac) / Ctrl+Enter (Windows/Linux) and calls handler.
 * Mount only when the form/dialog is active (typically guarded by `enabled` prop).
 */
export function useCmdEnter(handler: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handler();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [handler, enabled]);
}

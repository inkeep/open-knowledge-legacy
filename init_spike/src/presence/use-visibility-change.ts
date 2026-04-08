import { useEffect } from 'react';

/**
 * Hook wrapping document.addEventListener('visibilitychange') with cleanup.
 * Calls the callback whenever the page visibility state changes.
 */
export function useVisibilityChange(callback: (state: DocumentVisibilityState) => void): void {
  useEffect(() => {
    const handler = () => {
      callback(document.visibilityState);
    };
    document.addEventListener('visibilitychange', handler);
    return () => {
      document.removeEventListener('visibilitychange', handler);
    };
  }, [callback]);
}

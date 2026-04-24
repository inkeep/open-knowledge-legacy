import type { HocuspocusProvider } from '@hocuspocus/provider';
import { useEffect, useRef, useState } from 'react';
import { computeBodyStats, type DocumentStats, EMPTY_STATS } from '@/lib/document-stats';

/**
 * Debounce window for recomputing stats. Observers fire on every Y.Text
 * transaction (local AND remote), so bounded rate is load-bearing during
 * agent writes / multi-client typing.
 */
const STATS_DEBOUNCE_MS = 300;

function scheduleIdle(fn: () => void): () => void {
  const ric = (
    globalThis as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    }
  ).requestIdleCallback;
  const cic = (globalThis as { cancelIdleCallback?: (handle: number) => void }).cancelIdleCallback;
  if (ric && cic) {
    const handle = ric(fn, { timeout: 1000 });
    return () => cic(handle);
  }
  const handle = setTimeout(fn, 0);
  return () => clearTimeout(handle);
}

export function useDocumentStats(
  provider: HocuspocusProvider | null,
  activeDocName: string | null,
): DocumentStats {
  const [stats, setStats] = useState<DocumentStats>(EMPTY_STATS);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleCancelRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!provider || !activeDocName) {
      setStats(EMPTY_STATS);
      return;
    }

    const ytext = provider.document.getText('source');
    let cancelled = false;

    function compute() {
      idleCancelRef.current?.();
      idleCancelRef.current = scheduleIdle(() => {
        if (cancelled) return;
        setStats(computeBodyStats(ytext.toString()));
      });
    }

    compute();

    function handler() {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(compute, STATS_DEBOUNCE_MS);
    }

    ytext.observe(handler);

    return () => {
      cancelled = true;
      ytext.unobserve(handler);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      idleCancelRef.current?.();
      idleCancelRef.current = null;
    };
  }, [provider, activeDocName]);

  return stats;
}

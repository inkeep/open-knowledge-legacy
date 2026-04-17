import type { HocuspocusProvider } from '@hocuspocus/provider';
import { useEffect, useRef, useState } from 'react';
import {
  computeBodyStats,
  type DocumentStats,
  EMPTY_STATS,
  TOKEN_SIZE_LIMIT,
} from '@/lib/document-stats';
import { tokenEncode } from '@/lib/tiktoken-lazy';

/**
 * Debounce window for recomputing stats. Observers fire on every Y.Text
 * transaction (local AND remote — precedent §"transaction.local semantics"),
 * so bounded rate is load-bearing during agent writes / multi-client typing.
 *
 * Body stats are cheap and computed every tick; token encoding is expensive
 * and additionally size-gated + deferred via idle callback. The hook does not
 * block the editor on token work — the UI renders "—" for tokens until the
 * idle pass lands.
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
  const encodeSeqRef = useRef(0);

  useEffect(() => {
    if (!provider || !activeDocName) {
      setStats(EMPTY_STATS);
      return;
    }

    const ytext = provider.document.getText('source');
    let cancelled = false;

    function compute() {
      if (cancelled) return;
      const fullText = ytext.toString();
      const body = computeBodyStats(fullText);

      // Commit cheap body stats immediately so the UI reflects every edit.
      // Tokens start as null (shown as "—") and resolve after the idle pass.
      setStats({ ...body, tokens: null });

      // Size gate: skip token work on large docs to keep the main thread free.
      if (fullText.length > TOKEN_SIZE_LIMIT) return;

      // Cancel any in-flight idle pass — only the latest input matters.
      idleCancelRef.current?.();
      const seq = ++encodeSeqRef.current;
      idleCancelRef.current = scheduleIdle(async () => {
        try {
          const ids = await tokenEncode(fullText);
          if (cancelled || seq !== encodeSeqRef.current) return;
          setStats((prev) => ({ ...prev, tokens: ids.length }));
        } catch {
          if (cancelled || seq !== encodeSeqRef.current) return;
          setStats((prev) => ({ ...prev, tokens: null }));
        }
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

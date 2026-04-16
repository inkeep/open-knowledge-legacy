/**
 * React hook that resolves the collab WebSocket URL from `ok ui`'s
 * `/api/config` endpoint.
 *
 * Resolution flow (US-014 / FR-1.13):
 *   1. Fetch `/api/config` on mount.
 *   2. If `collabUrl` is a string: resolved → return it.
 *   3. If `collabUrl` is null: server.lock is absent/stale → retry with
 *      bounded exponential backoff (2s → 4s → 8s → 15s cap) until resolved.
 *   4. If the fetch itself 404s or network-errors: fall back to the
 *      same-origin WebSocket URL so `bun run dev` (Vite + Hocuspocus on one
 *      port) keeps working without plugin changes.
 *
 * While unresolved, consumers should render a "Connecting — waiting for
 * collab server" banner (AC of US-014).
 */
import { useEffect, useRef, useState } from 'react';
import { fetchApiConfig } from '@/lib/api-config';
import { defaultCollabWsUrl } from '@/lib/cc1';

const INITIAL_DELAY_MS = 2_000;
const MAX_DELAY_MS = 15_000;

export interface UseCollabUrlState {
  collabUrl: string | null;
  attempts: number;
}

export function useCollabUrl(): UseCollabUrlState {
  const [state, setState] = useState<UseCollabUrlState>({
    collabUrl: null,
    attempts: 0,
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    let delay = INITIAL_DELAY_MS;
    let attempt = 0;
    let cancelled = false;

    const schedule = (fn: () => void, ms: number): void => {
      if (cancelled) return;
      timerRef.current = setTimeout(fn, ms);
    };

    const tick = async (): Promise<void> => {
      attempt += 1;
      let resolved: string | null = null;
      try {
        const cfg = await fetchApiConfig(ac.signal);
        if (cfg === null) {
          // 404 → bun run dev (no /api/config endpoint) → same-origin fallback.
          resolved = defaultCollabWsUrl();
        } else if (cfg.collabUrl !== null) {
          resolved = cfg.collabUrl;
        }
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return;
        // Network error — banner + retry.
      }

      if (cancelled) return;
      setState({ collabUrl: resolved, attempts: attempt });

      if (resolved === null) {
        schedule(() => {
          void tick();
        }, delay);
        delay = Math.min(delay * 2, MAX_DELAY_MS);
      }
    };

    void tick();

    return () => {
      cancelled = true;
      ac.abort();
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return state;
}

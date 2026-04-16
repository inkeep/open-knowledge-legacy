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
    // One-shot breadcrumb for the common boot race — fire once per mount so
    // the console doesn't fill up during a legitimately long `ok start` boot.
    let nullCollabLogged = false;

    const schedule = (fn: () => void, ms: number): void => {
      if (cancelled) return;
      timerRef.current = setTimeout(fn, ms);
    };

    const tick = async (): Promise<void> => {
      attempt += 1;
      let resolved: string | null = null;
      try {
        const result = await fetchApiConfig(ac.signal);
        if (result.status === 'absent') {
          // 404/501 → bun run dev (no /api/config endpoint) → same-origin fallback.
          resolved = defaultCollabWsUrl();
        } else if (result.status === 'ok' && result.config.collabUrl !== null) {
          resolved = result.config.collabUrl;
        } else if (result.status === 'ok') {
          // `ok ui` responded but `server.lock` has no port yet — the common
          // boot race when `ok mcp` spawns `ok start` + `ok ui` back-to-back.
          // Log once so operators know why the banner is up; keep retrying.
          if (!nullCollabLogged) {
            nullCollabLogged = true;
            console.info('[collab-url] ok ui responded but server.lock has no port yet — retrying');
          }
        } else if (result.status === 'error') {
          // 5xx, network error, or malformed body — distinct from 404. Keep the
          // banner visible; surface a console breadcrumb so operators can
          // diagnose a misconfigured `ok ui` without it masquerading as dev mode.
          console.warn(`[collab-url] /api/config error (${result.code}) — retrying in ${delay}ms`);
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

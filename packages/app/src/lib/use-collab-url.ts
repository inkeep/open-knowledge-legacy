/**
 * React hook that resolves the collab WebSocket URL from `ok ui`'s
 * `/api/config` endpoint.
 *
 * Resolution flow (US-014 / FR-1.13):
 *   1. Fetch `/api/config` on mount.
 *   2. If `collabUrl` is a string: resolved → return it.
 *   3. If `collabUrl` is null: server.lock is absent/stale → retry with
 *      bounded exponential backoff (2s → 4s → 8s → 15s cap).
 *   4. If the fetch itself 404s or network-errors: fall back to the
 *      same-origin WebSocket URL so `bun run dev` (Vite + Hocuspocus on one
 *      port) keeps working without plugin changes.
 *   5. After `TERMINAL_AFTER_MS` elapsed wall-clock with no resolution, the
 *      hook transitions to a `terminal` state: automatic retries stop, the
 *      consumer banner surfaces an actionable error + manual-retry button.
 *      A terminal retry resets the wall-clock and delay back to start.
 *
 * The terminal state exists because a silent-forever banner is itself a
 * form of ceremony — users hit-refresh, kill the tab, or file issues. The
 * zero-ceremony promise assumes silent recovery, but bounded recovery with
 * a diagnostic surface is the correct fallback for a permanently-broken
 * configuration (misconfigured proxy, crashed-and-unrespawned `ok start`).
 */
import { useEffect, useRef, useState } from 'react';
import { fetchApiConfig } from '@/lib/api-config';
import { defaultCollabWsUrl } from '@/lib/cc1';

const INITIAL_DELAY_MS = 2_000;
const MAX_DELAY_MS = 15_000;
/** Transition to terminal after this wall-clock elapses without resolution. */
export const TERMINAL_AFTER_MS = 30_000;

export type CollabUrlError =
  | { kind: 'error'; code: number | 'network' | 'invalid-body' }
  | { kind: 'null-collab' };

export interface UseCollabUrlState {
  collabUrl: string | null;
  attempts: number;
  /** When true, automatic retries have stopped — consumer should render the
   * terminal banner with a manual-retry affordance. */
  terminal: boolean;
  /** Last observed failure shape (when terminal). null during healthy retry. */
  lastError: CollabUrlError | null;
  /** Call to reset backoff + wall-clock and resume polling (exits terminal). */
  retry: () => void;
}

interface LoopState {
  token: number;
}

export function useCollabUrl(): UseCollabUrlState {
  const [state, setState] = useState<
    Pick<UseCollabUrlState, 'collabUrl' | 'attempts' | 'terminal' | 'lastError'>
  >({
    collabUrl: null,
    attempts: 0,
    terminal: false,
    lastError: null,
  });
  // Bump on manual retry to invalidate any in-flight loop state. Stored in a
  // ref because we don't want a bump to trigger a re-render on its own — the
  // effect reacts via a separate `retrySignal` state.
  const retryTokenRef = useRef<LoopState>({ token: 0 });
  const [retrySignal, setRetrySignal] = useState(0);

  useEffect(() => {
    // `retrySignal` in the dep array is intentional — bumping it via `retry()`
    // re-runs the loop with a fresh wall-clock window. The variable is
    // referenced here so the dependency is observed by the linter.
    void retrySignal;
    const token = ++retryTokenRef.current.token;
    const ac = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let delay = INITIAL_DELAY_MS;
    let attempt = 0;
    let cancelled = false;
    let nullCollabLogged = false;
    let lastError: CollabUrlError | null = null;
    const startedAt = Date.now();

    const tick = async (): Promise<void> => {
      attempt += 1;
      let resolved: string | null = null;
      try {
        const result = await fetchApiConfig(ac.signal);
        if (result.status === 'absent') {
          resolved = defaultCollabWsUrl();
          lastError = null;
        } else if (result.status === 'ok' && result.config.collabUrl !== null) {
          resolved = result.config.collabUrl;
          lastError = null;
        } else if (result.status === 'ok') {
          if (!nullCollabLogged) {
            nullCollabLogged = true;
            console.info('[collab-url] ok ui responded but server.lock has no port yet — retrying');
          }
          lastError = { kind: 'null-collab' };
        } else if (result.status === 'error') {
          console.warn(`[collab-url] /api/config error (${result.code}) — retrying in ${delay}ms`);
          lastError = { kind: 'error', code: result.code };
        }
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return;
        lastError = { kind: 'error', code: 'network' };
      }

      if (cancelled || token !== retryTokenRef.current.token) return;

      if (resolved !== null) {
        setState({ collabUrl: resolved, attempts: attempt, terminal: false, lastError: null });
        return;
      }

      const elapsed = Date.now() - startedAt;
      if (elapsed >= TERMINAL_AFTER_MS) {
        // Transition to terminal — stop automatic retries. `retry()` bumps
        // `retrySignal`, which re-runs this effect with a fresh wall-clock.
        setState({ collabUrl: null, attempts: attempt, terminal: true, lastError });
        return;
      }

      setState({ collabUrl: null, attempts: attempt, terminal: false, lastError });
      timer = setTimeout(() => {
        void tick();
      }, delay);
      delay = Math.min(delay * 2, MAX_DELAY_MS);
    };

    void tick();

    return () => {
      cancelled = true;
      ac.abort();
      if (timer !== null) {
        clearTimeout(timer);
      }
    };
  }, [retrySignal]);

  // The returned `retry` doesn't need memoization — React Compiler handles it.
  // Bumping `retrySignal` causes the useEffect above to tear down the old loop
  // and spin up a new one with a fresh wall-clock window.
  const retry = () => {
    retryTokenRef.current.token += 1;
    setState((prev) => ({ ...prev, terminal: false, lastError: null }));
    setRetrySignal((v) => v + 1);
  };

  return { ...state, retry };
}

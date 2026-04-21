/**
 * "Connecting — waiting for collab server" banner (US-014 / FR-1.13).
 *
 * Three modes (see `computeBannerMode`):
 *   (1) **Hidden** — either `collabUrl` resolved, or we're still inside the
 *       grace window on a fresh mount. The grace window prevents a banner
 *       flash on healthy page loads: in `bun run dev` mode `/api/config`
 *       returns 404 and falls back to same-origin in ~50ms — showing
 *       "Connecting…" for 50ms is pure noise.
 *   (2) **Retrying** — `useCollabUrl()` has not yet resolved after the grace
 *       period; the hook is polling `/api/config` with bounded exponential
 *       backoff. Amber banner.
 *   (3) **Terminal** — the hook gave up after ~30s of continuous failure.
 *       Red banner with (a) the underlying error classification and
 *       (b) a manual "Retry" button that resets the backoff window. Shown
 *       immediately regardless of grace — the user has already waited 30s.
 *
 * A silent-forever banner is itself a form of ceremony — users hit-refresh
 * or kill the tab. The terminal state surfaces an actionable diagnostic
 * (pointer at `ok status` / `last-spawn-error.log`) so the user can fix
 * the misconfig rather than guess at it.
 */
import { useEffect, useState } from 'react';
import { useDocumentContext } from '@/editor/DocumentContext';

/**
 * Grace-period length before the amber retrying banner surfaces. 500 ms
 * covers the normal fetch-resolution window (same-origin localhost typically
 * resolves in <100 ms) and matches the common Suspense-fallback debounce
 * guidance — long enough to hide fast resolutions, short enough that a
 * genuinely slow boot is flagged before the user loses attention. Terminal
 * state ignores this; retry-after-terminal re-enters the grace window so a
 * fast successful retry stays silent.
 */
const GRACE_PERIOD_MS = 500;

export type BannerMode = 'hidden' | 'retrying' | 'terminal';

/**
 * Pure decision: what should the banner show right now? Exported for unit
 * tests so the branching logic is verifiable without a DOM — the React
 * wrapper below adds state + effect for the grace timer only.
 */
export function computeBannerMode(
  collabUrl: string | null,
  collabTerminal: boolean,
  graceElapsed: boolean,
): BannerMode {
  if (collabTerminal) return 'terminal';
  if (collabUrl !== null) return 'hidden';
  return graceElapsed ? 'retrying' : 'hidden';
}

function describeError(
  err:
    | { kind: 'error'; code: number | 'network' | 'invalid-body' }
    | { kind: 'null-collab' }
    | null,
): string {
  if (err === null) return 'no response';
  if (err.kind === 'null-collab') return 'ok ui responded but server.lock has no port yet';
  if (err.code === 'network') return 'network error (is `ok ui` running?)';
  if (err.code === 'invalid-body') return '/api/config returned a malformed body';
  return `/api/config returned HTTP ${err.code}`;
}

export function ConnectingBanner() {
  const { collabUrl, collabTerminal, collabLastError, retryCollab } = useDocumentContext();
  const [graceElapsed, setGraceElapsed] = useState(false);

  useEffect(() => {
    // Resolved or terminal → no grace timer needed. Reset the flag so a
    // future retry-after-terminal re-enters the grace window and hides the
    // banner again if the retry resolves quickly.
    if (collabUrl !== null || collabTerminal) {
      setGraceElapsed(false);
      return;
    }
    const timer = setTimeout(() => setGraceElapsed(true), GRACE_PERIOD_MS);
    return () => clearTimeout(timer);
  }, [collabUrl, collabTerminal]);

  const mode = computeBannerMode(collabUrl, collabTerminal, graceElapsed);

  if (mode === 'hidden') return null;

  if (mode === 'terminal') {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="fixed top-0 inset-x-0 z-50 bg-red-500/95 text-red-950 text-sm text-center py-2 px-4 shadow-md flex items-center justify-center gap-3 flex-wrap"
      >
        <span>
          Couldn't reach collab server — {describeError(collabLastError)}. Try{' '}
          <code className="bg-red-100/60 px-1 rounded">ok status</code> or check{' '}
          <code className="bg-red-100/60 px-1 rounded">.open-knowledge/last-spawn-error.log</code>.
        </span>
        <button
          type="button"
          onClick={retryCollab}
          className="bg-red-950 text-red-50 px-2 py-0.5 rounded text-xs font-medium hover:bg-red-900"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 inset-x-0 z-50 bg-amber-500/95 text-amber-950 text-sm text-center py-2 px-4 shadow-md"
    >
      Connecting — waiting for collab server…
    </div>
  );
}

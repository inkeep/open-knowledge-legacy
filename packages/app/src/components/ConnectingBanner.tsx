/**
 * "Connecting — waiting for collab server" banner (US-014 / FR-1.13).
 *
 * Two modes:
 *   (1) **Retrying** — `useCollabUrl()` has not yet resolved; the hook is
 *       polling `/api/config` with bounded exponential backoff. Amber banner.
 *   (2) **Terminal** — the hook gave up after ~30s of continuous failure.
 *       Red banner with (a) the underlying error classification and
 *       (b) a manual "Retry" button that resets the backoff window.
 *
 * A silent-forever banner is itself a form of ceremony — users hit-refresh
 * or kill the tab. The terminal state surfaces an actionable diagnostic
 * (pointer at `ok status` / `last-spawn-error.log`) so the user can fix
 * the misconfig rather than guess at it.
 */
import { useDocumentContext } from '@/editor/DocumentContext';

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
  if (collabUrl !== null) return null;

  if (collabTerminal) {
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

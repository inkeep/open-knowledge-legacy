// biome-ignore-all lint/plugin/no-raw-html-interactive-element: pre-rule backlog — file uses raw <button>/<input>/<textarea> awaiting shadcn migration; tracked at https://github.com/inkeep/open-knowledge-legacy/blob/main/biome-plugins/README.md#no-raw-html-interactive-elementgrit
import { useEffect, useState } from 'react';
import { useDocumentContext } from '@/editor/DocumentContext';

const GRACE_PERIOD_MS = 500;

type BannerMode = 'hidden' | 'retrying' | 'terminal';

export function computeBannerMode(
  collabUrl: string | null,
  collabTerminal: boolean,
  graceElapsed: boolean,
): BannerMode {
  if (collabTerminal) return 'terminal';
  if (collabUrl !== null) return 'hidden';
  return graceElapsed ? 'retrying' : 'hidden';
}

export function describeError(
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
        className="fixed top-0 inset-x-0 z-50 bg-red-500/95 text-red-950 text-sm text-center py-2 px-4 pl-[var(--ok-titlebar-reserve-left,1rem)] shadow-md flex items-center justify-center gap-3 flex-wrap"
      >
        <span>
          Couldn't reach collab server — {describeError(collabLastError)}. Try{' '}
          <code className="bg-red-100/60 px-1 rounded">ok status</code> or check{' '}
          <code className="bg-red-100/60 px-1 rounded">.ok/local/last-spawn-error.log</code>.
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
      className="fixed top-0 inset-x-0 z-50 bg-amber-500/95 text-amber-950 text-sm text-center py-2 px-4 pl-[var(--ok-titlebar-reserve-left,1rem)] shadow-md"
    >
      Connecting — waiting for collab server
    </div>
  );
}

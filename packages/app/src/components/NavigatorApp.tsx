/**
 * Project Navigator — persistent-launcher UI shown when the desktop app
 * boots without a `lastOpenedProject`, OR when the user holds Option at
 * launch (D24 revised).
 *
 * Per spec §8.6 (D24 revised): three primary cards (Clone from GitHub,
 * Open folder on disk, Start fresh) above a Recent list. Every project
 * pick spawns a NEW editor window via `ok:project:open` IPC (D3 revised
 * — no switch-in-place in v0). Navigator window stays open.
 *
 * Web / CLI distribution never reaches this component — it only renders
 * when `window.okDesktop?.config.mode === 'navigator'` (gated in
 * `packages/app/src/main.tsx`).
 */

import { useEffect, useState } from 'react';
import type { OkDesktopBridge, RecentProjectEntry } from '@/lib/desktop-bridge-types';

type RecentProject = RecentProjectEntry;

/**
 * Resolve the user-visible error message for a thrown/rejected value.
 * Prefers `err.message` when present, otherwise the `fallback`. Exported so
 * unit tests can pin the surface ("non-Error throws yield fallback", "empty-
 * message Error falls back", "Error with message wins").
 */
export function resolveErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/**
 * Shape of the error-state wrapper — injected by the component, usable pure
 * so tests can verify the "rejection → setError called" behavior without
 * mounting React.
 */
export async function runWithErrorStatePure(
  fn: () => Promise<void>,
  fallback: string,
  setError: (msg: string | null) => void,
): Promise<void> {
  try {
    setError(null);
    await fn();
  } catch (err) {
    console.error('[NavigatorApp] action failed:', err);
    setError(resolveErrorMessage(err, fallback));
  }
}

export function NavigatorApp({ bridge }: { bridge: OkDesktopBridge }) {
  const [recents, setRecents] = useState<RecentProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Promise-chain instead of try/catch/finally — React Compiler (BuildHIR)
    // does not yet support `finally` clauses; `.finally(...)` on the Promise
    // is equivalent and compiler-safe.
    bridge.project
      .listRecent()
      .then((result) => {
        if (!cancelled) setRecents(result);
      })
      .catch((err) => {
        console.error('[NavigatorApp] listRecent failed:', err);
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load recent projects.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bridge]);

  /**
   * Wrap any bridge call in a visible error state. Without this the IPC
   * rejection (utility failed to boot, bad folder, dialog rejected) lands as
   * an unhandled promise rejection and the UI stays frozen in its pre-click
   * state — no feedback, no retry path. Delegates to the pure
   * `runWithErrorStatePure` helper so the rejection-handling logic can be
   * unit-tested without React.
   */
  const runWithErrorState = (fn: () => Promise<void>, fallback: string) =>
    runWithErrorStatePure(fn, fallback, setError);

  const onClone = () =>
    runWithErrorState(async () => {
      // M4/M5 wires the full Device-Flow CloneDialog; for M1 we just open the
      // folder picker so the user can pick a clone target — actual `git clone`
      // delegation lands in M4 alongside the Device-Flow auth surface.
      const target = await bridge.dialog.openFolder();
      if (!target) return;
      // TODO M4: pipe target + git URL into clone-from-github CloneDialog
      await openProject(bridge, target);
    }, 'Failed to clone from GitHub.');

  const onOpenFolder = () =>
    runWithErrorState(async () => {
      const path = await bridge.dialog.openFolder();
      if (!path) return;
      await openProject(bridge, path);
    }, 'Failed to open folder.');

  const onStartFresh = () =>
    runWithErrorState(async () => {
      const path = await bridge.dialog.createFolder();
      if (!path) return;
      await openProject(bridge, path);
    }, 'Failed to create project folder.');

  const onOpenRecent = (path: string) =>
    runWithErrorState(async () => {
      await openProject(bridge, path);
    }, 'Failed to open project.');

  return (
    <div className="flex h-screen w-screen flex-col bg-background p-8 text-foreground">
      <header className="mb-8">
        <h1 className="font-semibold text-2xl tracking-tight">Open Knowledge</h1>
        <p className="text-muted-foreground text-sm">v{bridge.appVersion}</p>
      </header>

      <section className="mb-10 grid grid-cols-3 gap-4">
        <NavigatorCard
          title="Clone from GitHub"
          description="Bring a remote repository onto this machine."
          onClick={onClone}
          dataTestId="nav-clone"
        />
        <NavigatorCard
          title="Open folder on disk"
          description="Open an existing folder as a project."
          onClick={onOpenFolder}
          dataTestId="nav-open"
        />
        <NavigatorCard
          title="Start fresh"
          description="Create a new folder for a brand-new project."
          onClick={onStartFresh}
          dataTestId="nav-fresh"
        />
      </section>

      {error !== null ? (
        <div
          className="mb-6 flex items-start justify-between gap-3 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3"
          data-testid="nav-error-banner"
          role="alert"
        >
          <span className="text-red-700 text-sm dark:text-red-300">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-red-700 text-xs underline hover:no-underline dark:text-red-300"
            data-testid="nav-error-dismiss"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <section className="flex-1">
        <h2 className="mb-4 font-medium text-sm uppercase tracking-wide text-muted-foreground">
          Recent
        </h2>
        {loading ? (
          <p className="text-muted-foreground text-sm">Loading recent projects…</p>
        ) : recents.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No recent projects yet. Open or create one above to get started.
          </p>
        ) : (
          <ul className="divide-y divide-border" data-testid="nav-recent-list">
            {recents.map((r) => (
              <RecentRow key={r.path} project={r} onOpen={() => onOpenRecent(r.path)} />
            ))}
          </ul>
        )}
      </section>

      <footer className="mt-6 text-center text-muted-foreground text-xs">
        Click a project to open it in a new window. Navigator stays open for launching more.
      </footer>
    </div>
  );
}

interface NavigatorCardProps {
  title: string;
  description: string;
  onClick: () => void;
  dataTestId?: string;
}

function NavigatorCard({ title, description, onClick, dataTestId }: NavigatorCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={dataTestId}
      className="flex flex-col items-start gap-2 rounded-lg border border-border bg-card p-6 text-left transition-colors hover:bg-accent"
    >
      <span className="font-medium text-base">{title}</span>
      <span className="text-muted-foreground text-sm">{description}</span>
    </button>
  );
}

function RecentRow({ project, onOpen }: { project: RecentProject; onOpen: () => void }) {
  return (
    <li className={`flex items-center justify-between py-2 ${project.missing ? 'opacity-50' : ''}`}>
      <button
        type="button"
        onClick={onOpen}
        disabled={project.missing}
        className="flex flex-1 flex-col items-start text-left disabled:cursor-not-allowed"
      >
        <span className="font-medium text-sm">{project.name}</span>
        <span className="text-muted-foreground text-xs">{project.path}</span>
      </button>
      {project.missing ? (
        <span className="rounded bg-yellow-500/10 px-2 py-1 text-xs text-yellow-600">Missing</span>
      ) : null}
    </li>
  );
}

async function openProject(bridge: OkDesktopBridge, path: string): Promise<void> {
  await bridge.project.open({ path, target: 'new-window' });
}

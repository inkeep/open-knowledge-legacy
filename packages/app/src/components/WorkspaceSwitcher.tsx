/**
 * WorkspaceSwitcher — Electron-only UI affordance in the top bar for switching
 * between projects (aka workspaces). Renders as a compact pill showing the
 * current project name; clicking opens a dropdown with:
 *   - Recents (from `bridge.project.listRecent()`), opens each in a new window
 *   - "Open folder…" — native picker → open in a new window
 *
 * Web / CLI distribution does NOT render this — it's gated on
 * `window.okDesktop` being present. Without a window manager the concept
 * of "switch workspace" collapses to opening a new browser tab manually.
 *
 * Per D3 revised: opening a recent project spawns a NEW editor BrowserWindow.
 * The current window is untouched — users end up with N windows, one per
 * project, and can close the current one if they only want the new project.
 * This matches the menu bar's File → Open Recent behavior; the UI control
 * is a discoverable surface for the same set of actions.
 */

import { ChevronDown, FolderOpen, FolderPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { OkDesktopBridge, RecentProjectEntry } from '@/lib/desktop-bridge-types';
import { runWithErrorStatePure } from '@/lib/error-state';

/**
 * Bridge the shared `runWithErrorStatePure` helper to a sonner toast. The
 * dropdown auto-closes on any action click, so an inline banner wouldn't be
 * visible — toasts are the right surface for transient failure feedback.
 * Exported for unit testing via a mockable `toastApi` indirection.
 */
export async function runWithToast(
  fn: () => Promise<void>,
  fallback: string,
  toastApi: { error(msg: string): void } = toast,
): Promise<void> {
  await runWithErrorStatePure(
    fn,
    fallback,
    (msg) => {
      // setError(null) fires at the start; ignore the clear — toasts auto-
      // dismiss. Only surface non-null messages (actual rejections).
      if (msg !== null) toastApi.error(msg);
    },
    'WorkspaceSwitcher',
  );
}

interface WorkspaceSwitcherProps {
  bridge: OkDesktopBridge;
}

export function WorkspaceSwitcher({ bridge }: WorkspaceSwitcherProps) {
  const [recents, setRecents] = useState<RecentProjectEntry[]>([]);
  const [open, setOpen] = useState(false);

  // Lazy-load recents when the dropdown opens. Keeps initial render cheap
  // and always shows the latest list rather than a stale snapshot from mount.
  // IPC rejection surfaces as a toast so the user knows the list is stale
  // (rather than silently seeing an empty dropdown).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void runWithToast(async () => {
      const result = await bridge.project.listRecent();
      if (!cancelled) setRecents(result);
    }, 'Failed to load recent workspaces.');
    return () => {
      cancelled = true;
    };
  }, [open, bridge]);

  const openProject = (path: string) => {
    setOpen(false);
    void runWithToast(
      () => bridge.project.open({ path, target: 'new-window' }),
      'Failed to open workspace.',
    );
  };

  const onOpenFolder = () => {
    setOpen(false);
    void runWithToast(async () => {
      const path = await bridge.dialog.openFolder();
      if (!path) return;
      await bridge.project.open({ path, target: 'new-window' });
    }, 'Failed to open folder.');
  };

  // Filter out the current project from recents — no value in "switch to the
  // one you're already in" since it would hit the D44 case (a) focus-existing
  // dialog and do nothing useful. The current project name is already in the
  // trigger button, so it stays discoverable.
  const currentPath = bridge.config.projectPath;
  const switchable = recents.filter((r) => r.path !== currentPath);

  return (
    <DropdownMenuRoot open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 px-2 text-muted-foreground hover:text-foreground"
          data-testid="workspace-switcher-trigger"
          title="Switch workspace"
        >
          <FolderOpen className="size-4 shrink-0" />
          <span className="max-w-[160px] truncate">{bridge.config.projectName}</span>
          <ChevronDown className="size-3 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="min-w-[260px]"
        data-testid="workspace-switcher-menu"
      >
        <DropdownMenuLabel>Switch workspace</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {switchable.length === 0 ? (
          <DropdownMenuLabel className="font-normal text-muted-foreground text-xs">
            No other recent projects.
          </DropdownMenuLabel>
        ) : (
          switchable.slice(0, 10).map((row) => (
            <DropdownMenuItem
              key={row.path}
              disabled={row.missing}
              onSelect={() => openProject(row.path)}
              className="flex flex-col items-start gap-0.5"
              data-testid={`workspace-switcher-recent-${row.path}`}
            >
              <span className="font-medium text-sm">{row.name}</span>
              <span className="max-w-[240px] truncate text-muted-foreground text-xs">
                {row.path}
                {row.missing ? '  (missing)' : ''}
              </span>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onOpenFolder} data-testid="workspace-switcher-open-folder">
          <FolderPlus className="mr-2 size-4" />
          Open folder…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuRoot>
  );
}

/**
 * ProjectSwitcher — Electron-only UI affordance in the sidebar footer for
 * switching between projects. Renders as a compact pill showing the current
 * project name; clicking opens a dropdown (upward, into the sidebar) with:
 *   - Recents (from `bridge.project.listRecent()`), opens each in a new window
 *   - "Open folder…" — native picker → open in a new window
 *
 * Web / CLI distribution does NOT render this — it's gated on
 * `window.okDesktop` being present. Without a window manager the concept
 * of "switch project" collapses to opening a new browser tab manually.
 *
 * Per D3 revised: opening a recent project spawns a NEW editor BrowserWindow.
 * The current window is untouched — users end up with N windows, one per
 * project, and can close the current one if they only want the new project.
 * This matches the menu bar's File → Open Recent behavior; the UI control
 * is a discoverable surface for the same set of actions.
 */

import { ChevronsUpDown } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarMenuButton } from '@/components/ui/sidebar';
import type { OkDesktopBridge, RecentProjectEntry } from '@/lib/desktop-bridge-types';
import { runWithToast as runWithToastBase } from '@/lib/error-state';

/**
 * Backward-compat re-export of the shared helper with this component's log
 * prefix baked in — existing tests import `runWithToast` from this module
 * (Pass 3). The shared helper moved to `@/lib/error-state` in Pass 4 once
 * a second consumer (CommandPalette) landed.
 */
export const runWithToast = (
  fn: () => Promise<void>,
  fallback: string,
  toastApi?: { error(msg: string): void },
): Promise<void> => runWithToastBase(fn, fallback, toastApi, 'ProjectSwitcher');

interface ProjectSwitcherProps {
  bridge: OkDesktopBridge;
}

export function ProjectSwitcher({ bridge }: ProjectSwitcherProps) {
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
    }, 'Failed to load recent projects.');
    return () => {
      cancelled = true;
    };
  }, [open, bridge]);

  const openProject = (path: string) => {
    setOpen(false);
    void runWithToast(
      () => bridge.project.open({ path, target: 'new-window' }),
      'Failed to open project.',
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
        <SidebarMenuButton
          className="justify-between text-sidebar-foreground/70"
          data-testid="project-switcher-trigger"
          title="Switch project"
        >
          <span className="truncate">{bridge.config.projectName}</span>
          <ChevronsUpDown className="opacity-60" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="top"
        className="min-w-[260px]"
        data-testid="project-switcher-menu"
      >
        <DropdownMenuLabel className="font-mono font-normal tracking-wide uppercase text-muted-foreground text-xs">
          Switch project
        </DropdownMenuLabel>
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
              data-testid={`project-switcher-recent-${row.path}`}
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
        <DropdownMenuItem onSelect={onOpenFolder} data-testid="project-switcher-open-folder">
          Open folder…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuRoot>
  );
}

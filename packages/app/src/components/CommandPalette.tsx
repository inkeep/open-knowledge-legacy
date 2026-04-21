/**
 * CommandPalette — Electron-only Cmd+K (Ctrl+K on Win/Linux) overlay that
 * mirrors the File-menu actions as a searchable list. User feedback during
 * Phase 8 review asked for a command-palette UI (beyond the menu bar + the
 * top-bar ProjectSwitcher pill) for project selection.
 *
 * Commands (all open a NEW editor BrowserWindow per D3 revised):
 *   - Open folder on disk…            — `bridge.dialog.openFolder()` → open
 *   - New Project (open Navigator)    — via File menu parallel; IPC TBD
 *                                       (falls back to openFolder for v0)
 *   - Open Recent → <one item per recent project>, up to 10
 *
 * Web / CLI distribution: `window.okDesktop` is undefined → the palette never
 * mounts; Cmd+K is a no-op outside Electron. Keeps zero-footprint for non-
 * Electron consumers of packages/app.
 *
 * Pattern mirrors VS Code's Cmd+Shift+P, Cursor's Cmd+K, Linear's Cmd+K, etc.
 */

import { FolderOpen, FolderPlus, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import type { OkDesktopBridge, RecentProjectEntry } from '@/lib/desktop-bridge-types';
import { runWithToast as runWithToastBase } from '@/lib/error-state';

/**
 * CommandPalette-scoped wrapper around the shared `runWithToast` helper. Same
 * surface ProjectSwitcher uses — consistent launcher UX (every rejection
 * surfaces as a sonner toast). Exported for unit-testing with a mockable
 * `toastApi` indirection; the default uses sonner's module-level `toast`.
 */
export const runWithToast = (
  fn: () => Promise<void>,
  fallback: string,
  toastApi?: { error(msg: string): void },
): Promise<void> => runWithToastBase(fn, fallback, toastApi, 'CommandPalette');

interface CommandPaletteProps {
  bridge: OkDesktopBridge;
}

export function CommandPalette({ bridge }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [recents, setRecents] = useState<RecentProjectEntry[]>([]);

  // Lazy-load recents each time the palette opens so the list is always fresh.
  // Cheap (<10ms over IPC), and avoids a stale snapshot if the user opens
  // another project in a sibling window between palette opens. IPC rejection
  // surfaces as a toast so users know the list is stale rather than silently
  // seeing an empty group.
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

  // Cmd+K / Ctrl+K global opener. Attached once per bridge instance; React
  // Compiler handles the no-stale-closure-on-re-render concern via reactivity.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isTrigger = (e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K');
      if (!isTrigger) return;
      e.preventDefault();
      setOpen((prev) => !prev);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const runAction = (fn: () => Promise<void> | void, fallback = 'Command failed.') => {
    setOpen(false);
    // Normalize `fn` to `() => Promise<void>` so the shared helper's
    // signature lines up; sync callbacks get wrapped into a resolved promise.
    void runWithToast(async () => {
      await fn();
    }, fallback);
  };

  const currentPath = bridge.config.projectPath;
  const switchable = recents.filter((r) => r.path !== currentPath);

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Project Command Palette"
      description="Switch projects, open folders, or start a new project."
    >
      <CommandInput placeholder="Type a command or search recent projects…" />
      <CommandList>
        <CommandEmpty>No matching commands.</CommandEmpty>

        <CommandGroup heading="Project">
          <CommandItem
            onSelect={() =>
              runAction(async () => {
                const path = await bridge.dialog.openFolder();
                if (!path) return;
                await bridge.project.open({ path, target: 'new-window' });
              })
            }
            data-testid="command-palette-open-folder"
          >
            <FolderOpen />
            <span>Open folder on disk…</span>
            <CommandShortcut>⌘O</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() =>
              runAction(async () => {
                // M4/M5 wires a proper New Project → Navigator invocation.
                // For now: same as Open folder (opens native picker) so users
                // get "create or pick a folder" behavior without a dead item.
                const path = await bridge.dialog.createFolder();
                if (!path) return;
                await bridge.project.open({ path, target: 'new-window' });
              })
            }
            data-testid="command-palette-start-fresh"
          >
            <FolderPlus />
            <span>Start fresh in a new folder…</span>
            <CommandShortcut>⌘⇧N</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        {switchable.length > 0 ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Recent projects">
              {switchable.slice(0, 10).map((row) => (
                <CommandItem
                  key={row.path}
                  value={`${row.name} ${row.path}`}
                  disabled={row.missing}
                  onSelect={() =>
                    runAction(() => bridge.project.open({ path: row.path, target: 'new-window' }))
                  }
                  data-testid={`command-palette-recent-${row.path}`}
                >
                  <Sparkles />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{row.name}</span>
                    <span className="truncate text-muted-foreground text-xs">
                      {row.path}
                      {row.missing ? '  (missing)' : ''}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}

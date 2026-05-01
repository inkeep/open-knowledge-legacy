import { Download, FolderOpen, LayoutGrid, Settings, Sparkles } from 'lucide-react';
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
import { useDocumentContext } from '@/editor/DocumentContext';
import type { OkDesktopBridge, RecentProjectEntry } from '@/lib/desktop-bridge-types';
import { SWITCH_PROJECT_LABEL_WITH_ELLIPSIS } from '@/lib/desktop-labels';
import { runWithToast as runWithToastBase } from '@/lib/error-state';
import { KNOWN_TARGETS } from '@/lib/handoff/targets';
import { SETTINGS_OPEN_HASH } from '@/lib/use-settings-route';
import { useWorkspace } from '@/lib/use-workspace';
import { buildHandoffInput, useHandoffDispatch } from './handoff/useHandoffDispatch';
import { useInstalledAgents } from './handoff/useInstalledAgents';

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
  const { activeDocName } = useDocumentContext();
  const workspace = useWorkspace();
  const { states: installStates, refresh: refreshInstallStates } = useInstalledAgents();
  const { dispatch: dispatchHandoff } = useHandoffDispatch();
  const handoffInput = buildHandoffInput({ docName: activeDocName, workspace });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void runWithToast(async () => {
      const result = await bridge.project.listRecent();
      if (!cancelled) setRecents(result);
    }, 'Failed to load recent projects.');
    void refreshInstallStates();
    return () => {
      cancelled = true;
    };
  }, [open, bridge, refreshInstallStates]);

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
      description="Open a folder, switch to a recent project, or open the Project Navigator."
    >
      <CommandInput placeholder="Type a command or search recent projects…" />
      <CommandList className="subtle-scrollbar">
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
            value="switch-project navigator projects"
            onSelect={() =>
              runAction(() => bridge.navigator.open(), 'Failed to open Project Navigator.')
            }
            data-testid="command-palette-switch-project"
          >
            <LayoutGrid />
            <span>{SWITCH_PROJECT_LABEL_WITH_ELLIPSIS}</span>
            <CommandShortcut>⌘⇧N</CommandShortcut>
          </CommandItem>
          <CommandItem
            value="settings preferences config"
            onSelect={() => {
              setOpen(false);
              if (window.location.hash !== SETTINGS_OPEN_HASH) {
                window.location.hash = SETTINGS_OPEN_HASH;
              }
            }}
            data-testid="command-palette-settings"
          >
            <Settings />
            <span>Settings…</span>
            <CommandShortcut>⌘,</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setOpen(false);
              window.location.hash = '#install-claude-desktop';
            }}
            data-testid="command-palette-install-claude-desktop"
          >
            <Download />
            <span>Install for Claude Chat & Cowork (Desktop App)…</span>
          </CommandItem>
        </CommandGroup>

        {activeDocName ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Open in agent">
              {KNOWN_TARGETS.map((target) => {
                const installState = installStates[target.id];
                const enabled = installState.installed === true && handoffInput !== null;
                const hint =
                  installState.installed === null
                    ? 'Detecting…'
                    : installState.installed === false
                      ? 'Not installed'
                      : handoffInput === null
                        ? 'No active doc'
                        : null;
                const accessibleLabel = hint
                  ? `Open in ${target.displayName}, ${hint}`
                  : `Open in ${target.displayName}`;
                return (
                  <CommandItem
                    key={target.id}
                    value={`open-in-agent ${target.id} ${target.displayName}`}
                    disabled={!enabled}
                    onSelect={() => {
                      if (!enabled || !handoffInput) return;
                      setOpen(false);
                      void dispatchHandoff(target.id, handoffInput);
                    }}
                    data-testid={`command-palette-open-in-${target.id}`}
                    aria-label={accessibleLabel}
                  >
                    <span className="flex-1">Open in {target.displayName}</span>
                    {hint ? (
                      <span aria-hidden="true" className="ml-auto text-muted-foreground text-xs">
                        {hint}
                      </span>
                    ) : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        ) : null}

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

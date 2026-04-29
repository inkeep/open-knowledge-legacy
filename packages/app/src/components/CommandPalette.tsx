/**
 * CommandPalette — workspace omnibar opened by Cmd+K / Ctrl+K.
 *
 * The palette is available on both web and Electron hosts. Workspace
 * navigation (files, folders, create commands, graph, open-in-agent) is
 * shared across hosts; desktop project commands appear when the Electron
 * bridge is available.
 */

import {
  Download,
  FilePlus2,
  FileText,
  FolderOpen,
  FolderPlus,
  LayoutGrid,
  Network,
  Sparkles,
} from 'lucide-react';
import { useDeferredValue, useEffect, useState } from 'react';
import {
  filterOmnibarRecents,
  loadOmnibarRecents,
  makeOmnibarRecentKey,
  type OmnibarRecentEntry,
  rememberOmnibarRecent,
  saveOmnibarRecents,
} from '@/components/command-palette-recents';
import {
  buildWorkspaceEntries,
  matchesCommandQuery,
  searchWorkspaceEntries,
  type WorkspaceEntry,
} from '@/components/command-palette-search';
import { requestDocPanelTab } from '@/components/doc-panel-events';
import { defaultInitialDir } from '@/components/file-tree-utils';
import { NewItemDialog } from '@/components/NewItemDialog';
import { usePageList } from '@/components/PageListContext';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import { useDocumentContext } from '@/editor/DocumentContext';
import type { OkDesktopBridge, RecentProjectEntry } from '@/lib/desktop-bridge-types';
import { SWITCH_PROJECT_LABEL_WITH_ELLIPSIS } from '@/lib/desktop-labels';
import { hashFromDocName } from '@/lib/doc-hash';
import { runWithToast as runWithToastBase } from '@/lib/error-state';
import { KNOWN_TARGETS } from '@/lib/handoff/targets';
import { useWorkspace } from '@/lib/use-workspace';
import { isMacOs } from '@/lib/utils.ts';
import { buildHandoffInput, useHandoffDispatch } from './handoff/useHandoffDispatch';
import { useInstalledAgents } from './handoff/useInstalledAgents';

export const runWithToast = (
  fn: () => Promise<void>,
  fallback: string,
  toastApi?: { error(msg: string): void },
): Promise<void> => runWithToastBase(fn, fallback, toastApi, 'CommandPalette');

interface CommandPaletteProps {
  bridge?: OkDesktopBridge | null;
}

function navigateToDocHash(docName: string): void {
  window.location.assign(hashFromDocName(docName));
}

function resolveCreateInitialDir(
  activeTarget: ReturnType<typeof useDocumentContext>['activeTarget'],
  activeDocName: string | null,
): string {
  if (activeTarget?.kind === 'folder' || activeTarget?.kind === 'folder-index') {
    return activeTarget.folderPath;
  }
  return defaultInitialDir(activeDocName);
}

function NavigationItem({
  entry,
  onSelect,
}: {
  entry: WorkspaceEntry | OmnibarRecentEntry;
  onSelect: () => void;
}) {
  const Icon = entry.kind === 'folder' ? FolderOpen : FileText;

  return (
    <CommandItem
      value={`${entry.kind} ${entry.path}`}
      onSelect={onSelect}
      data-testid={`command-palette-nav-${entry.kind}-${entry.path}`}
    >
      <Icon />
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{entry.path.split('/').pop() ?? entry.path}</span>
        <span className="truncate text-muted-foreground text-xs">{entry.path}</span>
      </div>
    </CommandItem>
  );
}

export function CommandPalette({ bridge = null }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [projectRecents, setProjectRecents] = useState<RecentProjectEntry[]>([]);
  const [recentNavigation, setRecentNavigation] = useState<OmnibarRecentEntry[]>([]);
  const [createDialogKind, setCreateDialogKind] = useState<'file' | 'folder' | null>(null);
  const { activeDocName, activeTarget } = useDocumentContext();
  const { pages, pageTitles, pageMeta, folderPaths } = usePageList();
  const workspace = useWorkspace();
  const { states: installStates, refresh: refreshInstallStates } = useInstalledAgents();
  const { dispatch: dispatchHandoff } = useHandoffDispatch();
  const handoffInput = buildHandoffInput({ docName: activeDocName, workspace });

  const workspaceEntries = buildWorkspaceEntries(pages, folderPaths, pageTitles, pageMeta);
  const navigationResults = searchWorkspaceEntries(workspaceEntries, deferredQuery);
  const validRecentKeys = new Set(
    workspaceEntries.map((entry) => makeOmnibarRecentKey(entry.kind, entry.path)),
  );
  const visibleRecents = filterOmnibarRecents(recentNavigation, validRecentKeys);
  const currentPath = bridge?.config.projectPath ?? null;
  const switchableProjects = bridge ? projectRecents.filter((row) => row.path !== currentPath) : [];
  const initialCreateDir = resolveCreateInitialDir(activeTarget, activeDocName);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isTrigger = e.key === 'k' && (isMacOs() ? e.metaKey : e.ctrlKey);
      if (!isTrigger) return;
      e.preventDefault();
      setOpen((prev) => !prev);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setRecentNavigation(loadOmnibarRecents());
      void refreshInstallStates();
      if (bridge) {
        let cancelled = false;
        void runWithToast(async () => {
          const result = await bridge.project.listRecent();
          if (!cancelled) setProjectRecents(result);
        }, 'Failed to load recent projects.');
        return () => {
          cancelled = true;
        };
      }
      return;
    }
    setQuery('');
  }, [open, bridge, refreshInstallStates]);

  const runAction = (fn: () => Promise<void> | void, fallback = 'Command failed.') => {
    setOpen(false);
    void runWithToast(async () => {
      await fn();
    }, fallback);
  };

  function rememberNavigation(entry: WorkspaceEntry | OmnibarRecentEntry) {
    const nextEntry = {
      kind: entry.kind,
      path: entry.path,
      lastOpenedAt: new Date().toISOString(),
    } satisfies OmnibarRecentEntry;
    const nextRecents = rememberOmnibarRecent(loadOmnibarRecents(), nextEntry);
    saveOmnibarRecents(nextRecents);
    setRecentNavigation(nextRecents);
  }

  function navigateToEntry(entry: WorkspaceEntry | OmnibarRecentEntry) {
    setOpen(false);
    rememberNavigation(entry);
    navigateToDocHash(entry.path);
  }

  const showRecentNavigation = deferredQuery.trim() === '' && visibleRecents.length > 0;
  const showNavigation = navigationResults.length > 0;
  const showCreateFile = matchesCommandQuery('New file', deferredQuery, ['create file']);
  const showCreateFolder = matchesCommandQuery('New folder', deferredQuery, ['create folder']);
  const showGraphCommand = matchesCommandQuery('Open graph', deferredQuery, [
    'graph panel network',
  ]);
  const showProjectOpenFolder =
    bridge !== null && matchesCommandQuery('Open folder on disk', deferredQuery, ['project']);
  const showProjectSwitch =
    bridge !== null &&
    matchesCommandQuery(SWITCH_PROJECT_LABEL_WITH_ELLIPSIS, deferredQuery, [
      'switch project navigator projects',
    ]);
  const showInstallClaudeDesktop = matchesCommandQuery(
    'Install for Claude Chat & Cowork (Desktop App)',
    deferredQuery,
    ['claude desktop install cowork'],
  );
  const showProjectRecents =
    bridge !== null &&
    switchableProjects.length > 0 &&
    (deferredQuery.trim() === '' ||
      switchableProjects.some((row) =>
        matchesCommandQuery(`${row.name} ${row.path}`, deferredQuery, ['recent project']),
      ));
  const showAgentGroup =
    deferredQuery.trim() === '' ||
    KNOWN_TARGETS.some((target) =>
      matchesCommandQuery(`Open in ${target.displayName}`, deferredQuery, [
        target.id,
        'agent handoff',
      ]),
    );
  const hasAnyResults =
    showRecentNavigation ||
    showNavigation ||
    showCreateFile ||
    showCreateFolder ||
    showGraphCommand ||
    showProjectOpenFolder ||
    showProjectSwitch ||
    showInstallClaudeDesktop ||
    showProjectRecents ||
    showAgentGroup;

  return (
    <>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Workspace Command Palette"
        description="Search files, folders, and commands for the current workspace."
        commandProps={{ shouldFilter: false }}
      >
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search files, folders, or commands…"
        />
        <CommandList className="subtle-scrollbar">
          {!hasAnyResults ? <CommandEmpty>No matching commands.</CommandEmpty> : null}

          {showRecentNavigation ? (
            <CommandGroup heading="Recently opened">
              {visibleRecents.map((entry) => (
                <NavigationItem
                  key={makeOmnibarRecentKey(entry.kind, entry.path)}
                  entry={entry}
                  onSelect={() => navigateToEntry(entry)}
                />
              ))}
            </CommandGroup>
          ) : null}

          {showNavigation ? (
            <CommandGroup heading="Navigate">
              {navigationResults.map((entry) => (
                <NavigationItem
                  key={makeOmnibarRecentKey(entry.kind, entry.path)}
                  entry={entry}
                  onSelect={() => navigateToEntry(entry)}
                />
              ))}
            </CommandGroup>
          ) : null}

          {showCreateFile || showCreateFolder || showGraphCommand ? (
            <CommandGroup heading="Commands">
              {showCreateFile ? (
                <CommandItem
                  value="new file create file"
                  onSelect={() => {
                    setOpen(false);
                    setCreateDialogKind('file');
                  }}
                  data-testid="command-palette-new-file"
                >
                  <FilePlus2 />
                  <span>New file</span>
                </CommandItem>
              ) : null}
              {showCreateFolder ? (
                <CommandItem
                  value="new folder create folder"
                  onSelect={() => {
                    setOpen(false);
                    setCreateDialogKind('folder');
                  }}
                  data-testid="command-palette-new-folder"
                >
                  <FolderPlus />
                  <span>New folder</span>
                </CommandItem>
              ) : null}
              {showGraphCommand ? (
                <CommandItem
                  value="open graph graph panel network"
                  disabled={!activeDocName}
                  onSelect={() => {
                    if (!activeDocName) return;
                    setOpen(false);
                    requestDocPanelTab('graph');
                  }}
                  data-testid="command-palette-open-graph"
                  aria-label={activeDocName ? 'Open graph' : 'Open graph, No active doc'}
                >
                  <Network />
                  <span>Open graph</span>
                  {!activeDocName ? (
                    <span aria-hidden="true" className="ml-auto text-muted-foreground text-xs">
                      No active doc
                    </span>
                  ) : null}
                </CommandItem>
              ) : null}
            </CommandGroup>
          ) : null}

          {showAgentGroup ? (
            <CommandGroup heading="Open in agent">
              {KNOWN_TARGETS.filter((target) =>
                matchesCommandQuery(`Open in ${target.displayName}`, deferredQuery, [
                  target.id,
                  'agent handoff',
                ]),
              ).map((target) => {
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
                    value={`open in ${target.displayName} ${target.id} agent`}
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
          ) : null}

          {showProjectOpenFolder ||
          showProjectSwitch ||
          showInstallClaudeDesktop ||
          showProjectRecents ? (
            <CommandGroup heading="Project">
              {showProjectOpenFolder && bridge ? (
                <CommandItem
                  value="open folder on disk project"
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
              ) : null}
              {showProjectSwitch && bridge ? (
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
              ) : null}
              {showInstallClaudeDesktop ? (
                <CommandItem
                  value="install claude desktop cowork app"
                  onSelect={() => {
                    setOpen(false);
                    window.location.hash = '#install-claude-desktop';
                  }}
                  data-testid="command-palette-install-claude-desktop"
                >
                  <Download />
                  <span>Install for Claude Chat & Cowork (Desktop App)…</span>
                </CommandItem>
              ) : null}
              {showProjectRecents && bridge
                ? switchableProjects
                    .filter((row) =>
                      matchesCommandQuery(`${row.name} ${row.path}`, deferredQuery, [
                        'recent project',
                      ]),
                    )
                    .slice(0, 10)
                    .map((row) => (
                      <CommandItem
                        key={row.path}
                        value={`${row.name} ${row.path} recent project`}
                        disabled={row.missing}
                        onSelect={() =>
                          runAction(
                            () => bridge.project.open({ path: row.path, target: 'new-window' }),
                            'Failed to open project.',
                          )
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
                    ))
                : null}
            </CommandGroup>
          ) : null}
        </CommandList>
      </CommandDialog>

      <NewItemDialog
        open={createDialogKind === 'file'}
        onOpenChange={(next) => {
          if (!next) setCreateDialogKind(null);
        }}
        kind="file"
        initialDir={initialCreateDir}
      />
      <NewItemDialog
        open={createDialogKind === 'folder'}
        onOpenChange={(next) => {
          if (!next) setCreateDialogKind(null);
        }}
        kind="folder"
        initialDir={initialCreateDir}
      />
    </>
  );
}

import { humanFormat } from '@inkeep/open-knowledge-core';
import {
  Copy,
  FilePlus,
  FolderOpen,
  FolderPlus,
  FoldVertical,
  ListCollapse,
  SquarePen,
  Terminal,
  UnfoldVertical,
} from 'lucide-react';
import { type ComponentProps, type FC, type MouseEventHandler, useEffect, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { toast } from 'sonner';
import { FileTree, type FileTreeHandle } from '@/components/FileTree';
import { defaultInitialDir } from '@/components/file-tree-utils';
import { OpenInAgentEmptySpaceSubmenu } from '@/components/handoff/OpenInAgentEmptySpaceSubmenu';
import {
  buildProjectScopedHandoffInput,
  useHandoffDispatch,
} from '@/components/handoff/useHandoffDispatch';
import { useInstalledAgents } from '@/components/handoff/useInstalledAgents';
import { ProjectSwitcher } from '@/components/ProjectSwitcher';
import { onPillRenderError, SidebarSearchBar } from '@/components/SidebarSearchBar';
import { UpdateNotices } from '@/components/UpdateNotices';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDocumentContext } from '@/editor/DocumentContext';
import { useFolderConfig } from '@/hooks/use-folder-config';
import { useConfigContext } from '@/lib/config-provider';
import { subscribeToCreateTopLevelFile } from '@/lib/create-file-events';
import { dispatchOpenInTerminal } from '@/lib/dispatch-open-in-terminal';
import {
  buildSendToAiInputForActiveTarget,
  resolveActiveTargetAbsPath,
  resolveActiveTargetParentDirAbsPath,
  resolveActiveTargetRelativePath,
} from '@/lib/file-menu-target-resolvers';
import {
  emitFileTreeMenuActionDelete,
  emitFileTreeMenuActionRename,
} from '@/lib/file-tree-menu-action-events';
import { VISIBLE_TARGETS } from '@/lib/handoff/targets';
import { ProfilerBoundary } from '@/lib/perf';
import { useWorkspace } from '@/lib/use-workspace';
import { cn } from '@/lib/utils';

interface FileSidebarProps {
  onOpenSearch: () => void;
}

const EMPTY_FOLDER_STATE: { folderCount: number; expandedCount: number } = {
  folderCount: 0,
  expandedCount: 0,
};

const SIDEBAR_INTERACTIVE_CONTROL_SELECTOR =
  'button, [role="button"], [role="menuitem"], input, textarea, select, a[href]';

export function isInteractiveSidebarControl(target: EventTarget | null): boolean {
  if (typeof Element === 'undefined' || !(target instanceof Element)) return false;
  return target.closest(SIDEBAR_INTERACTIVE_CONTROL_SELECTOR) !== null;
}

export function FileSidebar({ onOpenSearch }: FileSidebarProps) {
  return (
    <ProfilerBoundary name="file-sidebar">
      <FileSidebarInner onOpenSearch={onOpenSearch} />
    </ProfilerBoundary>
  );
}

interface ToolbarButtonProps extends ComponentProps<typeof Button> {
  icon: FC<ComponentProps<'svg'>>;
  label: string;
}

const ToolbarButton: FC<ToolbarButtonProps> = ({ icon: Icon, label, ...props }) => {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} {...props}>
          <Icon aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
};

function FileSidebarInner({ onOpenSearch }: FileSidebarProps) {
  const [tree, setTree] = useState<FileTreeHandle | null>(null);

  const { activeDocName, activeTarget } = useDocumentContext();
  const initialCreateDir =
    activeTarget?.kind === 'folder' || activeTarget?.kind === 'folder-index'
      ? activeTarget.folderPath
      : defaultInitialDir(activeDocName);

  const isElectronHost = typeof window !== 'undefined' && window.okDesktop != null;

  const { state: sidebarState } = useSidebar();
  const isExpanded = sidebarState === 'expanded';
  const isCollapsed = sidebarState === 'collapsed';
  const shouldFadeChrome = isElectronHost && isCollapsed;

  const [folderState, setFolderState] = useState(EMPTY_FOLDER_STATE);
  useEffect(() => {
    if (tree === null) return;
    setFolderState(tree.getFolderState());
    return tree.subscribe(() => {
      setFolderState(tree.getFolderState());
    });
  }, [tree]);

  useEffect(() => {
    if (tree === null) return;
    return subscribeToCreateTopLevelFile(() => {
      tree.startCreating('file', '');
    });
  }, [tree]);
  const hasFolders = folderState.folderCount > 0;
  const allExpanded = hasFolders && folderState.expandedCount === folderState.folderCount;
  const noneExpanded = folderState.expandedCount === 0;

  const rootFolderConfig = useFolderConfig('');
  const hasTemplates =
    rootFolderConfig.state.status === 'ready'
      ? (rootFolderConfig.state.data.folder.templates_available?.length ?? 0) > 0
      : true;

  const bridge = typeof window !== 'undefined' ? window.okDesktop : undefined;
  const workspace = useWorkspace();
  const handoffInstallStates = useInstalledAgents().states;
  const { dispatch: dispatchHandoff } = useHandoffDispatch();
  const emptySpaceHandoffInput = buildProjectScopedHandoffInput({ workspace });
  const { projectLocalBinding, merged } = useConfigContext();
  const showHiddenFiles = merged?.appearance?.sidebar?.showHiddenFiles ?? false;
  const showAllFiles = merged?.appearance?.sidebar?.showAllFiles ?? false;
  const showEmptySpaceExpandAll = hasFolders && !allExpanded;
  const showEmptySpaceCollapseAll = hasFolders && !noneExpanded;
  const showEmptySpaceTreeStateSection = showEmptySpaceExpandAll || showEmptySpaceCollapseAll;

  const handleSidebarSurfaceContextMenu: MouseEventHandler<HTMLDivElement> = (event) => {
    if (isInteractiveSidebarControl(event.target)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const handleEmptySpaceCreateFile = () => {
    if (!workspace) return;
    tree?.startCreating('file', '');
  };
  const handleEmptySpaceCreateFromTemplate = () => {
    if (!workspace) return;
    tree?.startCreatingFromTemplate('');
  };
  const handleEmptySpaceCreateFolder = () => {
    if (!workspace) return;
    tree?.startCreating('folder', '');
  };
  const handleEmptySpaceReveal = () => {
    if (!workspace || !bridge) return;
    void bridge.shell.showItemInFolder(workspace.contentDir);
  };
  const handleEmptySpaceOpenInTerminal = () => {
    if (!workspace || !bridge) return;
    void dispatchOpenInTerminal(bridge, workspace.contentDir);
  };
  const handleEmptySpaceCopyFullPath = async () => {
    if (!workspace) return;
    try {
      await navigator.clipboard.writeText(workspace.contentDir);
      toast.success('Copied full path', { description: workspace.contentDir });
    } catch (err) {
      console.warn('[FileSidebar] clipboard write failed:', err);
      toast.error('Could not copy full path');
    }
  };
  const handleEmptySpaceShowHiddenFilesToggle = (checked: boolean) => {
    if (projectLocalBinding === null) return;
    const result = projectLocalBinding.patch({
      appearance: { sidebar: { showHiddenFiles: checked } },
    });
    if (!result.ok) {
      console.warn('[FileSidebar] showHiddenFiles toggle rejected:', humanFormat(result.error));
      toast.error('Could not update sidebar settings', {
        description: humanFormat(result.error),
      });
    }
  };
  const handleEmptySpaceShowAllFilesToggle = (checked: boolean) => {
    if (projectLocalBinding === null) return;
    const result = projectLocalBinding.patch({
      appearance: { sidebar: { showAllFiles: checked } },
    });
    if (!result.ok) {
      console.warn('[FileSidebar] showAllFiles toggle rejected:', humanFormat(result.error));
      toast.error('Could not update sidebar settings', {
        description: humanFormat(result.error),
      });
    }
  };
  const handleEmptySpaceExpandAll = () => {
    tree?.expandAll();
  };
  const handleEmptySpaceCollapseAll = () => {
    tree?.collapseAll();
  };

  useEffect(() => {
    if (!bridge) return;
    bridge.editor.notifyViewMenuStateChanged({
      showHiddenFiles,
      showAllFiles,
      canExpandAll: showEmptySpaceExpandAll,
      canCollapseAll: showEmptySpaceCollapseAll,
    });
  }, [bridge, showHiddenFiles, showAllFiles, showEmptySpaceExpandAll, showEmptySpaceCollapseAll]);

  useEffect(() => {
    if (!bridge) return;
    return bridge.onMenuAction((action) => {
      switch (action) {
        case 'new-doc': {
          if (!workspace || !tree) return;
          tree.startCreating('file', initialCreateDir);
          return;
        }
        case 'new-folder': {
          if (!workspace || !tree) return;
          tree.startCreating('folder', initialCreateDir);
          return;
        }
        case 'new-from-template': {
          if (!workspace || !tree) return;
          tree.startCreatingFromTemplate(initialCreateDir);
          return;
        }
        case 'rename': {
          if (!activeTarget) return;
          emitFileTreeMenuActionRename(activeTarget);
          return;
        }
        case 'move-to-trash': {
          if (!activeTarget) return;
          emitFileTreeMenuActionDelete(activeTarget);
          return;
        }
        case 'reveal-in-finder': {
          if (!bridge || !workspace) return;
          const absPath = resolveActiveTargetAbsPath(activeTarget, activeDocName, workspace);
          void bridge.shell.showItemInFolder(absPath);
          return;
        }
        case 'open-in-terminal': {
          if (!bridge || !workspace) return;
          const dirAbsPath = resolveActiveTargetParentDirAbsPath(
            activeTarget,
            activeDocName,
            workspace,
          );
          void dispatchOpenInTerminal(bridge, dirAbsPath);
          return;
        }
        case 'send-to-ai': {
          const installedTargets = VISIBLE_TARGETS.filter(
            (target) => handoffInstallStates[target.id]?.installed === true,
          );
          if (installedTargets.length === 0) {
            toast.error('No AI agents installed');
            return;
          }
          const input = buildSendToAiInputForActiveTarget(activeTarget, activeDocName, workspace);
          if (!input) return;
          const [defaultTarget] = installedTargets;
          if (!defaultTarget) return;
          void dispatchHandoff(defaultTarget.id, input);
          return;
        }
        case 'copy-full-path': {
          if (!workspace) return;
          const absPath = resolveActiveTargetAbsPath(activeTarget, activeDocName, workspace);
          void navigator.clipboard
            .writeText(absPath)
            .then(() => toast.success('Copied full path', { description: absPath }))
            .catch((err: unknown) => {
              console.warn('[FileSidebar] clipboard write failed:', err);
              toast.error('Could not copy full path');
            });
          return;
        }
        case 'copy-relative-path': {
          const relPath = resolveActiveTargetRelativePath(activeTarget, activeDocName);
          if (relPath === '') {
            toast.error('No file or folder selected');
            return;
          }
          void navigator.clipboard
            .writeText(relPath)
            .then(() => toast.success('Copied relative path', { description: relPath }))
            .catch((err: unknown) => {
              console.warn('[FileSidebar] clipboard write failed:', err);
              toast.error('Could not copy relative path');
            });
          return;
        }
        case 'toggle-show-hidden-files': {
          if (projectLocalBinding === null) return;
          const result = projectLocalBinding.patch({
            appearance: { sidebar: { showHiddenFiles: !showHiddenFiles } },
          });
          if (!result.ok) {
            console.warn(
              '[FileSidebar] toggle-show-hidden-files rejected:',
              humanFormat(result.error),
            );
            toast.error('Could not update sidebar settings', {
              description: humanFormat(result.error),
            });
          }
          return;
        }
        case 'toggle-show-all-files': {
          if (projectLocalBinding === null) return;
          const result = projectLocalBinding.patch({
            appearance: { sidebar: { showAllFiles: !showAllFiles } },
          });
          if (!result.ok) {
            console.warn(
              '[FileSidebar] toggle-show-all-files rejected:',
              humanFormat(result.error),
            );
            toast.error('Could not update sidebar settings', {
              description: humanFormat(result.error),
            });
          }
          return;
        }
        case 'expand-all-tree': {
          tree?.expandAll();
          return;
        }
        case 'collapse-all-tree': {
          tree?.collapseAll();
          return;
        }
        case 'delete':
        case 'toggle-sidebar':
        case 'toggle-source':
        case 'save-version':
        case 'version-history':
        case 'focus-search':
        case 'focus-command-palette':
          return;
      }
    });
  }, [
    bridge,
    tree,
    workspace,
    activeTarget,
    activeDocName,
    initialCreateDir,
    projectLocalBinding,
    showHiddenFiles,
    showAllFiles,
    handoffInstallStates,
    dispatchHandoff,
  ]);

  return (
    <Sidebar variant="inset">
      {/* ContextMenu wrap lives INSIDE Sidebar so the outer <aside
       * data-slot="sidebar-container"> stays a direct DOM sibling of
       * SidebarInset. shadcn's SidebarInset uses Tailwind `peer-data-*`
       * selectors (`peer-data-[mobile=true][data-state=expanded]` for the
       * push-mode translate; `peer-data-[variant=inset]:m-2` for the inset
       * variant margins) — those compile to CSS `peer ~ self` which requires
       * the marked element (Sidebar's aside, carrying the data attrs) to be
       * a DOM sibling of the consumer (SidebarInset) under the same parent.
       * An outer ContextMenu wrapper introduces an intermediate <div> that
       * breaks the sibling-ship and zero-translates the inset at small
       * widths (sidebar-push-small-width.e2e.ts failures). `display: contents`
       * is layout-invisible but NOT DOM-invisible, so it doesn't fix the
       * peer selector. Wrapping inside Sidebar puts the trigger div inside
       * the aside instead — preserves the outer DOM topology shadcn needs.
       */}
      <ContextMenu>
        <ContextMenuTrigger asChild>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: ContextMenuTrigger
           * delegation surface — display:contents wrapper for the asChild Slot's
           * single-child requirement. Keyboard equivalents live on the individual
           * interactive controls inside (toolbar buttons, search-pill button,
           * project switcher trigger, Pierre tree rows, sidebar rail); this wrapper
           * has no perceivable interactive surface of its own. The onContextMenu
           * handler delegates the button-target opt-out for the sidebar-wide
           * context menu — same a11y semantics as a Radix Slot. */}
          <div className="contents" onContextMenu={handleSidebarSurfaceContextMenu}>
            <SidebarHeader
              className={cn(
                'flex-row h-12 items-center py-0 px-3',
                isElectronHost ? 'justify-end' : 'justify-between',
                isElectronHost &&
                  'motion-safe:transition-opacity motion-safe:duration-100 motion-safe:ease-out',
                shouldFadeChrome && 'opacity-0',
                isElectronHost && '[-webkit-app-region:drag]',
              )}
            >
              {isExpanded && !isElectronHost ? (
                <span className="shrink-0 font-mono text-sm uppercase tracking-wider text-sidebar-foreground/50">
                  Files
                </span>
              ) : null}
              <div
                className={cn(
                  'flex items-center gap-1',
                  isElectronHost && '[&>*]:[-webkit-app-region:no-drag]',
                )}
              >
                {/*
                 * Expand/Collapse-All uses DropdownMenu (click-to-open). The
                 * earlier hover-to-open HoverCard shape was unreachable from
                 * keyboard and touch: Radix HoverCard's content root forcibly
                 * sets `tabindex="-1"` on every tabbable descendant
                 * (@radix-ui/react-hover-card@dist/index.mjs:172-177), and
                 * hover cannot be triggered from keyboard/AT/touch at all. A
                 * DropdownMenu opens on click/Enter/Space, routes arrow-key
                 * focus between items, and is the shadcn-standard pattern
                 * for toolbar menus.
                 *
                 * Smart-hide: trigger only renders when the tree has folders
                 * (no folders → both menu items would be no-ops, so the entire
                 * trigger is wasted screen real estate). Individual items hide
                 * when their action would no-op: "Expand All" hides when every
                 * folder is already expanded; "Collapse All" hides when none
                 * are expanded. Mixed states show both items.
                 */}
                {hasFolders ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <ToolbarButton icon={ListCollapse} label="Tree View Options" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {!allExpanded ? (
                        <DropdownMenuItem onSelect={() => tree?.expandAll()}>
                          <UnfoldVertical aria-hidden="true" />
                          Expand All
                        </DropdownMenuItem>
                      ) : null}
                      {!noneExpanded ? (
                        <DropdownMenuItem onSelect={() => tree?.collapseAll()}>
                          <FoldVertical aria-hidden="true" />
                          Collapse All
                        </DropdownMenuItem>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
                <ToolbarButton
                  icon={SquarePen}
                  label="New File"
                  onClick={() => tree?.startCreating('file', initialCreateDir)}
                />
                {hasTemplates ? (
                  <ToolbarButton
                    icon={FilePlus}
                    label="New from template"
                    onClick={() => tree?.startCreatingFromTemplate(initialCreateDir)}
                  />
                ) : null}
                <ToolbarButton
                  icon={FolderPlus}
                  label="New Folder"
                  onClick={() => tree?.startCreating('folder', initialCreateDir)}
                />
              </div>
            </SidebarHeader>
            {/*
             * Pill row lives outside SidebarContent's overflow-auto boundary so
             * it is sticky by structure (no sticky CSS needed). no-drag is
             * defensive — the sibling itself does NOT opt into drag like
             * SidebarHeader does, but the explicit opt-out survives a future
             * refactor that might place the row inside a drag region. Opacity
             * fades in lockstep with the toolbar so neither row visibly
             * orphans under the macOS traffic-light region mid-slide.
             *
             * ErrorBoundary scope is intentionally tight: a pill render-throw
             * silent-fails just the pill while the toolbar, FileTree,
             * SidebarFooter, and ⌘K listener continue to function.
             *
             * The observability handler is `onPillRenderError` (defined in
             * SidebarSearchBar.tsx); it emits the project-wide
             * `jsx-render-failure` event with a stable `sidebarSearchPill`
             * surface identifier and increments the same parse-health counter
             * MathInlineView and JsxComponentView feed — one dashboard / alert
             * rule covers every render-throw surface. Payload shape is unit-
             * tested at the function level (`SidebarSearchBar.test.ts`); the
             * wiring (boundary mounts the function on `onError`) is pinned by
             * a single source-level guard below.
             *
             * The `fallbackRender={() => null}` is deliberate — null leaf, not a
             * mini-pill replacement. Rationale: (1) the pill is content-free
             * (icon + literal "Search" + literal kbd), so it has no plausible
             * render-throw path tied to data; the failure modes are React
             * internals, browser-extension injection, or a runtime API failure
             * — none of which a redrawn fallback would recover from. (2) the
             * App-level ⌘K window keydown listener (CommandPalette.tsx)
             * remains reachable in the fallback state, so search is
             * keyboard-reachable even without the visible pill. (3) the
             * structured-warn + counter pair lands the failure in the same
             * observability pipeline siblings feed.
             *
             * `resetKeys={[sidebarState]}` gives the user a recovery affordance
             * after a transient render-throw (e.g., one-off `navigator` access
             * failure, extension-injected error): toggling the sidebar via the
             * existing `Cmd/Ctrl+\` shortcut or the SidebarTrigger button flips
             * sidebarState from `expanded` ↔ `collapsed`, which triggers
             * react-error-boundary to remount the pill subtree. Aligns the
             * recovery shape with `MathInlineView` (uses `resetKeys={[formula]}`)
             * and `JsxComponentView` (uses an explicit `resetKey`) — both
             * sibling boundaries in this codebase expose a recovery path.
             * The null fallback still diverges from sibling sites (which render
             * content-preserving fallbacks), but those fallbacks recover
             * state-bearing user content; this surface has no state to preserve,
             * just a remount opportunity.
             */}
            <div
              className={cn(
                'px-2 pb-2',
                isElectronHost && '[-webkit-app-region:no-drag]',
                isElectronHost &&
                  'motion-safe:transition-opacity motion-safe:duration-100 motion-safe:ease-out',
                shouldFadeChrome && 'opacity-0',
              )}
            >
              <ErrorBoundary
                fallbackRender={() => null}
                onError={onPillRenderError}
                resetKeys={[sidebarState]}
              >
                <SidebarSearchBar onClick={onOpenSearch} />
              </ErrorBoundary>
            </div>
            <SidebarContent>
              <FileTree ref={setTree} />
            </SidebarContent>
            <SidebarFooter className="px-0">
              {typeof window !== 'undefined' && window.okDesktop ? (
                <SidebarMenu>
                  <SidebarMenuItem>
                    <ProjectSwitcher bridge={window.okDesktop} />
                  </SidebarMenuItem>
                </SidebarMenu>
              ) : null}
              <UpdateNotices />
            </SidebarFooter>
            {/*
             * Drag-to-resize ON, click-to-toggle OFF. The EditorHeader's
             * SidebarTrigger is the canonical collapse/expand affordance —
             * adding click-to-toggle on the rail too duplicates that affordance
             * and surprises users who don't expect a structural panel edge to
             * be interactive (and the rail-vs-trigger redundancy creates
             * unclear hit targets near the seam). Drag-to-resize stays because
             * it's a distinct affordance with no other entry point.
             *
             * `enableToggle={false}` flows through useSidebarResize → suppresses
             * the click-without-drag onToggle path. Auto-collapse via dragging
             * to MIN_SIDEBAR_WIDTH still fires (different code path, gated on
             * enableAutoCollapse — currently unused, kept available).
             */}
            <SidebarRail enableToggle={false} />
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          {/*
           * Empty-space menu — 11 items, 4 sections.
           *
           * Section 1: Creation (always visible). New file / from template /
           * folder dispatch the project-root creation flow (parentDir = ''
           * → contentDir). Disabled when workspace hasn't resolved.
           *
           * Section 2: Act-on-project. Reveal in Finder + Open in Terminal
           * are Electron-only (`if (!bridge) return null`); Open with AI submenu
           * is cross-host (filtered via useInstalledAgents); Copy full path
           * is cross-host.
           *
           * Section 3: Toggle. Two ContextMenuCheckboxItems mirror the View
           * menu. Read state from the merged config; write through the
           * project-local CRDT binding so the View menu and any other surface
           * stay in sync via the existing subscribe path.
           *
           * Section 4: Tree state. Expand/Collapse all tree-scoped with
           * smart-hide — both items hide when there are no folders, and each
           * hides when its action would be a no-op (all expanded / none
           * expanded). The separator before this section hides too when both
           * items hide.
           */}
          <ContextMenuItem
            disabled={!workspace}
            onSelect={handleEmptySpaceCreateFile}
            data-testid="empty-space-menu-new-file"
          >
            <SquarePen aria-hidden="true" />
            New File
          </ContextMenuItem>
          <ContextMenuItem
            disabled={!workspace || !hasTemplates}
            onSelect={handleEmptySpaceCreateFromTemplate}
            data-testid="empty-space-menu-new-from-template"
          >
            <FilePlus aria-hidden="true" />
            New from template
          </ContextMenuItem>
          <ContextMenuItem
            disabled={!workspace}
            onSelect={handleEmptySpaceCreateFolder}
            data-testid="empty-space-menu-new-folder"
          >
            <FolderPlus aria-hidden="true" />
            New Folder
          </ContextMenuItem>
          <ContextMenuSeparator />
          {bridge ? (
            <ContextMenuItem
              disabled={!workspace}
              onSelect={handleEmptySpaceReveal}
              data-testid="empty-space-menu-reveal-in-finder"
              aria-label={workspace ? 'Reveal in Finder' : 'Reveal in Finder, No workspace'}
            >
              <FolderOpen aria-hidden="true" />
              <span className="flex-1">Reveal in Finder</span>
              {!workspace ? (
                <span aria-hidden="true" className="ml-2 text-muted-foreground text-xs">
                  No workspace
                </span>
              ) : null}
            </ContextMenuItem>
          ) : null}
          <OpenInAgentEmptySpaceSubmenu
            input={emptySpaceHandoffInput}
            installStates={handoffInstallStates}
            dispatch={dispatchHandoff}
            webFallbackVisible={false}
          />
          {bridge ? (
            <ContextMenuItem
              disabled={!workspace}
              onSelect={handleEmptySpaceOpenInTerminal}
              data-testid="empty-space-menu-open-in-terminal"
              aria-label={workspace ? 'Open in Terminal' : 'Open in Terminal, No workspace'}
            >
              <Terminal aria-hidden="true" />
              <span className="flex-1">Open in Terminal</span>
              {!workspace ? (
                <span aria-hidden="true" className="ml-2 text-muted-foreground text-xs">
                  No workspace
                </span>
              ) : null}
            </ContextMenuItem>
          ) : null}
          <ContextMenuItem
            disabled={!workspace}
            onSelect={handleEmptySpaceCopyFullPath}
            data-testid="empty-space-menu-copy-full-path"
            aria-label={workspace ? 'Copy full path' : 'Copy full path, No workspace'}
          >
            <Copy aria-hidden="true" />
            <span className="flex-1">Copy full path</span>
            {!workspace ? (
              <span aria-hidden="true" className="ml-2 text-muted-foreground text-xs">
                No workspace
              </span>
            ) : null}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuCheckboxItem
            checked={showHiddenFiles}
            onCheckedChange={handleEmptySpaceShowHiddenFilesToggle}
            disabled={projectLocalBinding === null}
            data-testid="empty-space-menu-show-hidden-files"
          >
            Show Hidden Files
          </ContextMenuCheckboxItem>
          <ContextMenuCheckboxItem
            checked={showAllFiles}
            onCheckedChange={handleEmptySpaceShowAllFilesToggle}
            disabled={projectLocalBinding === null}
            data-testid="empty-space-menu-show-all-files"
          >
            Show all files
          </ContextMenuCheckboxItem>
          {showEmptySpaceTreeStateSection ? <ContextMenuSeparator /> : null}
          {showEmptySpaceExpandAll ? (
            <ContextMenuItem
              onSelect={handleEmptySpaceExpandAll}
              data-testid="empty-space-menu-expand-all"
            >
              <UnfoldVertical aria-hidden="true" />
              Expand all
            </ContextMenuItem>
          ) : null}
          {showEmptySpaceCollapseAll ? (
            <ContextMenuItem
              onSelect={handleEmptySpaceCollapseAll}
              data-testid="empty-space-menu-collapse-all"
            >
              <FoldVertical aria-hidden="true" />
              Collapse all
            </ContextMenuItem>
          ) : null}
        </ContextMenuContent>
      </ContextMenu>
    </Sidebar>
  );
}

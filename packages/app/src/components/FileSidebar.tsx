import {
  FilePlus,
  FolderPlus,
  FoldVertical,
  ListCollapse,
  SquarePen,
  UnfoldVertical,
} from 'lucide-react';
import { type ComponentProps, type FC, useEffect, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { FileTree, type FileTreeHandle } from '@/components/FileTree';
import { defaultInitialDir } from '@/components/file-tree-utils';
import { ProjectSwitcher } from '@/components/ProjectSwitcher';
import { onPillRenderError, SidebarSearchBar } from '@/components/SidebarSearchBar';
import { UpdateNotices } from '@/components/UpdateNotices';
import { Button } from '@/components/ui/button';
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
import { ProfilerBoundary } from '@/lib/perf';
import { cn } from '@/lib/utils';

interface FileSidebarProps {
  onOpenSearch: () => void;
}

const EMPTY_FOLDER_STATE: { folderCount: number; expandedCount: number } = {
  folderCount: 0,
  expandedCount: 0,
};

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
  const hasFolders = folderState.folderCount > 0;
  const allExpanded = hasFolders && folderState.expandedCount === folderState.folderCount;
  const noneExpanded = folderState.expandedCount === 0;

  return (
    <Sidebar variant="inset">
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
          <ToolbarButton
            icon={FilePlus}
            label="New from template"
            onClick={() => tree?.startCreatingFromTemplate(initialCreateDir)}
          />
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
    </Sidebar>
  );
}

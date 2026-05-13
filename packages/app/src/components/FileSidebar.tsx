import {
  FilePlus,
  FolderPlus,
  FoldVertical,
  ListCollapse,
  Search,
  SquarePen,
  UnfoldVertical,
} from 'lucide-react';
import { type ComponentProps, type FC, useEffect, useState } from 'react';
import { FileTree, type FileTreeHandle } from '@/components/FileTree';
import { defaultInitialDir } from '@/components/file-tree-utils';
import { ProjectSwitcher } from '@/components/ProjectSwitcher';
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
          isElectronHost && isCollapsed && 'opacity-0',
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
          <ToolbarButton icon={Search} label="Search" onClick={onOpenSearch} />
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

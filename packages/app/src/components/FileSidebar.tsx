import { FolderPlus, FoldVertical, ListCollapse, SquarePen, UnfoldVertical } from 'lucide-react';
import { useRef } from 'react';
import { FileTree, type FileTreeHandle } from '@/components/FileTree';
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
} from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ProfilerBoundary } from '@/lib/perf';

export function FileSidebar() {
  return (
    <ProfilerBoundary name="file-sidebar">
      <FileSidebarInner />
    </ProfilerBoundary>
  );
}

function FileSidebarInner() {
  // Imperative handle to the FileTree — replaces the prior createTrigger seq
  // counter. Header buttons call methods directly; no useEffect on the child
  // side, no "did-I-already-handle-this-seq" bookkeeping. See FileTree.tsx.
  const fileTreeRef = useRef<FileTreeHandle | null>(null);

  return (
    <Sidebar variant="inset">
      <SidebarHeader className="flex-row items-center justify-between">
        <span className="font-mono text-sm uppercase tracking-wider text-sidebar-foreground/50">
          Files
        </span>
        <div className="flex items-center gap-1">
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
           */}
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="Tree view options">
                    <ListCollapse aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Tree view options</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => fileTreeRef.current?.expandAll()}>
                <UnfoldVertical aria-hidden="true" />
                Expand All
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => fileTreeRef.current?.collapseAll()}>
                <FoldVertical aria-hidden="true" />
                Collapse All
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="New file"
                onClick={() => fileTreeRef.current?.startCreating('file', '')}
              >
                <SquarePen aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>New File</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="New folder"
                onClick={() => fileTreeRef.current?.startCreating('folder', '')}
              >
                <FolderPlus aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>New Folder</TooltipContent>
          </Tooltip>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <FileTree ref={fileTreeRef} />
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
      <SidebarRail />
    </Sidebar>
  );
}

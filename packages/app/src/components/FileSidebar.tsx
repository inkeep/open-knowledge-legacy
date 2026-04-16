import { FolderPlus, FoldVertical, ListCollapse, SquarePen, UnfoldVertical } from 'lucide-react';
import { useRef } from 'react';
import { FileTree, type FileTreeHandle } from '@/components/FileTree';
import { Button } from '@/components/ui/button';
import { HoverCardContent, HoverCardRoot, HoverCardTrigger } from '@/components/ui/hover-card';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function FileSidebar() {
  // Imperative handle to the FileTree — replaces the prior createTrigger seq
  // counter. Header buttons call methods directly; no useEffect on the child
  // side, no "did-I-already-handle-this-seq" bookkeeping. See FileTree.tsx.
  const fileTreeRef = useRef<FileTreeHandle | null>(null);

  return (
    <Sidebar variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-sm uppercase tracking-wider text-sidebar-foreground/50">
                Files
              </span>
              <div className="flex items-center gap-1">
                {/*
                 * Expand/Collapse-All uses HoverCard (not DropdownMenu) because
                 * Radix's DropdownMenu has no prescribed hover-open API
                 * (shadcn-ui#2118); emulating it with controlled state + manual
                 * mouseenter/leave handlers produces a trigger↔content event
                 * race that flickers open/closed. HoverCard is the Radix-native
                 * primitive for hover-reveal floating content and handles the
                 * bridge internally via `openDelay`/`closeDelay`. Trade-off:
                 * children are buttons, not role="menuitem" — acceptable for a
                 * 2-item affordance where Tab navigates fine.
                 */}
                <HoverCardRoot openDelay={80} closeDelay={150}>
                  <HoverCardTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="Tree view options">
                      <ListCollapse aria-hidden="true" />
                    </Button>
                  </HoverCardTrigger>
                  <HoverCardContent align="end" className="flex w-auto flex-col gap-0.5 p-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="justify-start gap-2 px-2 font-normal"
                      onClick={() => fileTreeRef.current?.expandAll()}
                    >
                      <UnfoldVertical aria-hidden="true" className="size-4" />
                      Expand All
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="justify-start gap-2 px-2 font-normal"
                      onClick={() => fileTreeRef.current?.collapseAll()}
                    >
                      <FoldVertical aria-hidden="true" className="size-4" />
                      Collapse All
                    </Button>
                  </HoverCardContent>
                </HoverCardRoot>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
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
                      size="icon"
                      aria-label="New folder"
                      onClick={() => fileTreeRef.current?.startCreating('folder', '')}
                    >
                      <FolderPlus aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>New Folder</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <FileTree ref={fileTreeRef} />
      </SidebarContent>
    </Sidebar>
  );
}

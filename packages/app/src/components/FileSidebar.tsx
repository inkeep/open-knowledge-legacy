import {
  Download,
  FolderPlus,
  FoldVertical,
  ListCollapse,
  SquarePen,
  UnfoldVertical,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { FileTree, type FileTreeHandle } from '@/components/FileTree';
import { InstallInClaudeDesktopDialog } from '@/components/InstallInClaudeDesktopDialog';
import { ProjectSwitcher } from '@/components/ProjectSwitcher';
import { UpdateNotices } from '@/components/UpdateNotices';
import { Button } from '@/components/ui/button';
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
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
  const [installDialogOpen, setInstallDialogOpen] = useState(false);

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
                <DropdownMenuRoot>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Tree view options">
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
                </DropdownMenuRoot>
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
      <SidebarFooter className="px-0">
        {typeof window !== 'undefined' && window.okDesktop ? (
          <SidebarMenu>
            <SidebarMenuItem>
              <ProjectSwitcher bridge={window.okDesktop} />
            </SidebarMenuItem>
          </SidebarMenu>
        ) : null}
        <UpdateNotices />
        {/*
          Cowork install CTA — SPEC 2026-04-24 Ship 1e/1f FR9-FR13. Small
          ghost button in the footer; low visual noise, always reachable on
          both web and Electron. The dialog itself is runtime-branched:
          Electron does download + shell.openPath handoff, web triggers
          browser download for double-click. An alternative entry point is
          the URL hash `#install-claude-desktop` handled by App.tsx's
          InstallInClaudeDesktopTrigger.
        */}
        <div className="flex justify-center px-3 pb-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setInstallDialogOpen(true)}
          >
            <Download aria-hidden="true" className="h-3 w-3" />
            Install in Claude Desktop
          </Button>
        </div>
        <InstallInClaudeDesktopDialog
          open={installDialogOpen}
          onOpenChange={setInstallDialogOpen}
        />
      </SidebarFooter>
    </Sidebar>
  );
}

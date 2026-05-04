import {
  FolderPlus,
  FoldVertical,
  ListCollapse,
  Search,
  SquarePen,
  UnfoldVertical,
} from 'lucide-react';
import { type ComponentProps, type FC, useRef } from 'react';
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
import { isMacOs } from '@/lib/utils.ts';

export function FileSidebar() {
  return (
    <ProfilerBoundary name="file-sidebar">
      <FileSidebarInner />
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

function FileSidebarInner() {
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
            <ToolbarButton
              icon={Search}
              label="Search"
              onClick={() => {
                const event = new KeyboardEvent('keydown', {
                  key: 'k',
                  [isMacOs() ? 'metaKey' : 'ctrlKey']: true,
                  bubbles: true,
                });
                document.dispatchEvent(event);
              }}
            />
            <DropdownMenuTrigger asChild>
              <ToolbarButton icon={ListCollapse} label="Tree View Options" />
            </DropdownMenuTrigger>
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
          <ToolbarButton
            icon={SquarePen}
            label="New File"
            onClick={() => fileTreeRef.current?.startCreating('file', '')}
          />
          <ToolbarButton
            icon={FolderPlus}
            label="New Folder"
            onClick={() => fileTreeRef.current?.startCreating('folder', '')}
          />
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

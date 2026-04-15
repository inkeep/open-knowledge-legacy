import { FolderPlus, SquarePen } from 'lucide-react';
import { useState } from 'react';
import { FileTree } from '@/components/FileTree';
import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function FileSidebar() {
  const [createTrigger, setCreateTrigger] = useState<{
    kind: 'file' | 'folder';
    parentDir: string;
    seq: number;
  }>({ kind: 'file', parentDir: '', seq: 0 });

  function triggerCreate(kind: 'file' | 'folder', parentDir: string) {
    setCreateTrigger((prev) => ({ kind, parentDir, seq: prev.seq + 1 }));
  }

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
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="New file"
                      onClick={() => triggerCreate('file', '')}
                    >
                      <SquarePen aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>New file</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="New folder"
                      onClick={() => triggerCreate('folder', '')}
                    >
                      <FolderPlus aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>New folder</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <FileTree createTrigger={createTrigger} />
      </SidebarContent>
    </Sidebar>
  );
}

import { FolderPlus, SquarePen } from 'lucide-react';
import { useState } from 'react';
import { FileTree } from '@/components/FileTree';
import { defaultInitialDir } from '@/components/file-tree-utils';
import { NewItemDialog } from '@/components/NewItemDialog';
import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { useDocumentContext } from '@/editor/DocumentContext';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

export function FileSidebar() {
  const { activeDocName } = useDocumentContext();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogKind, setDialogKind] = useState<'file' | 'folder'>('file');
  const [dialogInitialDir, setDialogInitialDir] = useState('');

  function openNewItemDialog(kind: 'file' | 'folder', initialDir?: string) {
    setDialogKind(kind);
    setDialogInitialDir(initialDir ?? defaultInitialDir(activeDocName));
    setDialogOpen(true);
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
                      onClick={() => openNewItemDialog('file', '')}
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
                      onClick={() => openNewItemDialog('folder', '')}
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
        <FileTree onNewItem={openNewItemDialog} />
      </SidebarContent>

      <NewItemDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        kind={dialogKind}
        initialDir={dialogInitialDir}
      />
    </Sidebar>
  );
}

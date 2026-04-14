import { Plus } from 'lucide-react';
import { useState } from 'react';
import { FileTree } from '@/components/FileTree';
import { defaultInitialDir } from '@/components/file-tree-utils';
import { NewItemDialog } from '@/components/NewItemDialog';
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { useDocumentContext } from '@/editor/DocumentContext';

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
            <span className="text-sm text-sidebar-foreground/50 uppercase font-mono tracking-wider">
              Files
            </span>
            <DropdownMenuRoot>
              <DropdownMenuTrigger asChild>
                <SidebarMenuAction aria-label="New file or folder">
                  <Plus />
                </SidebarMenuAction>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="start">
                <DropdownMenuItem onSelect={() => openNewItemDialog('file')}>
                  New file
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => openNewItemDialog('folder')}>
                  New folder
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenuRoot>
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
        onCreated={() => {}}
      />
    </Sidebar>
  );
}

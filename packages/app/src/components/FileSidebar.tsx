import { ChevronRight, File, Folder, FolderOpen } from 'lucide-react';
import { type FC, useEffect, useState } from 'react';
import { buildTree, type DocEntry, type TreeNode } from '@/components/file-tree-utils';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import { useDocumentContext } from '@/editor/DocumentContext';
import { cn } from '@/lib/utils';

// ── Tree node component ──────────────────────────────────────────────

const FileTreeNode: FC<{
  node: TreeNode;
  selectedPath: string | null;
  onSelect: (docName: string) => void;
  nested?: boolean;
}> = ({ node, nested = false, selectedPath, onSelect }) => {
  const [collapsed, setCollapsed] = useState(() => {
    // Auto-expand if selected file is inside this folder
    if (!selectedPath || node.kind === 'file') return true;
    return !selectedPath.startsWith(`${node.path}/`) && selectedPath !== node.path;
  });

  const isFile = node.kind === 'file';
  const isActive = isFile && node.path === selectedPath;
  const IconToUse = isFile ? File : collapsed ? Folder : FolderOpen;

  const ComponentToUse = nested ? SidebarMenuSubItem : SidebarMenuItem;
  const ButtonToUse = nested ? SidebarMenuSubButton : SidebarMenuButton;

  const content = (
    <>
      <IconToUse className="size-4 shrink-0" stroke="var(--color-muted-foreground)" />
      <span className="min-w-0 flex-1 truncate font-mono text-xs">
        {node.name}
        {isFile && '.md'}
      </span>
    </>
  );

  return (
    <ComponentToUse>
      {isFile ? (
        <ButtonToUse
          isActive={isActive}
          onClick={() => onSelect(node.path)}
          className="cursor-pointer"
        >
          {content}
        </ButtonToUse>
      ) : (
        <div>
          <ButtonToUse className="w-full pr-8">{content}</ButtonToUse>
          <SidebarMenuAction
            className={cn('top-1', !collapsed && 'rotate-90')}
            onClick={(e) => {
              e.preventDefault();
              setCollapsed((v) => !v);
            }}
          >
            <ChevronRight className="size-4" />
          </SidebarMenuAction>
        </div>
      )}
      {node.children.length > 0 && !collapsed && (
        <SidebarMenuSub className="mr-0 pr-0">
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              selectedPath={selectedPath}
              onSelect={onSelect}
              nested
            />
          ))}
        </SidebarMenuSub>
      )}
    </ComponentToUse>
  );
};

// ── Sidebar component ────────────────────────────────────────────────

export function FileSidebar() {
  const { activeDocName } = useDocumentContext();
  const [documents, setDocuments] = useState<DocEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const fetchDocs = () =>
      fetch('/api/documents')
        .then(async (res) => {
          const data = await res.json().catch(() => null);
          if (!active) return;
          if (res.ok && data?.ok) {
            setDocuments(data.documents);
            setError(null);
          } else {
            setError(data?.error ?? `Server error (HTTP ${res.status})`);
          }
        })
        .catch((err) => {
          if (active) setError('Could not reach server');
          console.warn('[FileSidebar] fetch failed:', err);
        })
        .finally(() => {
          if (active) setLoading(false);
        });

    fetchDocs();
    const interval = setInterval(fetchDocs, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const treeNodes = buildTree(documents);

  return (
    <Sidebar variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <span className="px-2 text-sm text-sidebar-foreground/50">Files</span>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {loading ? (
          <div className="flex flex-1 items-center justify-center py-8">
            <span className="select-none text-sm text-sidebar-foreground/30">Loading...</span>
          </div>
        ) : error ? (
          <div className="flex flex-1 items-center justify-center py-8">
            <span className="select-none text-sm text-sidebar-foreground/50">{error}</span>
          </div>
        ) : documents.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-8">
            <span className="select-none text-sm text-sidebar-foreground/30">No files yet.</span>
          </div>
        ) : (
          <SidebarMenu>
            {treeNodes.map((node) => (
              <FileTreeNode
                key={node.path}
                node={node}
                selectedPath={activeDocName}
                onSelect={(docName) => {
                  window.location.hash = `#/${docName}`;
                }}
              />
            ))}
          </SidebarMenu>
        )}
      </SidebarContent>
    </Sidebar>
  );
}

import { useEffect, useState } from 'react';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { useDocumentContext } from '@/editor/DocumentContext';

interface DocEntry {
  docName: string;
  size: number;
  modified: string;
}

export function FileSidebar() {
  const { activeDocName, openDocument } = useDocumentContext();
  const [documents, setDocuments] = useState<DocEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch('/api/documents')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { ok: boolean; documents: DocEntry[] } | null) => {
        if (active && data?.ok) {
          setDocuments(data.documents);
        }
      })
      .catch(() => {
        // Silently fail — server may not be ready yet
      })
      .then(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

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
        ) : documents.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-8">
            <span className="select-none text-sm text-sidebar-foreground/30">No files yet.</span>
          </div>
        ) : (
          <SidebarMenu className="px-2">
            {documents.map((doc) => (
              <SidebarMenuItem key={doc.docName}>
                <SidebarMenuButton
                  isActive={doc.docName === activeDocName}
                  onClick={() => openDocument(doc.docName)}
                  className="font-mono text-xs"
                >
                  {doc.docName}.md
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        )}
      </SidebarContent>
    </Sidebar>
  );
}

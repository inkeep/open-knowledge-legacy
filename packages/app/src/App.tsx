import { useEffect, useState } from 'react';
import { EditorPane } from '@/components/EditorPane';
import { FileSidebar } from '@/components/FileSidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { DocumentProvider } from '@/editor/DocumentContext';

function getDocNameFromHash(): string {
  const match = window.location.hash.match(/^#doc=(.+)$/);
  return match ? decodeURIComponent(match[1]) : 'test-doc';
}

export function App() {
  const [docName, setDocName] = useState(getDocNameFromHash);

  useEffect(() => {
    const onHashChange = () => setDocName(getDocNameFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return (
    <DocumentProvider>
      <SidebarProvider className="h-screen overflow-hidden">
        <FileSidebar />
        <SidebarInset className="overflow-hidden h-[calc(100vh-var(--layout-inset-offset))]">
          <EditorPane key={docName} />
        </SidebarInset>
      </SidebarProvider>
    </DocumentProvider>
  );
}

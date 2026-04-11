import { EditorPane } from '@/components/EditorPane';
import { FileSidebar } from '@/components/FileSidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { DocumentProvider } from '@/editor/DocumentContext';

export function App() {
  return (
    <DocumentProvider>
      <SidebarProvider className="h-screen overflow-hidden">
        <FileSidebar />
        <SidebarInset className="overflow-hidden h-[calc(100vh-var(--layout-inset-offset))]">
          <EditorPane />
        </SidebarInset>
      </SidebarProvider>
    </DocumentProvider>
  );
}

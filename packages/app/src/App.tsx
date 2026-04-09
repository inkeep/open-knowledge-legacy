import { EditorPane } from '@/components/EditorPane';
import { FileSidebar } from '@/components/FileSidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

export function App() {
  return (
    <SidebarProvider className="h-screen overflow-hidden">
      <FileSidebar />
      <SidebarInset className="h-full overflow-hidden">
        <EditorPane />
      </SidebarInset>
    </SidebarProvider>
  );
}

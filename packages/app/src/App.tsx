import { useEffect } from 'react';
import { usePanelRef } from 'react-resizable-panels';
import { EditorPane } from '@/components/EditorPane';
import { FileSidebar } from '@/components/FileSidebar';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { SidebarInset, SidebarProvider, useSidebar } from '@/components/ui/sidebar';

// Inner layout — must be a child of SidebarProvider to call useSidebar.
function AppLayout() {
  const { open, setOpen } = useSidebar();
  const sidebarPanelRef = usePanelRef();

  // Drive the panel when sidebar state changes via SidebarTrigger or Cmd+B.
  useEffect(() => {
    const panel = sidebarPanelRef.current;
    if (!panel) return;
    if (open && panel.isCollapsed()) panel.expand();
    if (!open && !panel.isCollapsed()) panel.collapse();
  }, [open, sidebarPanelRef]);

  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full">
      <ResizablePanel
        panelRef={sidebarPanelRef}
        defaultSize="16rem"
        minSize="10rem"
        maxSize="30rem"
        collapsible
        collapsedSize="0rem"
        onResize={(size) => setOpen(size.inPixels > 0)}
      >
        <FileSidebar />
      </ResizablePanel>

      <ResizableHandle withHandle />

      <ResizablePanel className="min-w-0">
        <SidebarInset className="h-full overflow-hidden">
          <EditorPane />
        </SidebarInset>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

export function App() {
  return (
    <SidebarProvider className="h-screen overflow-hidden">
      <AppLayout />
    </SidebarProvider>
  );
}

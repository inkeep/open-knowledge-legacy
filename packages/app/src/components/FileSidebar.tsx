import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
} from '@/components/ui/sidebar';

export function FileSidebar() {
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
        <div className="flex flex-1 items-center justify-center py-8">
          <span className="select-none text-sm text-sidebar-foreground/30">No files yet.</span>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}

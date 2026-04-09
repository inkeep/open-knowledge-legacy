import {
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
} from '@/components/ui/sidebar';

export function FileSidebar() {
  return (
    <aside className="flex h-full flex-col overflow-hidden border-r bg-sidebar">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <span className="px-2 text-xs font-mono uppercase tracking-wider text-sidebar-foreground/50">
              Files
            </span>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <div className="flex flex-1 items-center justify-center py-8">
          <span className="select-none font-mono text-xs text-sidebar-foreground/30">
            No files yet
          </span>
        </div>
      </SidebarContent>
    </aside>
  );
}

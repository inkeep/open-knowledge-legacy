
import { ChevronsUpDown } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarMenuButton } from '@/components/ui/sidebar';
import type { OkDesktopBridge, RecentProjectEntry } from '@/lib/desktop-bridge-types';
import { SWITCH_PROJECT_LABEL_WITH_ELLIPSIS } from '@/lib/desktop-labels';
import { runWithToast as runWithToastBase } from '@/lib/error-state';

export const runWithToast = (
  fn: () => Promise<void>,
  fallback: string,
  toastApi?: { error(msg: string): void },
): Promise<void> => runWithToastBase(fn, fallback, toastApi, 'ProjectSwitcher');

interface ProjectSwitcherProps {
  bridge: OkDesktopBridge;
}

export function ProjectSwitcher({ bridge }: ProjectSwitcherProps) {
  const [recents, setRecents] = useState<RecentProjectEntry[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void runWithToast(async () => {
      const result = await bridge.project.listRecent();
      if (!cancelled) setRecents(result);
    }, 'Failed to load recent projects.');
    return () => {
      cancelled = true;
    };
  }, [open, bridge]);

  const openProject = (path: string) => {
    setOpen(false);
    void runWithToast(
      () => bridge.project.open({ path, target: 'new-window' }),
      'Failed to open project.',
    );
  };

  const onOpenFolder = () => {
    setOpen(false);
    void runWithToast(async () => {
      const path = await bridge.dialog.openFolder();
      if (!path) return;
      await bridge.project.open({ path, target: 'new-window' });
    }, 'Failed to open folder.');
  };

  const onSwitchProject = () => {
    setOpen(false);
    void runWithToast(() => bridge.navigator.open(), 'Failed to open Project Navigator.');
  };

  const currentPath = bridge.config.projectPath;
  const switchable = recents.filter((r) => r.path !== currentPath);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          className="justify-between text-sidebar-foreground/70"
          data-testid="project-switcher-trigger"
          title="Open project menu"
        >
          <span className="truncate">{bridge.config.projectName}</span>
          <ChevronsUpDown aria-hidden="true" className="opacity-60" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="top"
        className="min-w-[260px]"
        data-testid="project-switcher-menu"
      >
        <DropdownMenuLabel className="font-mono font-normal tracking-wide uppercase text-muted-foreground text-xs">
          Recent projects
        </DropdownMenuLabel>
        {switchable.length === 0 ? (
          <DropdownMenuLabel className="font-normal text-muted-foreground text-xs">
            No other recent projects.
          </DropdownMenuLabel>
        ) : (
          switchable.slice(0, 10).map((row) => (
            <DropdownMenuItem
              key={row.path}
              disabled={row.missing}
              onSelect={() => openProject(row.path)}
              className="flex flex-col items-start gap-0.5"
              data-testid={`project-switcher-recent-${row.path}`}
            >
              <span className="font-medium text-sm">{row.name}</span>
              <span className="max-w-[240px] truncate text-muted-foreground text-xs">
                {row.path}
                {row.missing ? '  (missing)' : ''}
              </span>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onOpenFolder} data-testid="project-switcher-open-folder">
          Open folder…
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onSwitchProject} data-testid="project-switcher-switch-project">
          {SWITCH_PROJECT_LABEL_WITH_ELLIPSIS}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

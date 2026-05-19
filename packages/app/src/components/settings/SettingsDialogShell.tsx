// biome-ignore-all lint/plugin/no-raw-html-interactive-element: pre-rule backlog — file uses raw <button> awaiting shadcn Button migration; tracked at https://github.com/inkeep/open-knowledge-legacy/blob/main/biome-plugins/README.md#no-raw-html-interactive-elementgrit

import { Suspense, useEffect, useState } from 'react';
import { SettingsDialogBodyLazy } from '@/components/settings/SettingsDialogBodyLazy';
import { SettingsDialogErrorBoundary } from '@/components/settings/SettingsDialogErrorBoundary';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useDocumentContext } from '@/editor/DocumentContext';
import { useConfigContext } from '@/lib/config-provider';
import { useClaudeDesktopIntegration } from '@/lib/handoff/use-claude-desktop-integration';
import { cn } from '@/lib/utils';

interface SidebarItem {
  id: string;
  label: string;
}

interface SidebarGroup {
  id: 'user' | 'project' | 'integrations';
  label: string;
  enabled: boolean;
  items: SidebarItem[];
}

interface SettingsDialogShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialogShell({ open, onOpenChange }: SettingsDialogShellProps) {
  const { collabUrl } = useDocumentContext();
  const { userBinding, userSynced, okignoreBinding, okignoreSynced } = useConfigContext();
  const { desktopPresent } = useClaudeDesktopIntegration();

  const [activeId, setActiveId] = useState<string>('preferences');
  useEffect(() => {
    if (open) setActiveId('preferences');
  }, [open]);

  const hasProject = collabUrl !== null;

  const groups: SidebarGroup[] = [
    {
      id: 'user',
      label: 'User',
      enabled: true,
      items: [{ id: 'preferences', label: 'Preferences' }],
    },
    {
      id: 'project',
      label: 'This project',
      enabled: hasProject,
      items: [
        { id: 'sync', label: 'Sync' },
        { id: 'project-templates', label: 'Templates' },
        { id: 'okignore', label: 'Ignore patterns' },
      ],
    },
    {
      id: 'integrations',
      label: 'Integrations',
      enabled: true,
      items: desktopPresent ? [{ id: 'claude-desktop', label: 'Claude Desktop' }] : [],
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="grid h-[700px] max-h-[calc(100dvh-4rem)] w-[900px] max-w-[calc(100%-2rem)] grid-cols-[220px_1fr] gap-0 overflow-hidden p-0 sm:max-w-[900px]"
        data-testid="settings-dialog"
      >
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">
          Configure user, project, and integration settings.
        </DialogDescription>
        <SettingsSidebar groups={groups} activeId={activeId} onSelect={setActiveId} />
        <div className="min-h-0 overflow-y-auto overscroll-contain subtle-scrollbar p-6">
          <SettingsDialogErrorBoundary>
            <Suspense fallback={<SettingsContentSkeleton />}>
              <SettingsDialogBodyLazy
                activeId={activeId}
                userBinding={userSynced ? userBinding : null}
                okignoreBinding={okignoreBinding}
                okignoreSynced={okignoreSynced}
              />
            </Suspense>
          </SettingsDialogErrorBoundary>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface SettingsSidebarProps {
  groups: SidebarGroup[];
  activeId: string;
  onSelect: (id: string) => void;
}

function SettingsSidebar({ groups, activeId, onSelect }: SettingsSidebarProps) {
  return (
    <nav
      aria-label="Settings sections"
      className="h-full overflow-y-auto overscroll-contain subtle-scrollbar border-r bg-muted/30 px-3 py-4"
    >
      {groups.map((group) => (
        <SettingsSidebarGroup
          key={group.id}
          group={group}
          activeId={activeId}
          onSelect={onSelect}
        />
      ))}
    </nav>
  );
}

function SettingsSidebarGroup({
  group,
  activeId,
  onSelect,
}: {
  group: SidebarGroup;
  activeId: string;
  onSelect: (id: string) => void;
}) {
  if (group.items.length === 0) return null;
  const headerId = `settings-group-${group.id}`;
  const captionId = `${headerId}-caption`;
  return (
    <div className="mb-4">
      <h3
        id={headerId}
        aria-describedby={group.enabled ? undefined : captionId}
        className={cn(
          'mb-1 px-2 text-xs font-semibold uppercase tracking-wide font-mono',
          group.enabled ? 'text-muted-foreground/80' : 'text-muted-foreground/50',
        )}
      >
        {group.label}
      </h3>
      {!group.enabled ? (
        <p id={captionId} className="mb-1 px-2 text-xs italic text-muted-foreground/60">
          Open a project to edit.
        </p>
      ) : null}
      <ul aria-labelledby={headerId} className="space-y-0.5">
        {group.items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              aria-current={activeId === item.id ? 'page' : undefined}
              aria-disabled={group.enabled ? undefined : true}
              aria-describedby={group.enabled ? undefined : captionId}
              tabIndex={group.enabled ? 0 : -1}
              disabled={!group.enabled}
              onClick={() => group.enabled && onSelect(item.id)}
              data-testid={`settings-sidebar-item-${item.id}`}
              className={cn(
                'w-full rounded px-2 py-1.5 text-left text-sm transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'disabled:cursor-not-allowed disabled:opacity-50',
                activeId === item.id && group.enabled
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-accent/50',
              )}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SettingsContentSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="space-y-3"
      data-testid="settings-content-skeleton"
    >
      <span className="sr-only">Loading settings</span>
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-4 w-64" />
      <div className="space-y-2">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    </div>
  );
}

// biome-ignore-all lint/plugin/no-raw-html-interactive-element: pre-rule backlog — file uses raw <button>/<input>/<textarea> awaiting shadcn migration; tracked at https://github.com/inkeep/open-knowledge-legacy/blob/main/biome-plugins/README.md#no-raw-html-interactive-elementgrit
import { MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { toast } from 'sonner';
import { DeleteConfirmationDialog } from '@/components/DeleteConfirmationDialog';
import { NewTemplateDialog } from '@/components/NewTemplateDialog';
import { TemplateEditDialog } from '@/components/TemplateEditDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { type TemplateMenuEntry, useFolderConfig } from '@/hooks/use-folder-config';
import { deleteTemplate } from '@/lib/folder-config-api';

interface TemplatesManagerConfig {
  scope: TemplateMenuEntry['scope'];
  title: string;
  description: ReactNode;
  emptyMessage: ReactNode;
  deleteWarning: string;
  itemNoun: string;
  badge: { label: string; variant: 'primary' | 'gray' };
  /** DOM id to wire `<h3>` ↔ `<section aria-labelledby>` for screen readers,
   *  matching the convention used by every other Settings section. */
  settingsId: string;
  /** Stable suffix for `data-testid` selectors (e.g., `'project-templates'` →
   *  `settings-project-templates-section`). */
  testIdPrefix: string;
}

export function TemplatesManagerSection({ config }: { config: TemplatesManagerConfig }) {
  const { state, refresh } = useFolderConfig('');
  const [editTarget, setEditTarget] = useState<TemplateMenuEntry | null>(null);
  const [deleteTargetEntry, setDeleteTargetEntry] = useState<TemplateMenuEntry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  const templates: TemplateMenuEntry[] =
    state.status === 'ready'
      ? (state.data.folder.templates_available ?? [])
          .filter((t) => t.scope === config.scope)
          .sort((a, b) => {
            const aLabel = (a.title ?? a.name).toLowerCase();
            const bLabel = (b.title ?? b.name).toLowerCase();
            return aLabel.localeCompare(bLabel);
          })
      : [];

  async function handleDelete(target: TemplateMenuEntry) {
    setDeleting(true);
    const result = await deleteTemplate('', target.name);
    setDeleting(false);
    if (!result.ok) {
      toast.error(`Delete failed: ${result.error}`);
      return;
    }
    toast.success(`Template "${target.name}" deleted`);
    setDeleteTargetEntry(null);
    refresh();
  }

  if (state.status === 'error') {
    return (
      <section
        className="space-y-3"
        aria-labelledby={config.settingsId}
        data-testid={`settings-${config.testIdPrefix}-section`}
      >
        <SectionHeader
          settingsId={config.settingsId}
          testIdPrefix={config.testIdPrefix}
          title={config.title}
          description={config.description}
          onNewClick={() => setNewOpen(true)}
        />
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          role="alert"
        >
          Failed to load {config.itemNoun}s: {state.message}
        </div>
        <NewTemplateDialog
          folderPath=""
          existingNames={new Set()}
          open={newOpen}
          onOpenChange={setNewOpen}
          onCreated={refresh}
        />
      </section>
    );
  }

  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <section
        className="space-y-3"
        aria-labelledby={config.settingsId}
        data-testid={`settings-${config.testIdPrefix}-section`}
      >
        <SectionHeader
          settingsId={config.settingsId}
          testIdPrefix={config.testIdPrefix}
          title={config.title}
          description={config.description}
        />
        <div className="rounded-lg border bg-card p-3 space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </section>
    );
  }

  return (
    <section
      className="space-y-3"
      aria-labelledby={config.settingsId}
      data-testid={`settings-${config.testIdPrefix}-section`}
    >
      <SectionHeader
        settingsId={config.settingsId}
        testIdPrefix={config.testIdPrefix}
        title={config.title}
        description={config.description}
        onNewClick={() => setNewOpen(true)}
      />
      <div className="rounded-lg border bg-card">
        {templates.length === 0 ? (
          <p
            className="px-3 py-4 text-sm text-muted-foreground"
            data-testid={`settings-${config.testIdPrefix}-empty`}
          >
            {config.emptyMessage}
          </p>
        ) : (
          <ul className="space-y-1 p-2" data-testid={`settings-${config.testIdPrefix}-list`}>
            {templates.map((tpl) => (
              <TemplateRow
                key={tpl.name}
                template={tpl}
                badge={config.badge}
                testIdPrefix={config.testIdPrefix}
                onEdit={() => setEditTarget(tpl)}
                onDelete={() => setDeleteTargetEntry(tpl)}
              />
            ))}
          </ul>
        )}
      </div>

      <NewTemplateDialog
        folderPath=""
        existingNames={new Set(templates.map((t) => t.name))}
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={refresh}
      />

      <TemplateEditDialog
        folderPath=""
        template={editTarget}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
        onSaved={refresh}
      />

      <Dialog
        open={!!deleteTargetEntry}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTargetEntry(null);
        }}
      >
        {deleteTargetEntry && (
          <DeleteConfirmationDialog
            itemName={`${config.itemNoun} "${deleteTargetEntry.name}"`}
            isSubmitting={deleting}
            onDelete={() => handleDelete(deleteTargetEntry)}
            customDescription={config.deleteWarning}
          />
        )}
      </Dialog>
    </section>
  );
}

function SectionHeader({
  settingsId,
  testIdPrefix,
  title,
  description,
  onNewClick,
}: {
  settingsId: string;
  testIdPrefix: string;
  title: string;
  description: ReactNode;
  onNewClick?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <h3 id={settingsId} className="text-base font-semibold">
          {title}
        </h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {onNewClick ? (
        <Button
          variant="outline"
          size="sm"
          className="font-mono uppercase shrink-0"
          onClick={onNewClick}
          data-testid={`settings-${testIdPrefix}-new-button`}
        >
          <Plus className="size-3.5" aria-hidden />
          New template
        </Button>
      ) : null}
    </div>
  );
}

function TemplateRow({
  template,
  badge,
  testIdPrefix,
  onEdit,
  onDelete,
}: {
  template: TemplateMenuEntry;
  badge: { label: string; variant: 'primary' | 'gray' };
  testIdPrefix: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const showName = template.title && template.title !== template.name;
  return (
    <li
      className="group flex items-center gap-2 rounded-md px-2 py-2 hover:bg-muted/50 text-sm"
      data-testid={`settings-${testIdPrefix}-row`}
      data-template-name={template.name}
    >
      <button
        type="button"
        onClick={onEdit}
        className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        data-testid={`settings-${testIdPrefix}-row-edit`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium truncate">{template.title ?? template.name}</span>
          {showName ? (
            <code className="font-mono text-xs text-muted-foreground shrink-0">
              {template.name}
            </code>
          ) : null}
          <Badge variant={badge.variant} className="ml-auto shrink-0 text-2xs">
            {badge.label}
          </Badge>
        </div>
        {template.description ? (
          <p className="text-sm text-muted-foreground truncate mt-0.5">{template.description}</p>
        ) : null}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
            aria-label={`Actions for ${template.title ?? template.name}`}
          >
            <MoreVertical className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={onEdit}
            data-testid={`settings-${testIdPrefix}-row-edit-menuitem`}
          >
            <Pencil aria-hidden />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={onDelete}
            data-testid={`settings-${testIdPrefix}-row-delete-menuitem`}
          >
            <Trash2 aria-hidden />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

// biome-ignore-all lint/plugin/no-raw-html-interactive-element: pre-rule backlog — file uses raw <button>/<input>/<textarea> awaiting shadcn migration; tracked at https://github.com/inkeep/open-knowledge-legacy/blob/main/biome-plugins/README.md#no-raw-html-interactive-elementgrit
import { FilePlus, MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { DeleteConfirmationDialog } from '@/components/DeleteConfirmationDialog';
import { NewItemDialog } from '@/components/NewItemDialog';
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
import type {
  AsyncState,
  FolderConfigHandle,
  FolderConfigSnapshot,
  TemplateMenuEntry,
} from '@/hooks/use-folder-config';
import { deleteTemplate } from '@/lib/folder-config-api';

interface Props {
  folderPath: string;
  state: AsyncState<FolderConfigSnapshot>;
  onChange: () => void;
  folderConfigHandle?: FolderConfigHandle;
}

export function TemplatesCard({ folderPath, state, onChange, folderConfigHandle }: Props) {
  const [editTarget, setEditTarget] = useState<TemplateMenuEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TemplateMenuEntry | null>(null);
  const [createFromTemplate, setCreateFromTemplate] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  async function handleDelete(target: TemplateMenuEntry) {
    setDeleting(true);
    const result = await deleteTemplate(target.source_folder, target.name);
    setDeleting(false);
    if (!result.ok) {
      toast.error(`Delete failed: ${result.error}`);
      return;
    }
    toast.success(`Template "${target.name}" deleted`);
    setDeleteTarget(null);
    onChange();
  }

  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <section className="rounded-lg border bg-card px-3 py-2.5 space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold uppercase font-mono tracking-wider text-muted-foreground">
            Templates available
          </h2>
        </div>
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </section>
    );
  }

  if (state.status === 'error') {
    return (
      <section
        className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        role="alert"
      >
        Failed to load templates: {state.message}
      </section>
    );
  }

  const templates = state.data.folder.templates_available ?? [];

  return (
    <>
      <section className="rounded-lg border bg-card">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-semibold uppercase font-mono tracking-wider text-muted-foreground">
              Templates available
            </h2>
            <Badge className="text-xs" variant="secondary">
              {templates.length}
            </Badge>
          </div>
          <Button
            variant="ghost"
            className="font-mono uppercase"
            size="sm"
            onClick={() => setNewOpen(true)}
          >
            <Plus className="size-3.5" aria-hidden />
            New template
          </Button>
        </div>
        <div className="px-3 py-2.5">
          {templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No templates resolve here. Add one to seed new docs in this folder.
            </p>
          ) : (
            <ul className="space-y-1">
              {templates.map((tpl) => (
                <TemplateRow
                  key={tpl.path}
                  template={tpl}
                  onCreate={() => setCreateFromTemplate(tpl.name)}
                  onEdit={() => setEditTarget(tpl)}
                  onDelete={() => setDeleteTarget(tpl)}
                />
              ))}
            </ul>
          )}
        </div>
      </section>
      <TemplateEditDialog
        folderPath={folderPath}
        template={editTarget}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
        onSaved={onChange}
      />
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        {deleteTarget && (
          <DeleteConfirmationDialog
            itemName={`template "${deleteTarget.name}"`}
            isSubmitting={deleting}
            onDelete={() => handleDelete(deleteTarget)}
            customDescription={`This permanently removes ${deleteTarget.path}. Agents that reference this template by name will fail until it's recreated or shadowed by an ancestor.${
              deleteTarget.scope === 'inherited'
                ? '\n\nThis template lives at an ancestor folder — deleting affects every folder under that ancestor that does not shadow it locally.'
                : ''
            }`}
          />
        )}
      </Dialog>
      <NewTemplateDialog
        folderPath={folderPath}
        existingNames={new Set(templates.map((t) => t.name))}
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={onChange}
      />
      <NewItemDialog
        open={createFromTemplate !== null}
        onOpenChange={(open) => {
          if (!open) setCreateFromTemplate(null);
        }}
        kind="file"
        initialDir={folderPath}
        initialTemplate={createFromTemplate ?? undefined}
        folderConfig={folderConfigHandle}
      />
    </>
  );
}

function TemplateRow({
  template,
  onCreate,
  onEdit,
  onDelete,
}: {
  template: TemplateMenuEntry;
  onCreate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const showName = template.title && template.title !== template.name;
  const label = template.title ?? template.name;
  return (
    <li className="group flex items-center gap-2 rounded-md px-2 py-2 hover:bg-muted/50 text-sm">
      <button
        type="button"
        onClick={onEdit}
        className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium truncate">{label}</span>
          {showName ? (
            <code className="font-mono text-xs text-muted-foreground shrink-0">
              {template.name}
            </code>
          ) : null}
          {template.scope === 'inherited' ? (
            <Badge variant="gray" className="ml-auto shrink-0 text-2xs">
              inherited
            </Badge>
          ) : null}
        </div>
        {template.description ? (
          <p className="text-sm text-muted-foreground truncate mt-0.5">{template.description}</p>
        ) : null}
      </button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="font-mono uppercase shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        onClick={onCreate}
        aria-label={`Create note from ${label}`}
      >
        <FilePlus className="size-3.5" aria-hidden />
        Create
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
            aria-label={`Actions for ${label}`}
          >
            <MoreVertical className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil aria-hidden />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            <Trash2 aria-hidden />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

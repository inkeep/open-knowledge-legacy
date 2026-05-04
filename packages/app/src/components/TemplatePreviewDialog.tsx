import { Check, Pencil, Sparkles, Trash2, X } from 'lucide-react';
import { Fragment, useState } from 'react';
import { toast } from 'sonner';
import { buildFrontmatterPayload, FrontmatterFields } from '@/components/FrontmatterFields';
import {
  formatFrontmatterValue,
  TemplateBodyTextarea,
  TemplateBodyView,
} from '@/components/TemplateBody';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  type TemplateDetail,
  type TemplateMenuEntry,
  useTemplate,
} from '@/hooks/use-folder-config';
import { deleteTemplate, saveTemplate } from '@/lib/folder-config-api';

interface Props {
  folderPath: string;
  template: TemplateMenuEntry | null;
  onOpenChange: (open: boolean) => void;
  onChange: () => void;
}

type Mode = 'preview' | 'edit' | 'confirm-delete';

export function TemplatePreviewDialog({ folderPath, template, onOpenChange, onChange }: Props) {
  const open = template !== null;

  function handleClose() {
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : handleClose())}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-foreground opacity-70" aria-hidden />
            {template?.title ?? template?.name ?? 'Template'}
          </DialogTitle>
          {template?.description ? (
            <DialogDescription>{template.description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <DialogBody className="overflow-y-auto subtle-scrollbar">
          {template ? (
            <TemplateBody
              key={`${template.source_folder}::${template.name}`}
              folderPath={folderPath}
              template={template}
              onChange={onChange}
              onClose={handleClose}
            />
          ) : null}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function TemplateBody({
  folderPath,
  template,
  onChange,
  onClose,
}: {
  folderPath: string;
  template: TemplateMenuEntry;
  onChange: () => void;
  onClose: () => void;
}) {
  const state = useTemplate(folderPath, template.name);
  const [mode, setMode] = useState<Mode>('preview');

  function handleSavedOrDeleted() {
    onChange();
    onClose();
  }

  if (state.status === 'loading' || state.status === 'idle') {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <p role="alert" className="text-sm text-destructive">
        Failed to load template: {state.message}
      </p>
    );
  }
  return (
    <ModeSwitch
      mode={mode}
      detail={state.data}
      onCancel={() => setMode('preview')}
      onEdit={() => setMode('edit')}
      onDelete={() => setMode('confirm-delete')}
      onCommit={handleSavedOrDeleted}
    />
  );
}

function ModeSwitch({
  mode,
  detail,
  onCancel,
  onEdit,
  onDelete,
  onCommit,
}: {
  mode: Mode;
  detail: TemplateDetail;
  onCancel: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCommit: () => void;
}) {
  if (mode === 'edit') {
    return <TemplateEditForm detail={detail} onCancel={onCancel} onSaved={onCommit} />;
  }
  if (mode === 'confirm-delete') {
    return <TemplateDeleteConfirm detail={detail} onCancel={onCancel} onDeleted={onCommit} />;
  }
  return <TemplatePreview detail={detail} onEdit={onEdit} onDelete={onDelete} />;
}

function ScopeAndPath({ detail }: { detail: TemplateDetail }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <Badge variant={detail.scope === 'local' ? 'secondary' : 'outline'}>{detail.scope}</Badge>
      <code className="font-mono">{detail.path}</code>
    </div>
  );
}

function TemplatePreview({
  detail,
  onEdit,
  onDelete,
}: {
  detail: TemplateDetail;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const fmEntries = Object.entries(detail.frontmatter);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant={detail.scope === 'local' ? 'secondary' : 'outline'}>{detail.scope}</Badge>
        <code className="font-mono">{detail.path}</code>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Pencil className="size-3.5" aria-hidden />
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="size-3.5" aria-hidden />
            Delete
          </Button>
        </div>
      </div>
      <div className="text-xs text-muted-foreground">
        Instantiate as{' '}
        <code className="font-mono">write_document(&#123; template: "{detail.name}" &#125;)</code>
      </div>
      {fmEntries.length > 0 ? (
        <section className="rounded-lg border bg-muted/30 p-4 space-y-2">
          <h3 className="text-xs font-semibold uppercase font-mono tracking-wider text-muted-foreground">
            Frontmatter
          </h3>
          <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-1 text-sm">
            {fmEntries.map(([key, value]) => (
              <Fragment key={key}>
                <dt className="font-mono text-xs text-muted-foreground self-start mt-1">{key}</dt>
                <dd className="font-mono text-xs leading-relaxed text-foreground/90 whitespace-pre-wrap break-words">
                  {formatFrontmatterValue(value)}
                </dd>
              </Fragment>
            ))}
          </dl>
        </section>
      ) : null}
      <TemplateBodyView body={detail.body} />
    </div>
  );
}

function TemplateEditForm({
  detail,
  onCancel,
  onSaved,
}: {
  detail: TemplateDetail;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const initialFm = detail.frontmatter as Record<string, unknown>;
  const [title, setTitle] = useState<string>(
    typeof initialFm.title === 'string' ? initialFm.title : '',
  );
  const [description, setDescription] = useState<string>(
    typeof initialFm.description === 'string' ? initialFm.description : '',
  );
  const [tags, setTags] = useState<string[]>(
    Array.isArray(initialFm.tags)
      ? initialFm.tags.filter((t): t is string => typeof t === 'string')
      : [],
  );
  const [body, setBody] = useState(detail.body);
  const [saving, setSaving] = useState(false);

  const titleInvalid = title.trim().length === 0;

  async function handleSave() {
    if (titleInvalid) {
      toast.error('Title is required.');
      return;
    }
    setSaving(true);
    const fm = buildFrontmatterPayload({ title, description, tags });
    const result = await saveTemplate({
      folder: detail.folder,
      name: detail.name,
      frontmatter: fm,
      body,
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(`Save failed: ${result.error}`);
      return;
    }
    if (result.warnings.length > 0) {
      toast.warning(result.warnings.join(' '));
    } else {
      toast.success('Template saved');
    }
    onSaved();
  }

  return (
    <div className="space-y-4">
      <ScopeAndPath detail={detail} />
      <FrontmatterFields
        title={title}
        description={description}
        tags={tags}
        onTitleChange={setTitle}
        onDescriptionChange={setDescription}
        onTagsChange={setTags}
        requireTitle
      />
      <TemplateBodyTextarea id="tpl-edit-body" value={body} onChange={setBody} disabled={saving} />
      <div className="flex items-center justify-end gap-2 border-t pt-3">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          <X className="size-3.5" aria-hidden />
          Cancel
        </Button>
        <Button size="sm" onClick={() => void handleSave()} disabled={saving || titleInvalid}>
          <Check className="size-3.5" aria-hidden />
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

function TemplateDeleteConfirm({
  detail,
  onCancel,
  onDeleted,
}: {
  detail: TemplateDetail;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    const result = await deleteTemplate(detail.folder, detail.name);
    setDeleting(false);
    if (!result.ok) {
      toast.error(`Delete failed: ${result.error}`);
      return;
    }
    toast.success(`Template "${detail.name}" deleted`);
    onDeleted();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-2">
        <h3 className="text-sm font-semibold flex items-center gap-2 text-destructive">
          <Trash2 className="size-4" aria-hidden />
          Delete template
        </h3>
        <p className="text-sm text-foreground/80">
          This permanently removes <code className="font-mono">{detail.path}</code>. Agents that
          reference this template by name (
          <code className="font-mono">write_document(&#123; template: "{detail.name}" &#125;)</code>
          ) will fail until it's recreated or shadowed by an ancestor.
        </p>
        {detail.scope === 'inherited' ? (
          <p className="text-sm text-foreground/80">
            This template lives at an <strong>ancestor</strong> folder. Deleting it will affect
            every folder under that ancestor that doesn't shadow it locally.
          </p>
        ) : null}
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={deleting}>
          <X className="size-3.5" aria-hidden />
          Cancel
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => void handleDelete()}
          disabled={deleting}
        >
          <Trash2 className="size-3.5" aria-hidden />
          {deleting ? 'Deleting…' : 'Delete permanently'}
        </Button>
      </div>
    </div>
  );
}

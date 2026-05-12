import { TemplateFormFields, useTemplateForm } from '@/components/TemplateForm';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  type TemplateDetail,
  type TemplateMenuEntry,
  type TemplateTarget,
  useTemplate,
} from '@/hooks/use-folder-config';

interface Props {
  folderPath: string;
  template: TemplateMenuEntry | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  /** Where the template lives. Defaults to `"project"` (folder-scoped); pass
      `"user"` for the Settings → User templates flow. */
  target?: TemplateTarget;
}

export function TemplateEditDialog({ folderPath, template, onOpenChange, onSaved, target }: Props) {
  const open = template !== null;

  function handleClose() {
    onOpenChange(false);
  }

  function handleSaved() {
    onSaved();
    handleClose();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : handleClose())}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Edit {template?.title ?? template?.name ?? 'Template'}
            {template?.scope === 'inherited' ? (
              <Badge variant="gray" className="text-2xs">
                inherited
              </Badge>
            ) : null}
            {template?.scope === 'user' ? (
              <Badge variant="primary" className="text-2xs">
                user
              </Badge>
            ) : null}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {template?.description ?? 'Edit template'}
          </DialogDescription>
        </DialogHeader>
        {template ? (
          <TemplateEditBody
            key={`${template.source_folder}::${template.name}`}
            folderPath={folderPath}
            template={template}
            onCancel={handleClose}
            onSaved={handleSaved}
            target={target}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function TemplateEditBody({
  folderPath,
  template,
  onCancel,
  onSaved,
  target,
}: {
  folderPath: string;
  template: TemplateMenuEntry;
  onCancel: () => void;
  onSaved: () => void;
  target?: TemplateTarget;
}) {
  const state = useTemplate(folderPath, template.name, target);

  if (state.status === 'loading' || state.status === 'idle') {
    return (
      <DialogBody className="overflow-y-auto subtle-scrollbar">
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </DialogBody>
    );
  }
  if (state.status === 'error') {
    return (
      <DialogBody className="overflow-y-auto subtle-scrollbar">
        <p role="alert" className="text-sm text-destructive">
          Failed to load template: {state.message}
        </p>
      </DialogBody>
    );
  }
  return (
    <TemplateEditForm detail={state.data} onCancel={onCancel} onSaved={onSaved} target={target} />
  );
}

function TemplateEditForm({
  detail,
  onCancel,
  onSaved,
  target,
}: {
  detail: TemplateDetail;
  onCancel: () => void;
  onSaved: () => void;
  target?: TemplateTarget;
}) {
  const fm = detail.frontmatter as Record<string, unknown>;
  const form = useTemplateForm({
    mode: 'edit',
    folderPath: detail.folder,
    initial: {
      name: detail.name,
      title: typeof fm.title === 'string' ? fm.title : '',
      description: typeof fm.description === 'string' ? fm.description : '',
      tags: Array.isArray(fm.tags) ? fm.tags.filter((t): t is string => typeof t === 'string') : [],
      body: detail.body,
    },
    onCommitted: onSaved,
    ...(target !== undefined ? { target } : {}),
  });

  return (
    <>
      <DialogBody className="overflow-y-auto subtle-scrollbar">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Instantiate as{' '}
            <code className="font-mono">
              write_document(&#123; template: "{detail.name}" &#125;)
            </code>
            . This template is located at <code className="font-mono">{detail.path}</code>.
          </p>
          <TemplateFormFields form={form} />
        </div>
      </DialogBody>
      <DialogFooter>
        <Button
          variant="outline"
          className="font-mono uppercase"
          onClick={onCancel}
          disabled={form.isSaving}
        >
          Cancel
        </Button>
        <Button onClick={() => void form.submit()} disabled={!form.canSubmit}>
          {form.isSaving ? 'Saving' : 'Save'}
        </Button>
      </DialogFooter>
    </>
  );
}

import { TemplateFormFields, useTemplateForm } from '@/components/TemplateForm';
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
import type { TemplateTarget } from '@/lib/folder-config-api';
import { templateFilePath } from '@/lib/folder-config-paths';

interface Props {
  folderPath: string;
  /** Names that already exist for this folder via the cascade — used to warn
      about shadowing an inherited template (creating a `local` of the same
      name supersedes the inherited one per closest-wins). */
  existingNames: ReadonlySet<string>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  /** Where the template lives. Defaults to `"project"` (folder-scoped); pass
      `"user"` for the Settings → User templates flow. */
  target?: TemplateTarget;
}

const EMPTY_INITIAL = {
  name: '',
  title: '',
  description: '',
  tags: [] as string[],
  body: '',
} as const;

const BODY_PLACEHOLDER = '## Summary\n\n(One-paragraph summary. Edit later via edit_document.)\n';

export function NewTemplateDialog({
  folderPath,
  existingNames,
  open,
  onOpenChange,
  onCreated,
  target,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
        {open ? (
          <Body
            folderPath={folderPath}
            existingNames={existingNames}
            onOpenChange={onOpenChange}
            onCreated={onCreated}
            target={target}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Body({
  folderPath,
  existingNames,
  onOpenChange,
  onCreated,
  target,
}: {
  folderPath: string;
  existingNames: ReadonlySet<string>;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  target?: TemplateTarget;
}) {
  const isUserTarget = target === 'user';
  const targetPath = isUserTarget
    ? '~/.ok/templates/<name>.md'
    : templateFilePath(folderPath, '<name>');

  const form = useTemplateForm({
    mode: 'create',
    folderPath,
    initial: EMPTY_INITIAL,
    existingNames,
    onCommitted: () => {
      onCreated();
      onOpenChange(false);
    },
    ...(target !== undefined ? { target } : {}),
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isUserTarget ? 'New user template' : 'New template'}</DialogTitle>
        <DialogDescription>
          Lands at <code className="font-mono">{targetPath}</code>.{' '}
          {isUserTarget
            ? 'Available across every OK project you open with this user account.'
            : 'Agents resolve it via leaf → root walk-up — closest-wins on filename collision.'}
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        <TemplateFormFields form={form} bodyPlaceholder={BODY_PLACEHOLDER} />
      </DialogBody>
      <DialogFooter>
        <Button
          variant="outline"
          className="font-mono uppercase"
          onClick={() => onOpenChange(false)}
          disabled={form.isSaving}
        >
          Cancel
        </Button>
        <Button onClick={() => void form.submit()} disabled={!form.canSubmit}>
          {form.isSaving ? 'Creating' : 'Create template'}
        </Button>
      </DialogFooter>
    </>
  );
}

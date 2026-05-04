import { Plus, Sparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { buildFrontmatterPayload, FrontmatterFields } from '@/components/FrontmatterFields';
import { TemplateBodyTextarea } from '@/components/TemplateBody';
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
import { Input } from '@/components/ui/input';
import { saveTemplate } from '@/lib/folder-config-api';
import { templateFilePath } from '@/lib/folder-config-paths';

interface Props {
  folderPath: string;
  existingNames: ReadonlySet<string>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

const NAME_RE = /^[A-Za-z0-9_-]+$/;

export function NewTemplateDialog({
  folderPath,
  existingNames,
  open,
  onOpenChange,
  onCreated,
}: Props) {
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setTitle('');
      setDescription('');
      setTags([]);
      setBody('');
    }
  }, [open]);

  const trimmedName = name.trim();
  const trimmedTitle = title.trim();
  const nameInvalid = trimmedName === '' || !NAME_RE.test(trimmedName);
  const nameShadows = !nameInvalid && existingNames.has(trimmedName);
  const titleInvalid = trimmedTitle === '';

  async function handleSave() {
    if (nameInvalid || titleInvalid) return;
    setSaving(true);
    const fm = buildFrontmatterPayload({ title, description, tags });
    const result = await saveTemplate({
      folder: folderPath,
      name: trimmedName,
      frontmatter: fm,
      body,
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(`Create failed: ${result.error}`);
      return;
    }
    if (result.warnings.length > 0) {
      toast.warning(result.warnings.join(' '));
    } else {
      toast.success(`Template "${trimmedName}" created`);
    }
    onCreated();
    onOpenChange(false);
  }

  const targetPath = templateFilePath(folderPath, trimmedName || '<name>');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-foreground opacity-70" aria-hidden />
            New template
          </DialogTitle>
          <DialogDescription>
            Lands at <code className="font-mono">{targetPath}</code>. Agents resolve it via leaf →
            root walk-up — closest-wins on filename collision.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="overflow-y-auto subtle-scrollbar space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="new-tpl-name"
              className="text-xs font-mono uppercase tracking-wider text-muted-foreground"
            >
              Name <span className="text-destructive">*</span>
            </label>
            <Input
              id="new-tpl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="article"
              disabled={saving}
              aria-invalid={trimmedName !== '' && nameInvalid}
            />
            {trimmedName !== '' && nameInvalid ? (
              <p className="text-xs text-destructive">
                Letters, digits, <code className="font-mono">_</code>,{' '}
                <code className="font-mono">-</code> only — no slashes, dots, spaces, or{' '}
                <code className="font-mono">.md</code>.
              </p>
            ) : nameShadows ? (
              <p className="text-xs text-yellow-600">
                A template named <code className="font-mono">{trimmedName}</code> already resolves
                here (likely inherited). Saving creates a <code className="font-mono">local</code>{' '}
                shadow that supersedes it for this folder.
              </p>
            ) : null}
          </div>
          <FrontmatterFields
            title={title}
            description={description}
            tags={tags}
            onTitleChange={setTitle}
            onDescriptionChange={setDescription}
            onTagsChange={setTags}
            requireTitle
          />
          <TemplateBodyTextarea
            id="new-tpl-body"
            value={body}
            onChange={setBody}
            disabled={saving}
            placeholder={'## Summary\n\n(One-paragraph summary. Edit later via edit_document.)\n'}
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
            <X className="size-3.5" aria-hidden />
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => void handleSave()}
            disabled={saving || nameInvalid || titleInvalid}
          >
            <Plus className="size-3.5" aria-hidden />
            {saving ? 'Creating…' : 'Create template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

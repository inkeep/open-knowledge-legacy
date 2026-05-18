import { useId, useState } from 'react';
import { toast } from 'sonner';
import { buildFrontmatterPayload, FrontmatterFields } from '@/components/FrontmatterFields';
import { TemplateBodyTextarea } from '@/components/TemplateBody';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { saveTemplate } from '@/lib/folder-config-api';

const NAME_RE = /^[A-Za-z0-9_-]+$/;

interface TemplateFormInitial {
  /** For `mode: 'create'` start empty; for `mode: 'edit'` the existing
   *  template name (which is immutable post-creation — the form hides the
   *  name field in edit mode). */
  name: string;
  title: string;
  description: string;
  tags: string[];
  body: string;
}

interface UseTemplateFormArgs {
  mode: 'create' | 'edit';
  folderPath: string;
  initial: TemplateFormInitial;
  /** Cascade names (create only) — surfaces a `local`-shadow warning when
   *  the typed name matches an inherited template per closest-wins. */
  existingNames?: ReadonlySet<string>;
  /** Called after a successful save. Caller closes the dialog / clears the
   *  preview / re-fetches as appropriate. */
  onCommitted: () => void;
}

interface TemplateFormState {
  mode: 'create' | 'edit';
  name: string;
  title: string;
  description: string;
  tags: string[];
  body: string;
  setName: (next: string) => void;
  setTitle: (next: string) => void;
  setDescription: (next: string) => void;
  setTags: (next: string[]) => void;
  setBody: (next: string) => void;
  isSaving: boolean;
  canSubmit: boolean;
  /** Computed flags surfaced for inline rendering (name regex, name
   *  shadowing an inherited template). Title-required rendering is owned
   *  by `FrontmatterFields` via `requireTitle`. */
  nameInvalid: boolean;
  nameShadows: boolean;
  trimmedName: string;
  submit: () => Promise<void>;
}

export function useTemplateForm({
  mode,
  folderPath,
  initial,
  existingNames,
  onCommitted,
}: UseTemplateFormArgs): TemplateFormState {
  const [name, setName] = useState(initial.name);
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [tags, setTags] = useState(initial.tags);
  const [body, setBody] = useState(initial.body);
  const [saving, setSaving] = useState(false);

  const trimmedName = name.trim();
  const trimmedTitle = title.trim();
  const nameInvalid = mode === 'create' && (trimmedName === '' || !NAME_RE.test(trimmedName));
  const nameShadows =
    mode === 'create' && !nameInvalid && (existingNames?.has(trimmedName) ?? false);
  const titleInvalid = trimmedTitle === '';
  const canSubmit = !saving && !nameInvalid && !titleInvalid;

  async function submit() {
    if (!canSubmit) return;
    setSaving(true);
    const fm = buildFrontmatterPayload({ title, description, tags });
    const result = await saveTemplate({
      folder: folderPath,
      name: mode === 'create' ? trimmedName : initial.name,
      frontmatter: fm,
      body,
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(`${mode === 'create' ? 'Create' : 'Save'} failed: ${result.error}`);
      return;
    }
    if (result.warnings.length > 0) {
      toast.warning(result.warnings.join(' '));
    } else if (mode === 'create') {
      toast.success(`Template "${trimmedName}" created`);
    } else {
      toast.success('Template saved');
    }
    onCommitted();
  }

  return {
    mode,
    name,
    title,
    description,
    tags,
    body,
    setName,
    setTitle,
    setDescription,
    setTags,
    setBody,
    isSaving: saving,
    canSubmit,
    nameInvalid,
    nameShadows,
    trimmedName,
    submit,
  };
}

interface TemplateFormFieldsProps {
  form: TemplateFormState;
  bodyPlaceholder?: string;
}

export function TemplateFormFields({ form, bodyPlaceholder }: TemplateFormFieldsProps) {
  const nameId = useId();
  const showNameError = form.mode === 'create' && form.trimmedName !== '' && form.nameInvalid;

  return (
    <FieldGroup>
      {form.mode === 'create' ? (
        <Field>
          <FieldLabel htmlFor={nameId}>
            Name<span className="text-destructive">*</span>
          </FieldLabel>
          <Input
            id={nameId}
            value={form.name}
            onChange={(e) => form.setName(e.target.value)}
            placeholder="article"
            disabled={form.isSaving}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            aria-invalid={showNameError}
          />
          {showNameError ? (
            <FieldError>
              Letters, digits, <code className="font-mono">_</code>,{' '}
              <code className="font-mono">-</code> only — no slashes, dots, spaces, or{' '}
              <code className="font-mono">.md</code>.
            </FieldError>
          ) : form.nameShadows ? (
            <FieldDescription className="text-yellow-600 dark:text-yellow-500">
              A template named <code className="font-mono">{form.trimmedName}</code> already
              resolves here (likely inherited). Saving creates a{' '}
              <code className="font-mono">local</code> shadow that supersedes it for this folder.
            </FieldDescription>
          ) : null}
        </Field>
      ) : null}
      <FrontmatterFields
        title={form.title}
        description={form.description}
        tags={form.tags}
        onTitleChange={form.setTitle}
        onDescriptionChange={form.setDescription}
        onTagsChange={form.setTags}
        requireTitle
        disabled={form.isSaving}
      />
      <TemplateBodyTextarea
        value={form.body}
        onChange={form.setBody}
        disabled={form.isSaving}
        placeholder={bodyPlaceholder}
      />
    </FieldGroup>
  );
}

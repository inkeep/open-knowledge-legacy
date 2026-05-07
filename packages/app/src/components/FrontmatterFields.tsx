import { useId, useState } from 'react';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { TagPillInput } from '@/components/ui/tag-pill-input';
import { Textarea } from '@/components/ui/textarea';

interface FrontmatterFieldsProps {
  title: string;
  description: string;
  tags: string[];
  onTitleChange: (next: string) => void;
  onDescriptionChange: (next: string) => void;
  onTagsChange: (next: string[]) => void;
  requireTitle?: boolean;
  disabled?: boolean;
}

export function FrontmatterFields({
  title,
  description,
  tags,
  onTitleChange,
  onDescriptionChange,
  onTagsChange,
  requireTitle = false,
  disabled = false,
}: FrontmatterFieldsProps) {
  const titleId = useId();
  const descriptionId = useId();
  const tagsId = useId();
  const [titleTouched, setTitleTouched] = useState(false);
  const titleInvalid = requireTitle && title.trim() === '';
  const showTitleError = titleInvalid && titleTouched;

  return (
    <>
      <Field>
        <FieldLabel htmlFor={titleId}>
          Title
          {requireTitle ? <span className="text-destructive">*</span> : null}
        </FieldLabel>
        <Input
          id={titleId}
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          onBlur={() => setTitleTouched(true)}
          disabled={disabled}
          aria-invalid={showTitleError}
        />
        {showTitleError ? (
          <FieldError>Required — title is the agent menu surface.</FieldError>
        ) : null}
      </Field>
      <Field>
        <FieldLabel htmlFor={descriptionId}>Description</FieldLabel>
        <Textarea
          id={descriptionId}
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          disabled={disabled}
          rows={2}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={tagsId}>Tags</FieldLabel>
        <TagPillInput id={tagsId} value={tags} onChange={onTagsChange} disabled={disabled} />
      </Field>
    </>
  );
}

export function buildFrontmatterPayload(args: {
  title: string;
  description: string;
  tags: string[];
}): { title?: string; description?: string; tags?: string[] } {
  const out: { title?: string; description?: string; tags?: string[] } = {};
  const trimmedTitle = args.title.trim();
  if (trimmedTitle) out.title = trimmedTitle;
  const trimmedDescription = args.description.trim();
  if (trimmedDescription) out.description = trimmedDescription;
  const cleanedTags = args.tags.map((t) => t.trim()).filter((t) => t.length > 0);
  if (cleanedTags.length > 0) out.tags = cleanedTags;
  return out;
}

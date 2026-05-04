import { ListWidget, TextareaWidget, TextWidget } from '@/components/PropertyWidgets';

interface FrontmatterFieldsProps {
  title: string;
  description: string;
  tags: string[];
  onTitleChange: (next: string) => void;
  onDescriptionChange: (next: string) => void;
  onTagsChange: (next: string[]) => void;
  requireTitle?: boolean;
}

export function FrontmatterFields({
  title,
  description,
  tags,
  onTitleChange,
  onDescriptionChange,
  onTagsChange,
  requireTitle = false,
}: FrontmatterFieldsProps) {
  const titleInvalid = requireTitle && title.trim() === '';
  return (
    <div className="space-y-0.5">
      <FieldRow label="Title" required={requireTitle} invalid={titleInvalid}>
        <TextWidget keyName="title" value={title} onCommit={onTitleChange} />
      </FieldRow>
      {titleInvalid ? (
        <p className="pl-32 pr-2 text-[10px] text-destructive">
          Required — title is the agent menu surface.
        </p>
      ) : null}
      <FieldRow label="Description" alignTop>
        <TextareaWidget keyName="description" value={description} onCommit={onDescriptionChange} />
      </FieldRow>
      <FieldRow label="Tags">
        <ListWidget keyName="tags" value={tags} onCommit={onTagsChange} />
      </FieldRow>
    </div>
  );
}

function FieldRow({
  label,
  required = false,
  invalid = false,
  alignTop = false,
  children,
}: {
  label: string;
  required?: boolean;
  invalid?: boolean;
  alignTop?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex gap-1 py-0.5 ${alignTop ? 'items-start' : 'items-center'}`}
      data-invalid={invalid || undefined}
    >
      <div
        className={`w-32 shrink-0 px-2 text-sm font-normal text-muted-foreground ${
          alignTop ? 'pt-1.5' : ''
        }`}
      >
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
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

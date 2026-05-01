import type { Config, FolderRule } from '@inkeep/open-knowledge-core';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import {
  type ControllerRenderProps,
  type FieldPath,
  type UseFormReturn,
  useFieldArray,
} from 'react-hook-form';
import { Button } from '@/components/ui/button';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { TagPillInput } from '@/components/ui/tag-pill-input';
import type { SettingsScope } from '@/lib/use-settings-route';
import type { SlotForwardedProps } from './slot-forwarded-props';

interface FoldersSectionProps {
  form: UseFormReturn<Config>;
  commitField: (name: FieldPath<Config>) => boolean;
  scope: SettingsScope;
  flashedPath: string | null;
}

const FOLDERS_PATH = 'folders' as FieldPath<Config>;

export function FoldersSection({ form, commitField, scope, flashedPath }: FoldersSectionProps) {
  const { fields, append, remove, move } = useFieldArray({
    control: form.control,
    name: 'folders' as never,
  }) as unknown as ReturnType<typeof useFieldArray<{ folders: FolderRule[] }, 'folders'>>;

  const runCommitIfDirty = (): boolean => {
    if (!form.getFieldState(FOLDERS_PATH).isDirty) return true;
    return commitField(FOLDERS_PATH);
  };

  const runCommit = (): boolean => commitField(FOLDERS_PATH);

  const handleAdd = () => {
    append({ match: '', frontmatter: {} }, { shouldFocus: true });
  };

  const handleRemove = (i: number) => {
    const remaining = fields.length - 1;
    const nextRowIndex = Math.min(i, remaining - 1);
    remove(i);
    runCommit();
    queueMicrotask(() => {
      const root = document.querySelector('[data-testid="settings-folders-section"]');
      if (!root) return;
      if (remaining > 0) {
        const next = root.querySelector<HTMLElement>(
          `[data-folder-row="${nextRowIndex}"] [data-folder-action="remove"]`,
        );
        next?.focus();
      } else {
        root.querySelector<HTMLElement>('[data-folder-action="add"]')?.focus();
      }
    });
  };

  const handleMoveUp = (i: number) => {
    if (i === 0) return;
    move(i, i - 1);
    runCommit();
  };

  const handleMoveDown = (i: number) => {
    if (i >= fields.length - 1) return;
    move(i, i + 1);
    runCommit();
  };

  return (
    <section
      aria-labelledby="settings-folders-title"
      className="space-y-3"
      data-testid="settings-folders-section"
      data-scope={scope}
    >
      <div className="space-y-1">
        <h2 id="settings-folders-title" className="text-base font-semibold">
          Folders
        </h2>
        <p className="text-sm text-muted-foreground">
          Default frontmatter applied to documents matching glob patterns. Order matters: later
          rules override earlier ones.
        </p>
      </div>

      {fields.length === 0 ? (
        <p className="rounded border border-dashed border-muted px-3 py-4 text-center text-xs text-muted-foreground">
          No folder rules yet. Add one to apply default frontmatter to a directory.
        </p>
      ) : (
        // biome-ignore lint/a11y/noRedundantRoles: Tailwind v4 preflight resets `list-style: none`, which strips the implicit list role in Safari VoiceOver. Tailwind docs explicitly recommend `role="list"` to restore positional announcements ("item 2 of 5").
        <ol className="space-y-3" role="list">
          {fields.map((entry, i) => (
            <FolderRow
              key={entry.id}
              index={i}
              total={fields.length}
              form={form}
              flashedPath={flashedPath}
              onCommitIfDirty={runCommitIfDirty}
              onRemove={handleRemove}
              onMoveUp={handleMoveUp}
              onMoveDown={handleMoveDown}
            />
          ))}
        </ol>
      )}

      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAdd}
          data-folder-action="add"
        >
          <Plus className="size-3.5" aria-hidden="true" />
          Add folder rule
        </Button>
      </div>
    </section>
  );
}

interface FolderRowProps {
  index: number;
  total: number;
  form: UseFormReturn<Config>;
  flashedPath: string | null;
  onCommitIfDirty: () => boolean;
  onRemove: (i: number) => void;
  onMoveUp: (i: number) => void;
  onMoveDown: (i: number) => void;
}

function FolderRow({
  index,
  total,
  form,
  flashedPath,
  onCommitIfDirty,
  onRemove,
  onMoveUp,
  onMoveDown,
}: FolderRowProps) {
  'use no memo';
  const matchPath = `folders.${index}.match` as FieldPath<Config>;
  const titlePath = `folders.${index}.frontmatter.title` as FieldPath<Config>;
  const descriptionPath = `folders.${index}.frontmatter.description` as FieldPath<Config>;
  const tagsPath = `folders.${index}.frontmatter.tags` as FieldPath<Config>;

  const currentMatch = form.getValues(matchPath);
  const removeLabel =
    typeof currentMatch === 'string' && currentMatch.trim()
      ? `Remove folder rule ${currentMatch}`
      : 'Remove untitled folder rule';

  return (
    <li data-folder-row={index} className="space-y-3 rounded-md border bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        {/* Visual row number; the <ol>+<li> structure already announces position to AT. */}
        <span className="text-xs font-mono text-muted-foreground" aria-hidden="true">
          #{index + 1}
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            onClick={() => onMoveUp(index)}
            disabled={index === 0}
            aria-label={`Move folder rule ${index + 1} up`}
          >
            <ArrowUp className="size-3.5" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            onClick={() => onMoveDown(index)}
            disabled={index >= total - 1}
            aria-label={`Move folder rule ${index + 1} down`}
          >
            <ArrowDown className="size-3.5" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={() => onRemove(index)}
            aria-label={removeLabel}
            data-folder-action="remove"
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <FormField
        control={form.control}
        name={matchPath}
        render={({ field: ctl }) => {
          const isFlashed = flashedPath === matchPath;
          const wrapperClass = `space-y-1 ${isFlashed ? 'animate-settings-flash' : ''}`;
          return (
            <FormItem className={wrapperClass} data-field={matchPath}>
              <FormLabel className="text-sm font-medium">Match</FormLabel>
              <FormDescription className="text-xs text-muted-foreground">
                Glob pattern (e.g. <code className="font-mono">specs/**</code>).
              </FormDescription>
              <FormControl>
                <Input
                  value={typeof ctl.value === 'string' ? ctl.value : ''}
                  ref={ctl.ref}
                  onChange={(e) => ctl.onChange(e.target.value)}
                  onBlur={() => {
                    ctl.onBlur();
                    onCommitIfDirty();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      onCommitIfDirty();
                    }
                  }}
                  className="h-8 text-sm"
                  placeholder="specs/**"
                />
              </FormControl>
              <FormMessage data-field-error={matchPath} />
            </FormItem>
          );
        }}
      />

      <FormField
        control={form.control}
        name={titlePath}
        render={({ field: ctl }) => (
          <FormItem
            className={`space-y-1 ${flashedPath === titlePath ? 'animate-settings-flash' : ''}`}
            data-field={titlePath}
          >
            <FormLabel className="text-sm font-medium">Title</FormLabel>
            <FormDescription className="text-xs text-muted-foreground">
              Default <code className="font-mono">title</code> frontmatter for matched docs.
            </FormDescription>
            <FormControl>
              <Input
                value={typeof ctl.value === 'string' ? ctl.value : ''}
                ref={ctl.ref}
                onChange={(e) => ctl.onChange(e.target.value)}
                onBlur={() => {
                  ctl.onBlur();
                  onCommitIfDirty();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onCommitIfDirty();
                  }
                }}
                className="h-8 text-sm"
              />
            </FormControl>
            <FormMessage data-field-error={titlePath} />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name={descriptionPath}
        render={({ field: ctl }) => (
          <FormItem
            className={`space-y-1 ${flashedPath === descriptionPath ? 'animate-settings-flash' : ''}`}
            data-field={descriptionPath}
          >
            <FormLabel className="text-sm font-medium">Description</FormLabel>
            <FormDescription className="text-xs text-muted-foreground">
              Default <code className="font-mono">description</code> frontmatter for matched docs.
            </FormDescription>
            <FormControl>
              <Input
                value={typeof ctl.value === 'string' ? ctl.value : ''}
                ref={ctl.ref}
                onChange={(e) => ctl.onChange(e.target.value)}
                onBlur={() => {
                  ctl.onBlur();
                  onCommitIfDirty();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onCommitIfDirty();
                  }
                }}
                className="h-8 text-sm"
              />
            </FormControl>
            <FormMessage data-field-error={descriptionPath} />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name={tagsPath}
        render={({ field: ctl }) => (
          <FormItem
            className={`space-y-1 ${flashedPath === tagsPath ? 'animate-settings-flash' : ''}`}
            data-field={tagsPath}
          >
            <FormLabel className="text-sm font-medium">Tags</FormLabel>
            <FormDescription className="text-xs text-muted-foreground">
              Default tags applied to matched docs (unioned with file-level tags).
            </FormDescription>
            <FormControl>
              <TagsField ctl={ctl} onCommit={onCommitIfDirty} />
            </FormControl>
            <FormMessage data-field-error={tagsPath} />
          </FormItem>
        )}
      />
    </li>
  );
}

interface TagsFieldProps {
  ctl: ControllerRenderProps<Config, FieldPath<Config>>;
  onCommit: () => boolean;
}

function TagsField({ ctl, onCommit, ...slotForwarded }: TagsFieldProps & SlotForwardedProps) {
  'use no memo';
  const value = Array.isArray(ctl.value) ? (ctl.value as string[]) : [];
  return (
    <TagPillInput
      {...slotForwarded}
      ref={ctl.ref}
      value={value}
      onChange={ctl.onChange}
      onBlur={() => {
        ctl.onBlur();
        onCommit();
      }}
    />
  );
}

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { FrontmatterType, FrontmatterValue } from '@inkeep/open-knowledge-core';
import { AlertTriangle, GripVertical, Trash2, X } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import {
  BooleanWidget,
  DateWidget,
  ListWidget,
  NumberWidget,
  TextWidget,
  TypeIconButton,
} from '@/components/PropertyWidgets';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface AddDraft {
  name: string;
  type: FrontmatterType;
  value: FrontmatterValue;
  error: string | null;
}

export interface RenameDraft {
  key: string;
  draft: string;
  error: string | null;
}

interface FrontmatterRowRenameApi {
  state: RenameDraft | null;
  onBegin: () => void;
  onChangeDraft: (next: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}

interface FrontmatterRowProps {
  keyName: string;
  value: FrontmatterValue;
  declared: FrontmatterType;
  error?: string | null;
  resetCounter?: number;
  sortableId?: string;
  rename?: FrontmatterRowRenameApi;
  isDuplicate?: boolean;
  badge?: ReactNode;
  onCommit: (next: FrontmatterValue) => void;
  onChangeType: (next: FrontmatterType) => void;
  onRemove?: () => void;
}

export function FrontmatterRow({
  keyName,
  value,
  declared,
  error,
  resetCounter = 0,
  sortableId,
  rename,
  isDuplicate = false,
  badge,
  onCommit,
  onChangeType,
  onRemove,
}: FrontmatterRowProps) {
  return (
    <SortableShell
      sortableId={sortableId}
      keyName={keyName}
      declared={declared}
      error={error}
      isDuplicate={isDuplicate}
    >
      {(dragHandle) => (
        <>
          <div className="flex items-center gap-1">
            {dragHandle}
            <TypeIconButton keyName={keyName} type={declared} onChangeType={onChangeType} />
            <div className="w-32 shrink-0">
              {rename?.state ? (
                <RenameInput
                  keyName={keyName}
                  draft={rename.state.draft}
                  error={rename.state.error}
                  onChangeDraft={rename.onChangeDraft}
                  onCommit={rename.onCommit}
                  onCancel={rename.onCancel}
                />
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  data-testid="property-name-button"
                  data-key={keyName}
                  onClick={rename?.onBegin}
                  disabled={!rename}
                  className="block h-7 w-full truncate px-2 py-0.5 text-left text-sm rounded-sm font-normal text-muted-foreground hover:bg-transparent hover:text-foreground disabled:opacity-100 disabled:cursor-default"
                >
                  {keyName}
                </Button>
              )}
            </div>
            {badge ? <div className="shrink-0">{badge}</div> : null}
            {isDuplicate ? (
              <span
                data-testid="property-duplicate-marker"
                data-key={keyName}
                title={`Duplicate name "${keyName}"`}
                className="flex size-4 items-center justify-center text-amber-600"
              >
                <AlertTriangle className="size-3.5" />
              </span>
            ) : null}
            <div className="flex-1">
              <Widget
                key={`widget-${resetCounter}`}
                keyName={keyName}
                value={value}
                widgetType={declared}
                onCommit={onCommit}
              />
            </div>
            {onRemove ? (
              <Button
                type="button"
                data-testid="property-remove-button"
                data-key={keyName}
                aria-label={`Remove ${keyName}`}
                onClick={onRemove}
                variant="ghost"
                size="icon-sm"
                className="flex shrink-0 items-center justify-center rounded text-muted-foreground/0 hover:bg-muted hover:text-foreground focus-visible:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:text-muted-foreground"
              >
                <Trash2 className="size-3.5" />
              </Button>
            ) : null}
          </div>
          {error ? (
            <div
              role="alert"
              data-testid="property-error"
              data-key={keyName}
              className="pl-9 text-[10px] text-destructive"
            >
              {error}
            </div>
          ) : null}
        </>
      )}
    </SortableShell>
  );
}

function SortableShell({
  sortableId,
  keyName,
  declared,
  error,
  isDuplicate,
  children,
}: {
  sortableId: string | undefined;
  keyName: string;
  declared: FrontmatterType;
  error?: string | null;
  isDuplicate: boolean;
  children: (dragHandle: ReactNode) => ReactNode;
}) {
  if (sortableId) {
    return (
      <SortableRowBody
        sortableId={sortableId}
        keyName={keyName}
        declared={declared}
        error={error}
        isDuplicate={isDuplicate}
      >
        {children}
      </SortableRowBody>
    );
  }
  return (
    <div
      className="group py-0.5"
      data-testid="property-row"
      data-key={keyName}
      data-widget-type={declared}
      data-error={error ?? undefined}
      data-duplicate={isDuplicate || undefined}
    >
      {children(null)}
    </div>
  );
}

function SortableRowBody({
  sortableId,
  keyName,
  declared,
  error,
  isDuplicate,
  children,
}: {
  sortableId: string;
  keyName: string;
  declared: FrontmatterType;
  error?: string | null;
  isDuplicate: boolean;
  children: (dragHandle: ReactNode) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sortableId,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
    zIndex: isDragging ? 1 : undefined,
  };
  const dragHandle = (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      data-testid="property-drag-handle"
      data-key={keyName}
      aria-label={`Drag ${keyName} to reorder`}
      {...attributes}
      {...listeners}
      className="h-7 w-4 shrink-0 cursor-grab touch-none px-0 text-muted-foreground/0 hover:text-foreground focus-visible:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing group-hover:text-muted-foreground/60"
    >
      <GripVertical className="size-3.5" />
    </Button>
  );
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group py-0.5"
      data-testid="property-row"
      data-key={keyName}
      data-widget-type={declared}
      data-error={error ?? undefined}
      data-duplicate={isDuplicate || undefined}
      data-dragging={isDragging || undefined}
    >
      {children(dragHandle)}
    </div>
  );
}

interface RenameInputProps {
  keyName: string;
  draft: string;
  error: string | null;
  onChangeDraft: (next: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}

function RenameInput({
  keyName,
  draft,
  error,
  onChangeDraft,
  onCommit,
  onCancel,
}: RenameInputProps) {
  const errorId = error ? `property-rename-error-${keyName}` : undefined;
  return (
    <div>
      <Input
        data-testid="property-name-rename-input"
        data-key={keyName}
        type="text"
        value={draft}
        autoFocus
        aria-label={`Rename ${keyName}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        onChange={(e) => onChangeDraft(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onCommit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
        className="h-7 border-transparent bg-transparent dark:bg-transparent px-2 text-sm shadow-none focus-visible:border-transparent focus-visible:bg-muted focus-visible:ring-0 rounded-sm dark:focus-visible:bg-muted"
      />
      {error ? (
        <div
          id={errorId}
          data-testid="property-name-rename-error"
          className="text-[10px] text-destructive"
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}

interface AddPropertyRowProps {
  draft: AddDraft;
  onChangeName: (next: string) => void;
  onChangeType: (next: FrontmatterType) => void;
  onChangeValue: (next: FrontmatterValue) => void;
  onCommit: () => void;
  onCancel: () => void;
}

export function AddPropertyRow({
  draft,
  onChangeName,
  onChangeType,
  onChangeValue,
  onCommit,
  onCancel,
}: AddPropertyRowProps) {
  const errorId = draft.error ? 'add-property-error-id' : undefined;
  return (
    <div
      className="mt-1 rounded border border-dashed bg-background/40 p-1"
      data-testid="add-property-row"
    >
      <div className="flex items-center gap-1">
        <TypeIconButton keyName="__add__" type={draft.type} onChangeType={onChangeType} />
        <Input
          data-testid="add-property-name-input"
          type="text"
          value={draft.name}
          autoFocus
          placeholder="Property name"
          aria-label="New property name"
          aria-invalid={draft.error ? true : undefined}
          aria-describedby={errorId}
          onChange={(e) => onChangeName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onCommit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onCancel();
            }
          }}
          className="h-7 w-32 border-transparent bg-transparent px-2 text-sm shadow-none placeholder:text-muted-foreground/60 focus-visible:border-transparent focus-visible:bg-muted focus-visible:ring-0 rounded-sm"
        />
        <div className="flex-1">
          <Widget
            keyName="__add__"
            value={draft.value}
            widgetType={draft.type}
            onCommit={onChangeValue}
          />
        </div>

        <Button
          type="button"
          data-testid="add-property-commit"
          onClick={onCommit}
          size="sm"
          className="rounded bg-primary text-xs text-primary-foreground hover:bg-primary/90"
        >
          Add
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          data-testid="add-property-cancel"
          onClick={onCancel}
          aria-label="Cancel"
          className="rounded px-1 py-0.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </Button>
      </div>
      {draft.error ? (
        <div
          id={errorId}
          role="alert"
          data-testid="add-property-error"
          className="mt-0.5 pl-7 text-[10px] text-destructive"
        >
          {draft.error}
        </div>
      ) : null}
    </div>
  );
}

interface WidgetProps {
  keyName: string;
  value: FrontmatterValue;
  widgetType: FrontmatterType;
  onCommit: (next: FrontmatterValue) => void;
}

function Widget({ keyName, value, widgetType, onCommit }: WidgetProps) {
  if (widgetType === 'list') {
    const arr = Array.isArray(value) ? value : [];
    return <ListWidget keyName={keyName} value={arr} onCommit={onCommit} />;
  }
  if (widgetType === 'boolean') {
    const bool = typeof value === 'boolean' ? value : false;
    return <BooleanWidget keyName={keyName} value={bool} onCommit={onCommit} />;
  }
  if (widgetType === 'number') {
    const num = typeof value === 'number' ? value : 0;
    return <NumberWidget keyName={keyName} value={num} onCommit={onCommit} />;
  }
  if (widgetType === 'date') {
    const str = typeof value === 'string' ? value : '';
    return <DateWidget keyName={keyName} value={str} onCommit={onCommit} />;
  }
  const str =
    typeof value === 'string' ? value : Array.isArray(value) ? value.join(', ') : String(value);
  return <TextWidget keyName={keyName} value={str} onCommit={onCommit} />;
}

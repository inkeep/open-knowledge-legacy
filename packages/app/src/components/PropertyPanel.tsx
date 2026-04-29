import type { HocuspocusProvider } from '@hocuspocus/provider';
import {
  type FrontmatterMap,
  type FrontmatterType,
  type FrontmatterValue,
  getFrontmatterMap,
  inferType,
} from '@inkeep/open-knowledge-core';
import { ChevronRight, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useProperties } from '@/components/PropertyContext';
import {
  BooleanWidget,
  coerceValue,
  DateWidget,
  ListWidget,
  NumberWidget,
  resolveWidgetType,
  TextWidget,
  TypeIconButton,
} from '@/components/PropertyWidgets';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';

interface PropertyPanelProps {
  provider: HocuspocusProvider;
}

const DEFAULT_VALUE_FOR_TYPE: Record<FrontmatterType, FrontmatterValue> = {
  text: '',
  number: 0,
  boolean: false,
  date: '',
  list: [],
};

export function PropertyPanel({ provider }: PropertyPanelProps) {
  const map = useFrontmatterMap(provider);
  const [collapsed, setCollapsed] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, FrontmatterType>>({});
  const [adding, setAdding] = useState<AddDraft | null>(null);
  const [renaming, setRenaming] = useState<RenameDraft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [resetCounters, setResetCounters] = useState<Record<string, number>>({});
  const docName = provider.configuration.name ?? '';

  async function commitPatch(
    patch: Record<string, FrontmatterValue | null>,
    op: FormOp,
  ): Promise<PatchResult> {
    try {
      const res = await fetch('/api/frontmatter-patch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docName, patch, source: 'form', op }),
      });
      if (res.ok) return { ok: true, status: res.status };
      let parsed: { error?: unknown; fieldErrors?: unknown } = {};
      try {
        parsed = (await res.json()) as { error?: unknown; fieldErrors?: unknown };
      } catch {}
      const error = typeof parsed.error === 'string' ? parsed.error : undefined;
      const fieldErrors =
        parsed.fieldErrors && typeof parsed.fieldErrors === 'object'
          ? (parsed.fieldErrors as Record<string, string>)
          : undefined;
      console.warn('[PropertyPanel] frontmatter-patch failed', {
        status: res.status,
        error,
      });
      return { ok: false, status: res.status, error, fieldErrors };
    } catch (err) {
      console.warn('[PropertyPanel] frontmatter-patch network error', { err });
      return { ok: false, status: 0, error: 'Network error' };
    }
  }

  function clearError(key: string) {
    setErrors((prev) => {
      if (!Object.hasOwn(prev, key)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function setErrorForKeys(result: PatchResult, keys: readonly string[]) {
    if (result.ok) return;
    const generic = result.error ?? `HTTP ${result.status || 'network'}`;
    const fieldErrors = result.fieldErrors ?? {};
    setErrors((prev) => {
      const next = { ...prev };
      for (const key of keys) {
        next[key] = fieldErrors[key] ?? generic;
      }
      return next;
    });
    setResetCounters((prev) => {
      const next = { ...prev };
      for (const key of keys) {
        next[key] = (next[key] ?? 0) + 1;
      }
      return next;
    });
  }

  async function commitProperty(key: string, value: FrontmatterValue) {
    clearError(key);
    const result = await commitPatch({ [key]: value }, 'set');
    setErrorForKeys(result, [key]);
  }

  async function removeProperty(key: string) {
    clearError(key);
    const result = await commitPatch({ [key]: null }, 'remove');
    setErrorForKeys(result, [key]);
  }

  async function renameProperty(oldKey: string, newKey: string): Promise<PatchResult> {
    if (oldKey === newKey) return { ok: true, status: 200 };
    if (Object.hasOwn(map, newKey)) {
      return { ok: false, status: 0, error: `Property "${newKey}" already exists` };
    }
    const value = map[oldKey];
    if (value === undefined) {
      return { ok: false, status: 0, error: `Property "${oldKey}" not found` };
    }
    return commitPatch({ [oldKey]: null, [newKey]: value }, 'rename');
  }

  function setType(key: string, nextType: FrontmatterType) {
    const current = map[key];
    if (current === undefined) return;
    setOverrides((prev) => ({ ...prev, [key]: nextType }));
    const coerced = coerceValue(current, nextType);
    if (!sameValue(current, coerced)) {
      void commitProperty(key, coerced);
    }
  }

  function beginAdd() {
    setAdding({ name: '', type: 'text', value: '', error: null });
    setCollapsed(false);
  }

  // Cross-tree signal from the toolbar's "Add Properties" button. The button
  // calls `requestAddProperty(docName)` which bumps the per-doc counter; we
  // react to each tick by opening the AddPropertyRow form.
  //
  // Counter (not boolean) so consecutive clicks still fire when the user
  // cancels the previous add without committing.
  //
  // Each PropertyPanel only watches its own doc's counter, so hidden Activity
  // panels for other docs see no signal change — no ghost-state leak (the
  // bug the prior window-event approach had before scoping was added).
  const { addPropertySignal, clearAddProperty } = useProperties();
  const addSignal = addPropertySignal.get(docName) ?? 0;
  useEffect(() => {
    if (addSignal > 0) {
      setAdding({ name: '', type: 'text', value: '', error: null });
      setCollapsed(false);
    }
  }, [addSignal]);
  // Drop the per-doc entry on unmount so a re-mount (e.g., after pool
  // eviction) starts fresh at 0 and doesn't replay the last counter value
  // on cold mount.
  useEffect(() => {
    return () => clearAddProperty(docName);
  }, [docName, clearAddProperty]);

  function changeAddType(nextType: FrontmatterType) {
    setAdding((prev) => {
      if (!prev) return prev;
      const defaultValue =
        nextType === 'date'
          ? new Date().toISOString().slice(0, 10)
          : DEFAULT_VALUE_FOR_TYPE[nextType];
      return { ...prev, type: nextType, value: defaultValue, error: null };
    });
  }

  function changeAddValue(value: FrontmatterValue) {
    setAdding((prev) => (prev ? { ...prev, value } : prev));
  }

  function changeAddName(name: string) {
    setAdding((prev) => (prev ? { ...prev, name, error: null } : prev));
  }

  async function commitAdd() {
    if (!adding) return;
    const trimmed = adding.name.trim();
    if (!trimmed) {
      setAdding({ ...adding, error: 'Name is required' });
      return;
    }
    // 'frontmatter' is the reserved legacy single-string slot key
    // (LEGACY_FRONTMATTER_KEY). Distinct error message from a real name
    // collision so the user isn't confused by an "already exists" error
    // for a name they don't see in the panel.
    if (trimmed === 'frontmatter') {
      setAdding({ ...adding, error: '"frontmatter" is a reserved property name' });
      return;
    }
    if (Object.hasOwn(map, trimmed)) {
      setAdding({ ...adding, error: `Property "${trimmed}" already exists` });
      return;
    }
    const result = await commitPatch({ [trimmed]: adding.value }, 'add');
    if (result.ok) {
      setAdding(null);
      return;
    }
    const fieldError = result.fieldErrors?.[trimmed];
    const generic = result.error ?? `HTTP ${result.status || 'network error'}`;
    setAdding({ ...adding, error: fieldError ?? `Failed to add property (${generic})` });
  }

  function cancelAdd() {
    setAdding(null);
  }

  function beginRename(key: string) {
    setRenaming({ key, draft: key, error: null });
  }

  function changeRenameDraft(draft: string) {
    setRenaming((prev) => (prev ? { ...prev, draft, error: null } : prev));
  }

  function cancelRename() {
    setRenaming(null);
  }

  async function commitRename() {
    if (!renaming) return;
    const trimmed = renaming.draft.trim();
    if (!trimmed) {
      setRenaming(null);
      return;
    }
    if (trimmed === renaming.key) {
      setRenaming(null);
      return;
    }
    if (trimmed === 'frontmatter') {
      setRenaming({ ...renaming, error: '"frontmatter" is a reserved property name' });
      return;
    }
    if (Object.hasOwn(map, trimmed)) {
      setRenaming({ ...renaming, error: `Property "${trimmed}" already exists` });
      return;
    }
    const result = await renameProperty(renaming.key, trimmed);
    if (result.ok) {
      setOverrides((prev) => {
        if (!Object.hasOwn(prev, renaming.key)) return prev;
        const next = { ...prev };
        next[trimmed] = next[renaming.key];
        delete next[renaming.key];
        return next;
      });
      clearError(renaming.key);
      setRenaming(null);
      return;
    }
    const fieldError = result.fieldErrors?.[trimmed] ?? result.fieldErrors?.[renaming.key];
    const message =
      fieldError ?? result.error ?? `Failed to rename (HTTP ${result.status || 'network error'})`;
    setRenaming({ ...renaming, error: message });
  }

  const keys = Object.keys(map);
  if (keys.length === 0 && !adding) return null;

  return (
    <div
      className="property-panel editor-content-aligned pt-4 pb-4 text-sm"
      data-testid="property-panel"
    >
      <Collapsible open={!collapsed} onOpenChange={(open) => setCollapsed(!open)}>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="mb-1.5 flex h-auto w-fit bg-transparent! items-center gap-1 px-1 py-0.5 text-base font-medium text-foreground hover:bg-transparent hover:text-foreground"
          >
            <ChevronRight
              data-expanded={!collapsed}
              className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 ease-out data-[expanded=true]:rotate-90"
            />
            <span>Properties</span>
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden data-[state=open]:animate-[collapsible-down_150ms_ease-out] data-[state=closed]:animate-[collapsible-up_150ms_ease-in]">
          {keys.map((key) => {
            const value = map[key];
            if (value === undefined) return null;
            const declared = overrides[key] ?? inferType(value);
            const renameState = renaming?.key === key ? renaming : null;
            return (
              <PropertyRow
                key={key}
                keyName={key}
                value={value}
                declared={declared}
                renameState={renameState}
                error={errors[key] ?? null}
                resetCounter={resetCounters[key] ?? 0}
                onCommit={(v) => commitProperty(key, v)}
                onChangeType={(t) => setType(key, t)}
                onRemove={() => removeProperty(key)}
                onBeginRename={() => beginRename(key)}
                onChangeRenameDraft={changeRenameDraft}
                onCommitRename={commitRename}
                onCancelRename={cancelRename}
              />
            );
          })}
          {adding ? (
            <AddPropertyRow
              draft={adding}
              onChangeName={changeAddName}
              onChangeType={changeAddType}
              onChangeValue={changeAddValue}
              onCommit={commitAdd}
              onCancel={cancelAdd}
            />
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="add-property-trigger"
              onClick={beginAdd}
              className="mt-1 flex items-center gap-1.5 rounded px-2 py-1 font-medium text-sm hover:bg-muted/50 hover:text-foreground"
            >
              <Plus className="size-3.5" />
              <span>Add property</span>
            </Button>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

type FormOp = 'set' | 'add' | 'remove' | 'rename';

interface PatchResult {
  ok: boolean;
  status: number;
  error?: string;
  fieldErrors?: Record<string, string>;
}

interface AddDraft {
  name: string;
  type: FrontmatterType;
  value: FrontmatterValue;
  error: string | null;
}

interface RenameDraft {
  key: string;
  draft: string;
  error: string | null;
}

interface PropertyRowProps {
  keyName: string;
  value: FrontmatterValue;
  declared: FrontmatterType;
  renameState: RenameDraft | null;
  error: string | null;
  resetCounter: number;
  onCommit: (next: FrontmatterValue) => void;
  onChangeType: (next: FrontmatterType) => void;
  onRemove: () => void;
  onBeginRename: () => void;
  onChangeRenameDraft: (next: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
}

function PropertyRow({
  keyName,
  value,
  declared,
  renameState,
  error,
  resetCounter,
  onCommit,
  onChangeType,
  onRemove,
  onBeginRename,
  onChangeRenameDraft,
  onCommitRename,
  onCancelRename,
}: PropertyRowProps) {
  const widgetType = resolveWidgetType(value, declared);
  return (
    <div
      className="group py-0.5"
      data-testid="property-row"
      data-key={keyName}
      data-widget-type={widgetType}
      data-error={error ?? undefined}
    >
      <div className="flex items-center gap-1">
        <TypeIconButton keyName={keyName} type={widgetType} onChangeType={onChangeType} />
        <div className="w-32 shrink-0">
          {renameState ? (
            <RenameInput
              keyName={keyName}
              draft={renameState.draft}
              error={renameState.error}
              onChangeDraft={onChangeRenameDraft}
              onCommit={onCommitRename}
              onCancel={onCancelRename}
            />
          ) : (
            <Button
              type="button"
              variant="ghost"
              data-testid="property-name-button"
              data-key={keyName}
              onClick={onBeginRename}
              className="block h-7 w-full truncate px-2 py-0.5 text-left text-sm rounded-sm font-normal text-muted-foreground hover:bg-transparent hover:text-foreground"
            >
              {keyName}
            </Button>
          )}
        </div>
        <div className="flex-1">
          <Widget
            key={`widget-${resetCounter}`}
            keyName={keyName}
            value={value}
            widgetType={widgetType}
            onCommit={onCommit}
          />
        </div>
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
      </div>
      {error ? (
        <div
          // Live region — error appears asynchronously after a network
          // request, so screen readers need role="alert" to announce it.
          // Sibling RenameInput / AddPropertyRow use the matched
          // aria-invalid + aria-describedby pattern; PropertyRow's error is
          // less directly tied to one focusable target (commits fire from
          // multiple widget surfaces) so role="alert" carries the
          // announcement responsibility.
          role="alert"
          data-testid="property-error"
          data-key={keyName}
          className="pl-9 text-[10px] text-destructive"
        >
          {error}
        </div>
      ) : null}
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

function AddPropertyRow({
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

function sameValue(a: FrontmatterValue, b: FrontmatterValue): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => item === b[i]);
  }
  return a === b;
}

function useFrontmatterMap(provider: HocuspocusProvider): FrontmatterMap {
  const [map, setMap] = useState<FrontmatterMap>(() => getFrontmatterMap(provider.document));
  useEffect(() => {
    const metaMap = provider.document.getMap('metadata');
    const update = () => setMap(getFrontmatterMap(provider.document));
    update();
    metaMap.observeDeep(update);
    return () => metaMap.unobserveDeep(update);
  }, [provider]);
  return map;
}

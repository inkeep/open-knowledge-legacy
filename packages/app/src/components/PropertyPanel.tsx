import type { HocuspocusProvider } from '@hocuspocus/provider';
import {
  type FrontmatterMap,
  type FrontmatterType,
  type FrontmatterValue,
  getFrontmatterMap,
  inferType,
} from '@inkeep/open-knowledge-core';
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
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
  const docName = provider.configuration.name ?? '';

  async function commitPatch(
    patch: Record<string, FrontmatterValue | null>,
  ): Promise<{ ok: boolean; status: number }> {
    try {
      const res = await fetch('/api/frontmatter-patch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docName, patch }),
      });
      if (!res.ok) {
        console.warn('[PropertyPanel] frontmatter-patch failed', { status: res.status });
      }
      return { ok: res.ok, status: res.status };
    } catch (err) {
      console.warn('[PropertyPanel] frontmatter-patch network error', { err });
      return { ok: false, status: 0 };
    }
  }

  async function commitProperty(key: string, value: FrontmatterValue) {
    await commitPatch({ [key]: value });
  }

  async function removeProperty(key: string) {
    await commitPatch({ [key]: null });
  }

  async function renameProperty(oldKey: string, newKey: string): Promise<boolean> {
    if (oldKey === newKey) return true;
    if (Object.hasOwn(map, newKey)) return false;
    const value = map[oldKey];
    if (value === undefined) return false;
    const result = await commitPatch({ [oldKey]: null, [newKey]: value });
    return result.ok;
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
  }

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
    if (Object.hasOwn(map, trimmed) || trimmed === 'frontmatter') {
      setAdding({ ...adding, error: `Property "${trimmed}" already exists` });
      return;
    }
    const result = await commitPatch({ [trimmed]: adding.value });
    if (result.ok) {
      setAdding(null);
    } else {
      setAdding({
        ...adding,
        error: `Failed to add property (HTTP ${result.status || 'network error'})`,
      });
    }
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
    if (Object.hasOwn(map, trimmed) || trimmed === 'frontmatter') {
      setRenaming({ ...renaming, error: `Property "${trimmed}" already exists` });
      return;
    }
    const ok = await renameProperty(renaming.key, trimmed);
    if (ok) {
      setOverrides((prev) => {
        if (!Object.hasOwn(prev, renaming.key)) return prev;
        const next = { ...prev };
        next[trimmed] = next[renaming.key];
        delete next[renaming.key];
        return next;
      });
      setRenaming(null);
    } else {
      setRenaming({ ...renaming, error: `Property "${trimmed}" already exists` });
    }
  }

  const keys = Object.keys(map);
  if (keys.length === 0 && !adding) return null;

  return (
    <div className="property-panel border-b bg-muted/20 text-sm" data-testid="property-panel">
      <button
        type="button"
        aria-expanded={!collapsed}
        aria-controls="property-panel-rows"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center gap-1.5 px-4 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
      >
        {collapsed ? (
          <ChevronRight className="size-3.5 shrink-0" />
        ) : (
          <ChevronDown className="size-3.5 shrink-0" />
        )}
        <span>{`Properties (${keys.length})`}</span>
      </button>
      {!collapsed && (
        <div id="property-panel-rows" className="px-4 pb-2">
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
            <button
              type="button"
              data-testid="add-property-trigger"
              onClick={beginAdd}
              className="mt-1 flex w-full items-center gap-1.5 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            >
              <Plus className="size-3.5" />
              <span>Add property</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
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
      className="group flex items-center gap-1 py-0.5"
      data-testid="property-row"
      data-key={keyName}
      data-widget-type={widgetType}
    >
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
          <button
            type="button"
            data-testid="property-name-button"
            data-key={keyName}
            onClick={onBeginRename}
            className="block w-full truncate text-left text-xs text-muted-foreground hover:text-foreground"
          >
            {keyName}
          </button>
        )}
      </div>
      <div className="flex-1">
        <Widget keyName={keyName} value={value} widgetType={widgetType} onCommit={onCommit} />
      </div>
      <button
        type="button"
        data-testid="property-remove-button"
        data-key={keyName}
        aria-label={`Remove ${keyName}`}
        onClick={onRemove}
        className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground/0 hover:bg-muted hover:text-foreground group-hover:text-muted-foreground"
      >
        <Trash2 className="size-3.5" />
      </button>
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
  return (
    <div>
      <Input
        data-testid="property-name-rename-input"
        data-key={keyName}
        type="text"
        value={draft}
        autoFocus
        aria-invalid={error ? true : undefined}
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
        className="h-6 px-1 py-0 text-xs"
      />
      {error ? (
        <div data-testid="property-name-rename-error" className="text-[10px] text-destructive">
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
          placeholder="property name"
          aria-invalid={draft.error ? true : undefined}
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
          className="h-6 w-32 px-1 py-0 text-xs"
        />
        <div className="flex-1">
          <Widget
            keyName="__add__"
            value={draft.value}
            widgetType={draft.type}
            onCommit={onChangeValue}
          />
        </div>
        <button
          type="button"
          data-testid="add-property-cancel"
          onClick={onCancel}
          className="rounded px-1 py-0.5 text-xs text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
        <button
          type="button"
          data-testid="add-property-commit"
          onClick={onCommit}
          className="rounded bg-primary px-1.5 py-0.5 text-xs text-primary-foreground hover:bg-primary/90"
        >
          Add
        </button>
      </div>
      {draft.error ? (
        <div data-testid="add-property-error" className="mt-0.5 pl-7 text-[10px] text-destructive">
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

export function useHasFrontmatter(provider: HocuspocusProvider | null): boolean {
  const [has, setHas] = useState<boolean>(() => (provider ? hasAnyFrontmatter(provider) : false));
  useEffect(() => {
    if (!provider) {
      setHas(false);
      return;
    }
    const metaMap = provider.document.getMap('metadata');
    const update = () => setHas(hasAnyFrontmatter(provider));
    update();
    metaMap.observeDeep(update);
    return () => metaMap.unobserveDeep(update);
  }, [provider]);
  return has;
}

function hasAnyFrontmatter(provider: HocuspocusProvider): boolean {
  const map = getFrontmatterMap(provider.document);
  if (Object.keys(map).length > 0) return true;
  const legacy = provider.document.getMap('metadata').get('frontmatter');
  return typeof legacy === 'string' && legacy.length > 0;
}

import {
  type FrontmatterType,
  type FrontmatterValue,
  inferType,
} from '@inkeep/open-knowledge-core';
import { ChevronRight, FolderCog, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  type AddDraft,
  AddPropertyRow,
  FrontmatterRow,
  InheritedBadge,
  type RenameDraft,
} from '@/components/FrontmatterRow';
import {
  coerceValue,
  DEFAULT_VALUE_FOR_TYPE,
  resolveWidgetType,
} from '@/components/PropertyWidgets';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import type { AsyncState, FolderConfigSnapshot } from '@/hooks/use-folder-config';
import { saveFolderConfig } from '@/lib/folder-config-api';
import { frontmatterYamlPath } from '@/lib/folder-config-paths';

interface Props {
  folderPath: string;
  state: AsyncState<FolderConfigSnapshot>;
  onChange: () => void;
}

export function FolderDefaultsCard({ folderPath, state, onChange }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [adding, setAdding] = useState<AddDraft | null>(null);
  const [rename, setRename] = useState<RenameDraft | null>(null);

  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <section className="rounded-lg border bg-card p-4 space-y-3">
        <CardHeader />
        <Skeleton className="h-7 w-full" />
        <Skeleton className="h-7 w-full" />
        <Skeleton className="h-7 w-full" />
      </section>
    );
  }

  if (state.status === 'error') {
    return (
      <section
        className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        role="alert"
      >
        Failed to load folder defaults: {state.message}
      </section>
    );
  }

  const merged = (state.data.folder.frontmatter_defaults ?? {}) as Record<string, unknown>;
  const local = state.data.frontmatterLocal ?? {};
  const sources = state.data.frontmatterSources;
  const filePath = frontmatterYamlPath(state.data.folder.path);
  const orderedKeys = Object.keys(merged);

  async function commitKey(key: string, next: FrontmatterValue) {
    const patch: Record<string, unknown> = { [key]: next };
    const result = await saveFolderConfig(folderPath, patch);
    if (!result.ok) {
      toast.error(`Save failed: ${result.error}`);
      return;
    }
    onChange();
  }

  async function removeKey(key: string) {
    const result = await saveFolderConfig(folderPath, { [key]: null });
    if (!result.ok) {
      toast.error(`Remove failed: ${result.error}`);
      return;
    }
    onChange();
  }

  function setType(key: string, nextType: FrontmatterType) {
    const current = merged[key];
    const coerced = coerceValue(current as FrontmatterValue, nextType);
    void commitKey(key, coerced);
  }

  function beginAdd() {
    setAdding({ name: '', type: 'text', value: '', error: null });
    setCollapsed(false);
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
    if (Object.hasOwn(merged, trimmed)) {
      setAdding({ ...adding, error: `Key "${trimmed}" already resolves here` });
      return;
    }
    const result = await saveFolderConfig(folderPath, { [trimmed]: adding.value });
    if (!result.ok) {
      setAdding({ ...adding, error: result.error });
      return;
    }
    setAdding(null);
    onChange();
  }

  function beginRename(key: string) {
    setRename({ key, draft: key, error: null });
  }

  function changeRenameDraft(next: string) {
    setRename((prev) => (prev ? { ...prev, draft: next, error: null } : prev));
  }

  async function commitRename() {
    if (!rename) return;
    const trimmed = rename.draft.trim();
    if (!trimmed) {
      setRename({ ...rename, error: 'Name is required' });
      return;
    }
    if (trimmed === rename.key) {
      setRename(null);
      return;
    }
    if (Object.hasOwn(merged, trimmed)) {
      setRename({ ...rename, error: `Key "${trimmed}" already resolves here` });
      return;
    }
    const value = merged[rename.key];
    const result = await saveFolderConfig(folderPath, {
      [rename.key]: null,
      [trimmed]: value,
    });
    if (!result.ok) {
      setRename({ ...rename, error: result.error });
      return;
    }
    setRename(null);
    onChange();
  }

  function cancelRename() {
    setRename(null);
  }

  return (
    <section className="rounded-lg border bg-card">
      <Collapsible open={!collapsed} onOpenChange={(open) => setCollapsed(!open)}>
        <CollapsibleTrigger className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2.5 data-[state=open]:border-b border-border">
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase font-mono tracking-wider text-muted-foreground">
            <ChevronRight
              className={`size-3 transition-transform ${collapsed ? '' : 'rotate-90'}`}
              aria-hidden
            />
            <span>Folder defaults</span>
          </span>
          {/* Stop click bubbling so single / triple click on the path
                doesn't toggle the collapsible. Drag-to-select never fires
                click on its own. <code> isn't focusable, so it can't receive
                keyboard events — biome's useKeyWithClickEvents pairs onClick
                with a keyboard handler by default; here a keyboard handler
                would be dead code since the wrapping <button> handles all
                keyboard activation (Enter/Space → toggle). */}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: <code> is non-focusable; keyboard activation lives on the wrapping <button>. */}
          <code
            className="text-xs text-muted-foreground font-mono cursor-text select-text"
            onClick={(e) => e.stopPropagation()}
          >
            {filePath}
          </code>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-2 py-2">
            {orderedKeys.length === 0 && !adding ? (
              <p className="px-1 py-1 text-sm text-muted-foreground">
                No defaults declared. Add a property to set a value every doc in this folder
                inherits.
              </p>
            ) : (
              orderedKeys.map((key) => {
                const value = merged[key] as FrontmatterValue;
                const isLocal = Object.hasOwn(local, key);
                const declared = resolveWidgetType(value, inferType(value));
                return (
                  <FrontmatterRow
                    key={key}
                    keyName={key}
                    value={value}
                    declared={declared}
                    rename={
                      isLocal
                        ? {
                            state: rename?.key === key ? rename : null,
                            onBegin: () => beginRename(key),
                            onChangeDraft: changeRenameDraft,
                            onCommit: commitRename,
                            onCancel: cancelRename,
                          }
                        : undefined
                    }
                    badge={isLocal ? null : <InheritedBadge source={sources[key] ?? ''} />}
                    isInherited={!isLocal}
                    onCommit={(next) => void commitKey(key, next)}
                    onChangeType={(t) => setType(key, t)}
                    onRemove={isLocal ? () => void removeKey(key) : undefined}
                  />
                );
              })
            )}
            {adding ? (
              <AddPropertyRow
                draft={adding}
                onChangeName={changeAddName}
                onChangeType={changeAddType}
                onChangeValue={changeAddValue}
                onCommit={() => void commitAdd()}
                onCancel={() => setAdding(null)}
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
          </div>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}

function CardHeader() {
  return (
    <div className="flex items-center gap-2">
      <FolderCog className="size-4 text-muted-foreground" aria-hidden />
      <h2 className="text-xs font-semibold uppercase font-mono tracking-wider text-muted-foreground">
        Folder defaults
      </h2>
    </div>
  );
}

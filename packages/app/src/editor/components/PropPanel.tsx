/**
 * PropPanel — auto-generated controls for jsxComponent props (FR-11, §9.7).
 *
 * Renders inside a floating div below the selected component block.
 * Controls derived from descriptor.props:
 *   string → text input
 *   boolean → toggle switch
 *   enum → dropdown (select)
 *   number → numeric input
 *   reactnode → hidden (content hole is the edit surface)
 *   hidden flag → suppressed
 *   advanced flag → moved into a collapsible "Advanced" section
 *
 * Panel suppressed when no editable props exist (FR-11 / ES01).
 * Change handlers call updateAttributes with sourceDirty:true.
 */

import type { PropDef } from '@inkeep/open-knowledge-core';
import { ChevronDown, Loader2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { uploadFile } from '@/editor/image-upload/upload-file.ts';
import type { JsxComponentDescriptor } from '@/editor/registry/types.ts';
import { humanizePropName } from '@/editor/utils/editor-strings.ts';

/**
 * Per-descriptor localStorage key for persisting the Advanced section's
 * open/closed state. Opening Advanced on `<img>` does not auto-open it on
 * `<Callout>` — each descriptor has independent state.
 */
function advancedOpenStateKey(descriptorName: string): string {
  return `ok.propPanel.advanced.${descriptorName}`;
}

/**
 * Read the persisted Advanced-section open state for a descriptor. Returns
 * `false` when no entry exists, when storage is unavailable (privacy mode,
 * SSR), or when the stored value is malformed. Throws are swallowed — the
 * panel still works without persistence.
 */
export function readAdvancedOpenState(descriptorName: string): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(advancedOpenStateKey(descriptorName)) === 'true';
  } catch {
    return false;
  }
}

/**
 * Persist the Advanced-section open state for a descriptor. Throws are
 * swallowed (storage quota / privacy mode); the in-memory React state still
 * reflects the user's intent for the lifetime of the panel.
 */
export function persistAdvancedOpenState(descriptorName: string, open: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(advancedOpenStateKey(descriptorName), open ? 'true' : 'false');
  } catch {
    // ignore
  }
}

/**
 * Count the number of advanced props whose current value differs from the
 * declared `defaultValue`. A prop with no `defaultValue` counts as "set"
 * when its current value is anything other than `undefined`. Drives the
 * Advanced trigger's count badge.
 */
export function countAdvancedSet(
  advancedProps: PropDef[],
  values: Record<string, unknown>,
): number {
  let count = 0;
  for (const p of advancedProps) {
    const current = values[p.name];
    const declaredDefault = 'defaultValue' in p ? p.defaultValue : undefined;
    if (current !== undefined && current !== declaredDefault) count += 1;
  }
  return count;
}

/**
 * Pick the prop whose Input should receive `autoFocus={true}` on PropPanel
 * mount: the first PropDefString in declared order with `autoFocus: true`
 * and not `hidden` and not `advanced` (advanced props live inside a
 * collapsed `<CollapsibleContent>` and would not be visible on mount).
 * Other Inputs render with `autoFocus={false}`. Returns `null` when no
 * prop opts in. Pure; safe to call inside render.
 */
export function getAutoFocusedPropName(props: PropDef[]): string | null {
  for (const p of props) {
    if (p.type !== 'string') continue;
    if (p.hidden === true) continue;
    if ('advanced' in p && p.advanced === true) continue;
    if (p.autoFocus === true) return p.name;
  }
  return null;
}

/**
 * Behavioral half of the PropPanel upload affordance — exported so the unit
 * test can drive the success/error semantics without a real DOM. The button
 * component below wraps this with the in-flight `uploading` state and the
 * file-input value reset.
 */
async function runUpload(
  file: File,
  accept: readonly string[],
  onUploaded: (url: string) => void,
): Promise<void> {
  try {
    const { url } = await uploadFile(file, accept);
    onUploaded(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    toast.error(`Upload failed: ${message}`);
  }
}

interface PropPanelProps {
  /**
   * Active descriptor — drives the prop controls (form-scoped to the
   * descriptor's own `props`).
   */
  descriptor: JsxComponentDescriptor;
  values: Record<string, unknown>;
  onChange: (propName: string, value: unknown) => void;
}

export function PropPanel({ descriptor, values, onChange }: PropPanelProps) {
  const editableProps = descriptor.props.filter(
    (p) => !('hidden' in p && p.hidden) && p.type !== 'reactnode',
  );

  const commonProps = editableProps.filter((p) => !('advanced' in p && p.advanced));
  const advancedProps = editableProps.filter((p) => 'advanced' in p && p.advanced);
  const advancedSetCount = countAdvancedSet(advancedProps, values);
  const autoFocusedPropName = getAutoFocusedPropName(descriptor.props);

  // Read persisted state once at mount; the controlled `open` lets us call
  // `persistAdvancedOpenState` on every change. React Compiler memoizes this
  // useState initializer.
  const [advancedOpen, setAdvancedOpen] = useState(() => readAdvancedOpenState(descriptor.name));

  if (editableProps.length === 0) return null;

  return (
    <div data-prop-panel="" className="flex flex-col gap-2 p-3 text-sm">
      {commonProps.map((propDef) => (
        <PropControl
          key={propDef.name}
          propDef={propDef}
          value={values[propDef.name]}
          onChange={(v) => onChange(propDef.name, v)}
          isAutoFocused={propDef.name === autoFocusedPropName}
        />
      ))}
      {advancedProps.length > 0 && (
        <>
          <div className="my-1 border-t border-border" />
          <Collapsible
            open={advancedOpen}
            onOpenChange={(o) => {
              setAdvancedOpen(o);
              persistAdvancedOpenState(descriptor.name, o);
            }}
          >
            <CollapsibleTrigger
              data-prop-panel-advanced-trigger=""
              className="group flex w-full items-center justify-between rounded px-1 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <span className="flex items-center gap-1.5">
                <ChevronDown className="size-3 transition-transform group-data-[state=closed]:-rotate-90" />
                Advanced
              </span>
              {advancedSetCount > 0 && (
                <Badge variant="secondary" data-prop-panel-advanced-count="">
                  {advancedSetCount}
                </Badge>
              )}
            </CollapsibleTrigger>
            <CollapsibleContent className="flex flex-col gap-2 pt-2">
              {advancedProps.map((propDef) => (
                <PropControl
                  key={propDef.name}
                  propDef={propDef}
                  value={values[propDef.name]}
                  onChange={(v) => onChange(propDef.name, v)}
                  isAutoFocused={propDef.name === autoFocusedPropName}
                />
              ))}
            </CollapsibleContent>
          </Collapsible>
        </>
      )}
    </div>
  );
}

/**
 * Exhaustive-check sentinel for `PropDef.type`. Adding a new PropDef
 * variant without extending the switch below produces a compile error
 * here — exactly the signal we want. (Previously the default branch
 * returned `null`, so a new variant shipped without any UI surface and
 * no build-time signal.)
 */
function assertUnreachable(x: never): never {
  throw new Error(`PropPanel: unhandled PropDef type ${JSON.stringify(x)}`);
}

function PropControl({
  propDef,
  value,
  onChange,
  isAutoFocused,
}: {
  propDef: PropDef;
  value: unknown;
  onChange: (value: unknown) => void;
  isAutoFocused: boolean;
}) {
  switch (propDef.type) {
    case 'reactnode':
      // ReactNode props render as the component's NodeViewContent — no
      // PropPanel control. Explicit case so the exhaustiveness check
      // below narrows to `never` when every variant is handled.
      return null;
    case 'string': {
      const stringId = `prop-${propDef.name}`;
      const accept = propDef.accept;
      const showUpload = accept !== undefined && accept.length > 0;
      return (
        <div className="flex flex-col gap-1">
          <label htmlFor={stringId} className="text-xs text-muted-foreground">
            {humanizePropName(propDef.name)}
          </label>
          <div className="flex gap-1">
            <Input
              id={stringId}
              type="text"
              value={(value as string) ?? ''}
              onChange={(e) => onChange(e.target.value)}
              autoFocus={isAutoFocused}
              data-prop-autofocus={isAutoFocused ? '' : undefined}
              className="h-7 text-sm"
            />
            {showUpload && <PropUploadButton accept={accept} onUploaded={(url) => onChange(url)} />}
          </div>
        </div>
      );
    }

    case 'boolean': {
      const boolId = `prop-${propDef.name}`;
      const boolLabel = humanizePropName(propDef.name);
      return (
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={boolId} className="text-xs text-muted-foreground">
            {boolLabel}
          </label>
          <Switch
            id={boolId}
            checked={Boolean(value)}
            onCheckedChange={(checked) => onChange(checked)}
          />
        </div>
      );
    }

    case 'enum': {
      const enumId = `prop-${propDef.name}`;
      return (
        <div className="flex flex-col gap-1">
          <label htmlFor={enumId} className="text-xs text-muted-foreground">
            {humanizePropName(propDef.name)}
          </label>
          <select
            id={enumId}
            value={(value as string) ?? propDef.enumValues[0] ?? ''}
            onChange={(e) => onChange(e.target.value)}
            className="h-7 rounded border border-input bg-background px-2 text-sm"
          >
            {propDef.enumValues.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
      );
    }

    case 'number': {
      const numberId = `prop-${propDef.name}`;
      return (
        <div className="flex flex-col gap-1">
          <label htmlFor={numberId} className="text-xs text-muted-foreground">
            {humanizePropName(propDef.name)}
          </label>
          <Input
            id={numberId}
            type="number"
            inputMode="numeric"
            value={value != null ? String(value) : ''}
            onChange={(e) => {
              const raw = e.target.value;
              // Empty string → explicit clear (propagated as `undefined` so
              // optional numeric props can be unset from the UI). Without this
              // branch, backspace-to-empty had no onChange call and React
              // re-rendered from the stored value, visually "reverting" the
              // user's clear. `'-'` stays an early-return because it is a
              // transient state while typing a negative number.
              if (raw === '') {
                onChange(undefined);
                return;
              }
              if (raw === '-') return;
              const num = Number(raw);
              if (!Number.isNaN(num)) onChange(num);
            }}
            className="h-7 text-sm"
          />
        </div>
      );
    }

    default:
      return assertUnreachable(propDef);
  }
}

/**
 * Upload affordance rendered next to a PropDefString input when the prop
 * declares `accept`. Owns its own in-flight state — the loading spinner +
 * disabled button — so PropControl stays a pure render of the prop value.
 * Clicking the button triggers a programmatic click on the hidden file
 * input; the file input's `onChange` runs the upload and pipes the
 * resolved URL into the prop's `onChange`.
 */
function PropUploadButton({
  accept,
  onUploaded,
}: {
  accept: readonly string[];
  onUploaded: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept.join(',')}
        className="hidden"
        data-prop-upload-input=""
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setUploading(true);
          try {
            await runUpload(file, accept, onUploaded);
          } catch {
            // runUpload owns its own toast; the empty catch keeps cleanup
            // running on the (theoretical) unhandled rejection path.
          }
          setUploading(false);
          // Reset so re-selecting the same file still fires onChange.
          if (inputRef.current) inputRef.current.value = '';
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={uploading}
        aria-label="Upload file"
        data-prop-upload-trigger=""
        className="h-7 px-2"
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Upload className="size-3.5" />
        )}
      </Button>
    </>
  );
}

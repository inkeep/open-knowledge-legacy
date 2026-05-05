import type { PropDef } from '@inkeep/open-knowledge-core';
import { ChevronDown, Loader2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { uploadFile } from '@/editor/image-upload/upload-file.ts';
import type { JsxComponentDescriptor } from '@/editor/registry/types.ts';
import { getAutoFocusedPropName, humanizePropName } from '@/editor/utils/editor-strings.ts';

function advancedOpenStateKey(descriptorName: string): string {
  return `ok.propPanel.advanced.${descriptorName}`;
}

export function readAdvancedOpenState(descriptorName: string): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(advancedOpenStateKey(descriptorName)) === 'true';
  } catch {
    return false;
  }
}

export function persistAdvancedOpenState(descriptorName: string, open: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(advancedOpenStateKey(descriptorName), open ? 'true' : 'false');
  } catch {}
}

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

  const [advancedOpen, setAdvancedOpen] = useState(() => readAdvancedOpenState(descriptor.name));

  if (editableProps.length === 0) return null;

  return (
    <div data-prop-panel="" className="flex flex-col gap-4 py-2 text-sm">
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
              className="group flex w-full items-center justify-between rounded px-1 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground uppercase font-mono"
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
            <CollapsibleContent className="flex flex-col gap-4 pt-2">
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
      return null;
    case 'string': {
      const stringId = `prop-${propDef.name}`;
      const accept = propDef.accept;
      const showUpload = accept !== undefined && accept.length > 0;
      const treatEmptyAsUndefined = !propDef.required && propDef.defaultValue === undefined;
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
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === '' && treatEmptyAsUndefined) {
                  onChange(undefined);
                  return;
                }
                onChange(raw);
              }}
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
      const enumValue = (value as string) ?? propDef.enumValues[0] ?? '';
      return (
        <div className="flex flex-col gap-1">
          <label htmlFor={enumId} className="text-xs text-muted-foreground">
            {humanizePropName(propDef.name)}
          </label>
          <Select value={enumValue} onValueChange={onChange}>
            <SelectTrigger id={enumId} size="sm">
              <SelectValue />
            </SelectTrigger>
            {/* PropPanel renders inside a z-[60] PopoverContent (see
                JsxComponentView.tsx); both portal to body, so Select's
                default z-50 loses to the parent Popover. Bump above. */}
            <SelectContent className="z-70">
              {propDef.enumValues.map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
          } catch {}
          setUploading(false);
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

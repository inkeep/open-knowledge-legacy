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
 *
 * Panel suppressed when no editable props exist (FR-11 / ES01).
 * Change handlers call updateAttributes with sourceDirty:true.
 */

import type { PropDef } from '@inkeep/open-knowledge-core';
import { Input } from '@/components/ui/input';
import { Toggle } from '@/components/ui/toggle';

interface PropPanelProps {
  props: PropDef[];
  values: Record<string, unknown>;
  onChange: (propName: string, value: unknown) => void;
}

export function PropPanel({ props, values, onChange }: PropPanelProps) {
  const editableProps = props.filter((p) => !('hidden' in p && p.hidden) && p.type !== 'reactnode');

  if (editableProps.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 p-3 text-sm">
      {editableProps.map((propDef) => (
        <PropControl
          key={propDef.name}
          propDef={propDef}
          value={values[propDef.name]}
          onChange={(v) => onChange(propDef.name, v)}
        />
      ))}
    </div>
  );
}

function PropControl({
  propDef,
  value,
  onChange,
}: {
  propDef: PropDef;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  switch (propDef.type) {
    case 'string':
      return (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{propDef.name}</span>
          <Input
            type="text"
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            className="h-7 text-sm"
          />
        </div>
      );

    case 'boolean':
      return (
        <div className="flex items-center gap-2">
          <Toggle
            pressed={Boolean(value)}
            onPressedChange={(pressed) => onChange(pressed)}
            size="sm"
            className="h-6 w-6"
          >
            {value ? '✓' : ''}
          </Toggle>
          <span className="text-xs text-muted-foreground">{propDef.name}</span>
        </div>
      );

    case 'enum':
      return (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{propDef.name}</span>
          <select
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

    case 'number':
      return (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{propDef.name}</span>
          <Input
            type="number"
            inputMode="numeric"
            value={value != null ? String(value) : ''}
            onChange={(e) => onChange(Number(e.target.value))}
            className="h-7 text-sm"
          />
        </div>
      );

    default:
      return null;
  }
}

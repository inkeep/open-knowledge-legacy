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
import { Switch } from '@/components/ui/switch';

/**
 * Humanize a camelCase / snake_case prop name for the PropPanel UI.
 * `emptyChildName` → `Empty Child Name`, `default_value` → `Default Value`.
 * Identifiers stay camelCase in the generated markdown attr; only the label
 * is transformed.
 */
function humanizePropName(name: string): string {
  if (!name) return name;
  const spaced = name
    // snake_case and kebab-case → space
    .replace(/[_-]+/g, ' ')
    // camelCase and consecutive-capitals boundaries (emptyChildName → empty Child Name; ARIALabel → ARIA Label)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

interface PropPanelProps {
  props: PropDef[];
  values: Record<string, unknown>;
  onChange: (propName: string, value: unknown) => void;
}

export function PropPanel({ props, values, onChange }: PropPanelProps) {
  const editableProps = props.filter((p) => !('hidden' in p && p.hidden) && p.type !== 'reactnode');

  if (editableProps.length === 0) return null;

  return (
    <div data-prop-panel="" className="flex flex-col gap-2 p-3 text-sm">
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
}: {
  propDef: PropDef;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  switch (propDef.type) {
    case 'reactnode':
      // ReactNode props render as the component's NodeViewContent — no
      // PropPanel control. Explicit case so the exhaustiveness check
      // below narrows to `never` when every variant is handled.
      return null;
    case 'string': {
      const stringId = `prop-${propDef.name}`;
      return (
        <div className="flex flex-col gap-1">
          <label htmlFor={stringId} className="text-xs text-muted-foreground">
            {humanizePropName(propDef.name)}
          </label>
          <Input
            id={stringId}
            type="text"
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            className="h-7 text-sm"
          />
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
            aria-label={boolLabel}
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
              if (raw === '' || raw === '-') return;
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

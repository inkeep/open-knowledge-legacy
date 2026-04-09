/**
 * Auto-generated prop panel — renders controls based on PropDef from the registry.
 * Renders as an inline panel (visibility controlled by parent via mount/unmount).
 *
 * CRITICAL: Every change handler calls markUserTyping() before invoking onChange.
 * This signals Observer B to defer its tree-replacement sync while the user is
 * actively editing props. See SPEC §3.6 and R9.
 */

import type { ComponentMeta, PropDef } from '@inkeep/open-knowledge-core';
import { Select, Switch } from 'radix-ui';
import { useState } from 'react';
import { markUserTyping } from '@/editor/observers';

interface PropPanelProps {
  meta: ComponentMeta;
  currentProps: Record<string, unknown>;
  onChange: (propName: string, value: unknown) => void;
}

export function PropPanel({ meta, currentProps, onChange }: PropPanelProps) {
  const editableProps = meta.props.filter((p) => p.type !== 'reactnode');

  return (
    <section
      aria-label="Component props"
      style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        border: '1px solid #e0e0e0',
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        padding: '12px',
        minWidth: '240px',
        maxWidth: '320px',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {editableProps.length === 0 && (
          <p style={{ margin: 0, fontSize: '13px', color: '#71717a' }}>
            This component has no editable props. Edit children inline below.
          </p>
        )}
        {editableProps.map((prop) => (
          <PropControl
            key={prop.name}
            prop={prop}
            value={currentProps[prop.name]}
            onChange={onChange}
          />
        ))}
      </div>
    </section>
  );
}

interface PropControlProps {
  prop: PropDef;
  value: unknown;
  onChange: (propName: string, value: unknown) => void;
}

function PropControl({ prop, value, onChange }: PropControlProps) {
  // React Compiler handles memoization automatically — do not add useCallback.
  const handleChange = (newValue: unknown) => {
    markUserTyping();
    onChange(prop.name, newValue);
  };

  // Accessible label id — shared across the visible <span> label and the
  // form control's aria-labelledby, so screen readers announce the prop
  // name when focus enters the control.
  const labelId = `prop-label-${prop.name}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <span
        id={labelId}
        style={{
          fontSize: '11px',
          fontWeight: 600,
          color: '#555',
          fontFamily: 'monospace',
        }}
      >
        {prop.name}
        {prop.required && <span style={{ color: '#ef4444', marginLeft: '2px' }}>*</span>}
      </span>
      {prop.type === 'string' && (
        <StringControl value={value as string} onChange={handleChange} ariaLabelledBy={labelId} />
      )}
      {prop.type === 'boolean' && (
        <BooleanControl value={value as boolean} onChange={handleChange} ariaLabelledBy={labelId} />
      )}
      {prop.type === 'enum' && (
        <EnumControl
          value={value as string}
          enumValues={prop.enumValues}
          onChange={handleChange}
          ariaLabelledBy={labelId}
        />
      )}
      {prop.type === 'number' && (
        <NumberControl value={value as number} onChange={handleChange} ariaLabelledBy={labelId} />
      )}
      {prop.description && (
        <span style={{ fontSize: '10px', color: '#999' }}>{prop.description.split('\n')[0]}</span>
      )}
    </div>
  );
}

function StringControl({
  value,
  onChange,
  ariaLabelledBy,
}: {
  value: string | undefined;
  onChange: (v: string) => void;
  ariaLabelledBy: string;
}) {
  return (
    <input
      type="text"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={() => markUserTyping()}
      aria-labelledby={ariaLabelledBy}
      style={{
        border: '1px solid #d0d0d0',
        borderRadius: '4px',
        padding: '4px 8px',
        fontSize: '13px',
        outline: 'none',
        width: '100%',
        boxSizing: 'border-box',
      }}
    />
  );
}

function BooleanControl({
  value,
  onChange,
  ariaLabelledBy,
}: {
  value: boolean | undefined;
  onChange: (v: boolean) => void;
  ariaLabelledBy: string;
}) {
  return (
    <Switch.Root
      checked={value ?? false}
      onCheckedChange={(checked) => {
        markUserTyping();
        onChange(checked);
      }}
      aria-labelledby={ariaLabelledBy}
      style={{
        width: '36px',
        height: '20px',
        backgroundColor: value ? '#7c3aed' : '#ccc',
        borderRadius: '10px',
        position: 'relative',
        border: 'none',
        cursor: 'pointer',
        transition: 'background-color 0.15s',
      }}
    >
      <Switch.Thumb
        style={{
          display: 'block',
          width: '16px',
          height: '16px',
          backgroundColor: 'white',
          borderRadius: '8px',
          transition: 'transform 0.15s',
          transform: value ? 'translateX(18px)' : 'translateX(2px)',
        }}
      />
    </Switch.Root>
  );
}

function EnumSelectItem({ value }: { value: string }) {
  // Focus highlight tracked via React state so it survives re-renders.
  // Directly mutating currentTarget.style in onFocus/onBlur would be lost
  // when the parent PropPanel re-renders (parent writes the base style
  // prop back over the mutation).
  const [focused, setFocused] = useState(false);
  return (
    <Select.Item
      value={value}
      style={{
        padding: '6px 8px',
        fontSize: '13px',
        borderRadius: '3px',
        cursor: 'pointer',
        outline: 'none',
        backgroundColor: focused ? '#f3f0ff' : 'transparent',
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <Select.ItemText>{value}</Select.ItemText>
    </Select.Item>
  );
}

function EnumControl({
  value,
  enumValues,
  onChange,
  ariaLabelledBy,
}: {
  value: string | undefined;
  enumValues: string[];
  onChange: (v: string) => void;
  ariaLabelledBy: string;
}) {
  return (
    <Select.Root
      value={value ?? ''}
      onValueChange={(v) => {
        markUserTyping();
        onChange(v);
      }}
    >
      <Select.Trigger
        aria-labelledby={ariaLabelledBy}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          border: '1px solid #d0d0d0',
          borderRadius: '4px',
          padding: '4px 8px',
          fontSize: '13px',
          backgroundColor: 'white',
          cursor: 'pointer',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <Select.Value placeholder="Select..." />
        <Select.Icon style={{ marginLeft: '4px', color: '#999' }}>&#x25BE;</Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          style={{
            backgroundColor: 'white',
            borderRadius: '6px',
            border: '1px solid #e0e0e0',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            overflow: 'hidden',
            zIndex: 51,
          }}
          position="popper"
          sideOffset={4}
        >
          <Select.Viewport style={{ padding: '4px' }}>
            {enumValues.map((v) => (
              <EnumSelectItem key={v} value={v} />
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

function NumberControl({
  value,
  onChange,
  ariaLabelledBy,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  ariaLabelledBy: string;
}) {
  return (
    <input
      type="number"
      value={value ?? ''}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === '') {
          onChange(undefined);
          return;
        }
        const n = Number(raw);
        if (!Number.isNaN(n)) onChange(n);
      }}
      onKeyDown={() => markUserTyping()}
      aria-labelledby={ariaLabelledBy}
      style={{
        border: '1px solid #d0d0d0',
        borderRadius: '4px',
        padding: '4px 8px',
        fontSize: '13px',
        outline: 'none',
        width: '100%',
        boxSizing: 'border-box',
      }}
    />
  );
}

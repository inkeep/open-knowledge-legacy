/**
 * Auto-generated prop panel — renders controls based on PropDef from the registry.
 * Uses Radix Popover to portal to document.body.
 *
 * CRITICAL: Every change handler calls markUserTyping() before invoking onChange.
 * Radix popovers portal to document.body — events don't bubble to editor.view.dom,
 * so markUserTyping isn't signalled automatically. See SPEC §3.6 and R9.
 */

import type { ComponentMeta, PropDef } from '@inkeep/open-knowledge-core';
import { Popover, Select, Switch } from 'radix-ui';
import { useCallback } from 'react';
import { markUserTyping } from '@/editor/observers';

interface PropPanelProps {
  meta: ComponentMeta;
  currentProps: Record<string, unknown>;
  onChange: (propName: string, value: unknown) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function PropPanel({
  meta,
  currentProps,
  onChange,
  open,
  onOpenChange,
  children,
}: PropPanelProps) {
  const editableProps = meta.props.filter((p) => p.type !== 'reactnode');

  // When no editable props exist, still render children (toolbar) without the popover
  if (editableProps.length === 0) return <>{children}</>;

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={4}
          style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            border: '1px solid #e0e0e0',
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            padding: '12px',
            minWidth: '240px',
            maxWidth: '320px',
            zIndex: 50,
          }}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {editableProps.map((prop) => (
              <PropControl
                key={prop.name}
                prop={prop}
                value={currentProps[prop.name]}
                onChange={onChange}
              />
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

interface PropControlProps {
  prop: PropDef;
  value: unknown;
  onChange: (propName: string, value: unknown) => void;
}

function PropControl({ prop, value, onChange }: PropControlProps) {
  const handleChange = useCallback(
    (newValue: unknown) => {
      markUserTyping();
      onChange(prop.name, newValue);
    },
    [prop.name, onChange],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <span
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
      {prop.type === 'string' && <StringControl value={value as string} onChange={handleChange} />}
      {prop.type === 'boolean' && (
        <BooleanControl value={value as boolean} onChange={handleChange} />
      )}
      {prop.type === 'enum' && (
        <EnumControl
          value={value as string}
          enumValues={prop.enumValues || []}
          onChange={handleChange}
        />
      )}
      {prop.type === 'number' && <NumberControl value={value as number} onChange={handleChange} />}
      {prop.description && (
        <span style={{ fontSize: '10px', color: '#999' }}>{prop.description.split('\n')[0]}</span>
      )}
    </div>
  );
}

function StringControl({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="text"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={() => markUserTyping()}
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
}: {
  value: boolean | undefined;
  onChange: (v: boolean) => void;
}) {
  return (
    <Switch.Root
      checked={value ?? false}
      onCheckedChange={(checked) => {
        markUserTyping();
        onChange(checked);
      }}
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

function EnumControl({
  value,
  enumValues,
  onChange,
}: {
  value: string | undefined;
  enumValues: string[];
  onChange: (v: string) => void;
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
              <Select.Item
                key={v}
                value={v}
                style={{
                  padding: '6px 8px',
                  fontSize: '13px',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  outline: 'none',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.backgroundColor = '#f3f0ff';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <Select.ItemText>{v}</Select.ItemText>
              </Select.Item>
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
}: {
  value: number | undefined;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="number"
      value={value ?? ''}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (!Number.isNaN(n)) onChange(n);
      }}
      onKeyDown={() => markUserTyping()}
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

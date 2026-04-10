/**
 * Floating menu for slash command component insertion.
 * Shows registered components from the manifest, grouped by category.
 */
import type { ComponentMeta } from '@inkeep/open-knowledge-core';
import { type Ref, useEffect, useImperativeHandle, useState } from 'react';

export interface SlashCommandItem {
  name: string;
  meta: ComponentMeta;
}

interface SlashCommandMenuProps {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
  // React 19: ref passed as a regular prop (forwardRef is deprecated).
  ref?: Ref<SlashCommandMenuRef>;
}

export interface SlashCommandMenuRef {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  content: 'Content',
  layout: 'Layout',
  media: 'Media',
  data: 'Data',
};

export function SlashCommandMenu({ items, command, ref }: SlashCommandMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset selection when items change (filtering)
  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  useImperativeHandle(
    ref,
    () => ({
      onKeyDown: (event: KeyboardEvent) => {
        // Guard: with items.length === 0, modulo-by-zero produces NaN and
        // corrupts selectedIndex. The render-time early-return doesn't
        // prevent the handler from being called while the "No results"
        // state is showing (ref is still exposed).
        if (items.length === 0) return false;
        if (event.key === 'ArrowUp') {
          setSelectedIndex((prev) => (prev + items.length - 1) % items.length);
          return true;
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex((prev) => (prev + 1) % items.length);
          return true;
        }
        if (event.key === 'Enter') {
          if (items[selectedIndex]) {
            command(items[selectedIndex]);
          }
          return true;
        }
        return false;
      },
    }),
    [items, selectedIndex, command],
  );

  if (items.length === 0) {
    return (
      <div style={menuStyle}>
        <div style={{ padding: '8px 12px', color: '#999', fontSize: '13px' }}>No results</div>
      </div>
    );
  }

  // Group items by category, precomputing flat indices so we don't mutate
  // a captured variable inside a render lambda (React Compiler can't handle
  // UpdateExpression on variables captured within lambdas).
  const groups: Array<{
    category: string;
    items: Array<{ item: SlashCommandItem; flatIdx: number }>;
  }> = [];
  const categoryMap = new Map<string, Array<{ item: SlashCommandItem; flatIdx: number }>>();
  let idx = 0;
  for (const item of items) {
    const cat = item.meta.category;
    let list = categoryMap.get(cat);
    if (!list) {
      list = [];
      categoryMap.set(cat, list);
      groups.push({ category: cat, items: list });
    }
    list.push({ item, flatIdx: idx++ });
  }

  return (
    <div style={menuStyle}>
      {groups.map(({ category, items: groupItems }) => (
        <div key={category}>
          <div style={categoryLabelStyle}>{CATEGORY_LABELS[category] || category}</div>
          {groupItems.map(({ item, flatIdx }) => {
            const isSelected = flatIdx === selectedIndex;
            return (
              <button
                type="button"
                key={item.name}
                onClick={() => command(item)}
                onMouseEnter={() => setSelectedIndex(flatIdx)}
                style={{
                  ...itemStyle,
                  backgroundColor: isSelected ? '#f3f0ff' : 'transparent',
                }}
              >
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <span style={itemNameStyle}>{item.meta.displayName}</span>
                  <span style={itemHintStyle}>{item.name}</span>
                </div>
                {item.meta.description && (
                  <span style={itemDescStyle}>{item.meta.description}</span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

const menuStyle: React.CSSProperties = {
  backgroundColor: 'white',
  borderRadius: '8px',
  border: '1px solid #e0e0e0',
  boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
  padding: '4px',
  minWidth: '200px',
  maxWidth: '280px',
  maxHeight: '320px',
  overflowY: 'auto',
  zIndex: 50,
};

const categoryLabelStyle: React.CSSProperties = {
  padding: '6px 12px 2px',
  fontSize: '10px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  color: '#999',
};

const itemStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  padding: '6px 12px',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  textAlign: 'left',
  fontSize: '13px',
  outline: 'none',
  gap: '8px',
};

const itemNameStyle: React.CSSProperties = {
  fontWeight: 500,
  color: '#333',
};

const itemHintStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#999',
  fontFamily: 'monospace',
};

const itemDescStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#888',
  lineHeight: 1.3,
  marginTop: '1px',
};

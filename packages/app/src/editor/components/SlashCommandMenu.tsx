/**
 * Floating menu for slash command component insertion.
 * Shows registered components from the manifest, grouped by category.
 */
import type { ComponentMeta } from '@inkeep/open-knowledge-core';
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';

export interface SlashCommandItem {
  name: string;
  meta: ComponentMeta;
}

interface SlashCommandMenuProps {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
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

export const SlashCommandMenu = forwardRef<SlashCommandMenuRef, SlashCommandMenuProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    // biome-ignore lint/correctness/useExhaustiveDependencies: reset selection when items change (filtering)
    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: (event: KeyboardEvent) => {
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
    }));

    if (items.length === 0) {
      return (
        <div style={menuStyle}>
          <div style={{ padding: '8px 12px', color: '#999', fontSize: '13px' }}>No results</div>
        </div>
      );
    }

    // Group items by category
    const groups = new Map<string, SlashCommandItem[]>();
    for (const item of items) {
      const cat = item.meta.category;
      const list = groups.get(cat) || [];
      list.push(item);
      groups.set(cat, list);
    }

    let flatIndex = 0;

    return (
      <div style={menuStyle}>
        {Array.from(groups.entries()).map(([category, groupItems]) => (
          <div key={category}>
            <div style={categoryLabelStyle}>{CATEGORY_LABELS[category] || category}</div>
            {groupItems.map((item) => {
              const idx = flatIndex++;
              const isSelected = idx === selectedIndex;
              return (
                <button
                  type="button"
                  key={item.name}
                  onClick={() => command(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  style={{
                    ...itemStyle,
                    backgroundColor: isSelected ? '#f3f0ff' : 'transparent',
                  }}
                >
                  <span style={itemNameStyle}>{item.meta.displayName}</span>
                  <span style={itemHintStyle}>{item.name}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    );
  },
);

SlashCommandMenu.displayName = 'SlashCommandMenu';

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
  alignItems: 'center',
  justifyContent: 'space-between',
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

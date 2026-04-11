import { useEffect, useRef } from 'react';
import { filterItems, type SlashCommandItem } from './items';

interface SlashCommandMenuProps {
  items: SlashCommandItem[];
  query: string;
  selectedIndex: number;
  onSelect: (item: SlashCommandItem) => void;
}

const categoryLabels: Record<string, string> = {
  basic: 'Basic blocks',
  insert: 'Insert',
};

export function SlashCommandMenu({ items, query, selectedIndex, onSelect }: SlashCommandMenuProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const filtered = filterItems(items, query);

  // Scroll selected item into view
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const options = container.querySelectorAll('[role="option"]');
    const selected = options.item(selectedIndex);
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (filtered.length === 0) {
    return (
      <div
        ref={containerRef}
        className="w-56 rounded-lg border bg-popover p-2 shadow-md text-sm text-muted-foreground"
      >
        No results
      </div>
    );
  }

  // Group by category, preserving order
  const categories: { key: string; items: SlashCommandItem[] }[] = [];
  let flatIndex = 0;
  const indexMap = new Map<SlashCommandItem, number>();

  for (const item of filtered) {
    indexMap.set(item, flatIndex++);
    const existing = categories.find((c) => c.key === item.category);
    if (existing) {
      existing.items.push(item);
    } else {
      categories.push({ key: item.category, items: [item] });
    }
  }

  return (
    <div
      ref={containerRef}
      role="listbox"
      aria-label="Slash commands"
      className="w-56 overflow-y-auto subtle-scrollbar rounded-lg border bg-popover p-1 shadow-md"
      style={{ maxHeight: 'var(--suggestion-menu-max-height, 40vh)' }}
    >
      {categories.map((cat) => (
        <fieldset key={cat.key} className="border-0 p-0 m-0 min-w-0">
          <legend className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
            {categoryLabels[cat.key] ?? cat.key}
          </legend>
          {cat.items.map((item) => {
            const idx = indexMap.get(item) ?? 0;
            const isSelected = idx === selectedIndex;
            const Icon = item.icon;
            return (
              <button
                key={item.name}
                type="button"
                role="option"
                aria-selected={isSelected}
                data-selected={isSelected}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-left ${
                  isSelected ? 'bg-accent text-accent-foreground' : ''
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(item);
                }}
              >
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                <div className="flex flex-col min-w-0">
                  <span className="truncate">{item.label}</span>
                </div>
              </button>
            );
          })}
        </fieldset>
      ))}
    </div>
  );
}

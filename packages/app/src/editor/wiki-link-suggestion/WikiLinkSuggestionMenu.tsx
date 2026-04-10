import { useEffect, useRef } from 'react';
import type { WikiLinkSuggestionItem } from '../extensions/wiki-link-suggestion';

interface WikiLinkSuggestionMenuProps {
  items: WikiLinkSuggestionItem[];
  query: string;
  selectedIndex: number;
  onSelect: (item: WikiLinkSuggestionItem) => void;
  loading?: boolean;
}

export function WikiLinkSuggestionMenu({
  items,
  query,
  selectedIndex,
  onSelect,
  loading = false,
}: WikiLinkSuggestionMenuProps) {
  const containerRef = useRef<HTMLDivElement>(null);

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

  if (loading) {
    return (
      <div
        ref={containerRef}
        className="w-64 rounded-lg border bg-popover p-2 shadow-md text-sm text-muted-foreground"
      >
        Loading pages…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div
        ref={containerRef}
        className="w-64 rounded-lg border bg-popover p-2 shadow-md text-sm text-muted-foreground"
      >
        {query.trim() ? `No pages found for "${query.trim()}"` : 'No pages found'}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role="listbox"
      aria-label="Wiki link suggestions"
      className="w-64 max-h-80 overflow-y-auto subtle-scrollbar rounded-lg border bg-popover p-1 shadow-md"
    >
      {items.map((item, idx) => {
        const isSelected = idx === selectedIndex;
        return (
          <button
            key={item.docName}
            type="button"
            role="option"
            aria-selected={isSelected}
            data-selected={isSelected}
            className={`flex w-full flex-col rounded-md px-2 py-1.5 text-sm text-left ${
              isSelected ? 'bg-accent text-accent-foreground' : ''
            }`}
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(item);
            }}
          >
            <span className="truncate font-medium">
              {item.kind === 'create' ? item.actionLabel : item.title}
            </span>
            {item.kind === 'page' && item.title !== item.docName && (
              <span className="truncate text-xs text-muted-foreground">{item.docName}</span>
            )}
            {item.kind === 'create' && (
              <span className="truncate text-xs text-muted-foreground">{item.docName}.md</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

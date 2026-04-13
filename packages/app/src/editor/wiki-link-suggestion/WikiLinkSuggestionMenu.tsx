import { useEffect, useId, useRef } from 'react';
import type { WikiLinkSuggestionItem } from '../extensions/wiki-link-suggestion';

interface WikiLinkSuggestionMenuProps {
  items: WikiLinkSuggestionItem[];
  query: string;
  selectedIndex: number;
  onSelect: (item: WikiLinkSuggestionItem) => void;
  loading?: boolean;
  error?: string | null;
  mode?: 'page' | 'anchor';
  pageTarget?: string;
  anchorQuery?: string;
}

function itemKey(item: WikiLinkSuggestionItem): string {
  return item.kind === 'anchor' ? `${item.docName}#${item.slug}` : item.docName;
}

export function WikiLinkSuggestionMenu({
  items,
  query,
  selectedIndex,
  onSelect,
  loading = false,
  error = null,
  mode = 'page',
  pageTarget = '',
  anchorQuery = '',
}: WikiLinkSuggestionMenuProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const activeDescendant =
    selectedIndex >= 0 && selectedIndex < items.length
      ? `${listboxId}-option-${selectedIndex}`
      : undefined;

  // Scroll selected item into view
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const options = container.querySelectorAll('[role="option"]');
    const selected = options.item(selectedIndex);
    if (selected) selected.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // Prevent any click on the popup (buttons or empty space) from stealing focus
  // from the editor — without this, Backspace events go to the popup instead.
  const preventFocusSteal = (e: React.MouseEvent) => e.preventDefault();

  if (loading) {
    return (
      <div
        ref={containerRef}
        role="status"
        aria-live="polite"
        className="w-64 rounded-lg border bg-popover p-2 shadow-md text-sm text-muted-foreground"
        style={{ maxHeight: 'var(--suggestion-menu-max-height, 20rem)' }}
        onMouseDown={preventFocusSteal}
      >
        {mode === 'anchor' ? `Loading headings for ${pageTarget}…` : 'Loading pages…'}
      </div>
    );
  }

  if (items.length === 0) {
    const emptyMsg =
      error ??
      (mode === 'anchor'
        ? anchorQuery.trim()
          ? `No headings match "${anchorQuery.trim()}"`
          : `No headings in ${pageTarget}`
        : query.trim()
          ? `No pages found for "${query.trim()}"`
          : 'No pages found');

    return (
      <div
        ref={containerRef}
        role="status"
        aria-live="polite"
        className="w-64 rounded-lg border bg-popover p-2 shadow-md text-sm text-muted-foreground"
        style={{ maxHeight: 'var(--suggestion-menu-max-height, 20rem)' }}
        onMouseDown={preventFocusSteal}
      >
        {emptyMsg}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role="listbox"
      aria-label={mode === 'anchor' ? 'Heading suggestions' : 'Wiki link suggestions'}
      aria-activedescendant={activeDescendant}
      tabIndex={-1}
      onMouseDown={preventFocusSteal}
      className="w-64 overflow-y-auto subtle-scrollbar rounded-lg border bg-popover p-1 shadow-md"
      style={{ maxHeight: 'var(--suggestion-menu-max-height, 20rem)' }}
    >
      {error && (
        <div className="rounded-md px-2 py-1.5 text-xs text-amber-700 dark:text-amber-300">
          {error}
        </div>
      )}
      {mode === 'anchor' && (
        <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {pageTarget}
        </div>
      )}
      {items.map((item, idx) => {
        const isSelected = idx === selectedIndex;
        const key = itemKey(item);

        if (item.kind === 'anchor') {
          return (
            <button
              key={key}
              id={`${listboxId}-option-${idx}`}
              type="button"
              role="option"
              aria-selected={isSelected}
              data-selected={isSelected}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-left ${
                isSelected ? 'bg-accent text-accent-foreground' : ''
              }`}
              style={{ paddingLeft: `${(item.level - 1) * 10 + 8}px` }}
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(item);
              }}
            >
              <span className="w-6 shrink-0 font-mono text-[10px] text-muted-foreground">
                H{item.level}
              </span>
              <span className="truncate font-medium">{item.text}</span>
            </button>
          );
        }

        return (
          <button
            key={key}
            id={`${listboxId}-option-${idx}`}
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

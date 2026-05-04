'use client';

import { Extension } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import type { Editor } from '@tiptap/react';
import { ReactRenderer } from '@tiptap/react';
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from '@tiptap/suggestion';
import { useEffect, useId, useRef } from 'react';
import tippy, { type Instance as TippyInstance } from 'tippy.js';

interface SlashCommandItem {
  name: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  category: string;
  command: (editor: Editor) => void;
  aliases?: string[];
}

function H1Icon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 12h8" />
      <path d="M4 18V6" />
      <path d="M12 18V6" />
      <path d="m17 12 3-2v8" />
    </svg>
  );
}
function H2Icon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 12h8" />
      <path d="M4 18V6" />
      <path d="M12 18V6" />
      <path d="M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1" />
    </svg>
  );
}
function H3Icon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 12h8" />
      <path d="M4 18V6" />
      <path d="M12 18V6" />
      <path d="M17.5 10.5c1.7-1 3.5 0 3.5 1.5a2 2 0 0 1-2 2" />
      <path d="M17 17.5c2 1.5 4 .3 4-1.5a2 2 0 0 0-2-2" />
    </svg>
  );
}
function ListIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <path d="M3 6h.01" />
      <path d="M3 12h.01" />
      <path d="M3 18h.01" />
    </svg>
  );
}
function ListOrderedIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 6h11" />
      <path d="M10 12h11" />
      <path d="M10 18h11" />
      <path d="M4 6h1v4" />
      <path d="M4 10h2" />
      <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
    </svg>
  );
}
function ListTodoIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="6" height="6" rx="1" />
      <path d="m3 17 2 2 4-4" />
      <path d="M13 6h8" />
      <path d="M13 12h8" />
      <path d="M13 18h8" />
    </svg>
  );
}
function QuoteIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z" />
      <path d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z" />
    </svg>
  );
}
function CodeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m18 16 4-4-4-4" />
      <path d="m6 8-4 4 4 4" />
      <path d="m14.5 4-5 16" />
    </svg>
  );
}
function TableIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v18" />
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M3 9h18" />
      <path d="M3 15h18" />
    </svg>
  );
}

const slashCommandItems: SlashCommandItem[] = [
  {
    name: 'heading1',
    label: 'Heading 1',
    icon: H1Icon,
    category: 'basic',
    command: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
    aliases: ['h1'],
  },
  {
    name: 'heading2',
    label: 'Heading 2',
    icon: H2Icon,
    category: 'basic',
    command: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
    aliases: ['h2'],
  },
  {
    name: 'heading3',
    label: 'Heading 3',
    icon: H3Icon,
    category: 'basic',
    command: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
    aliases: ['h3'],
  },
  {
    name: 'bulletList',
    label: 'Bullet List',
    icon: ListIcon,
    category: 'basic',
    command: (e) => e.chain().focus().toggleBulletList().run(),
    aliases: ['ul'],
  },
  {
    name: 'orderedList',
    label: 'Ordered List',
    icon: ListOrderedIcon,
    category: 'basic',
    command: (e) => e.chain().focus().toggleOrderedList().run(),
    aliases: ['ol'],
  },
  {
    name: 'taskList',
    label: 'Task List',
    icon: ListTodoIcon,
    category: 'basic',
    command: (e) => e.chain().focus().toggleTaskList().run(),
    aliases: ['todo'],
  },
  {
    name: 'blockquote',
    label: 'Quote',
    icon: QuoteIcon,
    category: 'basic',
    command: (e) => e.chain().focus().toggleBlockquote().run(),
    aliases: ['quote'],
  },
  {
    name: 'codeBlock',
    label: 'Code Block',
    icon: CodeIcon,
    category: 'basic',
    command: (e) => e.chain().focus().toggleCodeBlock().run(),
    aliases: ['code'],
  },
  {
    name: 'table',
    label: 'Table',
    icon: TableIcon,
    category: 'insert',
    command: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
];

function filterItems(items: SlashCommandItem[], query: string): SlashCommandItem[] {
  if (!query) return items;
  const q = query.toLowerCase();
  return items.filter(
    (item) =>
      item.label.toLowerCase().includes(q) ||
      item.aliases?.some((a) => a.toLowerCase().includes(q)),
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  basic: 'Basic blocks',
  insert: 'Insert',
};

interface SlashMenuProps {
  items: SlashCommandItem[];
  selectedIndex: number;
  onSelect: (item: SlashCommandItem) => void;
}

function SlashCommandMenu({ items, selectedIndex, onSelect }: SlashMenuProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const preventFocusSteal = (e: React.MouseEvent) => e.preventDefault();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const options = container.querySelectorAll('[role="option"]');
    const selected = options.item(selectedIndex);
    if (selected) selected.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (items.length === 0) {
    return (
      <div
        ref={containerRef}
        role="status"
        aria-live="polite"
        className="w-56 rounded-lg border bg-white p-2 text-sm shadow-md dark:bg-neutral-900 dark:border-neutral-700"
        style={{ color: 'var(--slide-muted)', maxHeight: '40vh' }}
        onMouseDown={preventFocusSteal}
      >
        No results
      </div>
    );
  }

  const categories: { key: string; items: SlashCommandItem[] }[] = [];
  let flatIndex = 0;
  const indexMap = new Map<SlashCommandItem, number>();

  for (const item of items) {
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
      tabIndex={-1}
      onMouseDown={preventFocusSteal}
      className="w-56 overflow-y-auto rounded-lg border bg-white p-1 shadow-md dark:bg-neutral-900 dark:border-neutral-700"
      style={{ maxHeight: '40vh' }}
    >
      {categories.map((cat) => (
        <SlashMenuGroup
          key={cat.key}
          cat={cat}
          listboxId={listboxId}
          indexMap={indexMap}
          selectedIndex={selectedIndex}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function SlashMenuGroup({
  cat,
  listboxId,
  indexMap,
  selectedIndex,
  onSelect,
}: {
  cat: { key: string; items: SlashCommandItem[] };
  listboxId: string;
  indexMap: Map<SlashCommandItem, number>;
  selectedIndex: number;
  onSelect: (item: SlashCommandItem) => void;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: WAI-ARIA listbox pattern requires role="group" — <fieldset> is non-standard inside role="listbox"
    <div role="group" aria-labelledby={`${listboxId}-group-${cat.key}`}>
      <div
        id={`${listboxId}-group-${cat.key}`}
        className="px-2 py-1.5 text-xs font-semibold"
        style={{ color: 'var(--slide-muted)' }}
      >
        {CATEGORY_LABELS[cat.key] ?? cat.key}
      </div>
      {cat.items.map((item) => {
        const idx = indexMap.get(item) ?? 0;
        const isSelected = idx === selectedIndex;
        const Icon = item.icon;
        return (
          <button
            key={item.name}
            id={`${listboxId}-option-${idx}`}
            type="button"
            role="option"
            aria-selected={isSelected}
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-left transition-colors ${
              isSelected ? 'bg-neutral-100 dark:bg-neutral-800' : ''
            }`}
            style={{ color: 'var(--slide-text)' }}
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(item);
            }}
          >
            <Icon className="size-4 shrink-0 opacity-50" />
            <span className="truncate">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

const slashCommandKey = new PluginKey('demoSlashCommand');

export const DemoSlashCommand = Extension.create({
  name: 'demoSlashCommand',

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashCommandItem>({
        editor: this.editor,
        pluginKey: slashCommandKey,
        char: '/',
        startOfLine: false,

        items: ({ query }) => filterItems(slashCommandItems, query),

        command: ({ editor, range, props: item }) => {
          editor.chain().focus().deleteRange(range).run();
          item.command(editor);
        },

        render: () => {
          let renderer: ReactRenderer<typeof SlashCommandMenu> | null = null;
          let popup: TippyInstance[] = [];
          let selectedIndex = 0;
          let currentCommand: ((item: SlashCommandItem) => void) | null = null;

          const rerender = (items: SlashCommandItem[]) => {
            if (!renderer) return;
            renderer.updateProps({
              items,
              selectedIndex,
              onSelect: (item: SlashCommandItem) => currentCommand?.(item),
            });
          };

          return {
            onStart(props: SuggestionProps<SlashCommandItem>) {
              selectedIndex = 0;
              currentCommand = props.command;

              renderer = new ReactRenderer(SlashCommandMenu, {
                props: {
                  items: props.items,
                  selectedIndex,
                  onSelect: (item: SlashCommandItem) => currentCommand?.(item),
                },
                editor: props.editor,
              });

              popup = tippy('body', {
                getReferenceClientRect: () => props.clientRect?.() ?? new DOMRect(),
                appendTo: () => document.body,
                content: renderer.element,
                showOnCreate: true,
                interactive: true,
                trigger: 'manual',
                placement: 'bottom-start',
                maxWidth: 'none',
                arrow: false,
                offset: [0, 4],
              });
            },

            onUpdate(props: SuggestionProps<SlashCommandItem>) {
              currentCommand = props.command;
              selectedIndex = Math.min(selectedIndex, Math.max(0, props.items.length - 1));
              rerender(props.items);

              if (popup[0]) {
                popup[0].setProps({
                  getReferenceClientRect: () => props.clientRect?.() ?? new DOMRect(),
                });
              }
            },

            onKeyDown({ event }: SuggestionKeyDownProps) {
              if (!renderer) return false;

              if (event.key === 'ArrowDown') {
                const items = (renderer.props as SlashMenuProps).items;
                selectedIndex = (selectedIndex + 1) % items.length;
                rerender(items);
                return true;
              }
              if (event.key === 'ArrowUp') {
                const items = (renderer.props as SlashMenuProps).items;
                selectedIndex = (selectedIndex - 1 + items.length) % items.length;
                rerender(items);
                return true;
              }
              if (event.key === 'Enter' || event.key === 'Tab') {
                const items = (renderer.props as SlashMenuProps).items;
                const item = items[selectedIndex];
                if (item) currentCommand?.(item);
                return true;
              }
              return false;
            },

            onExit() {
              for (const p of popup) p.destroy();
              popup = [];
              renderer?.destroy();
              renderer = null;
              currentCommand = null;
              selectedIndex = 0;
            },
          };
        },
      }),
    ];
  },
});

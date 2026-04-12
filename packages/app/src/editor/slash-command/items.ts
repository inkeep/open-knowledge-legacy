import { ALLOWED_IMAGE_MIME_TYPES } from '@inkeep/open-knowledge-core';
import type { Editor } from '@tiptap/react';
import {
  Code2,
  Heading1,
  Heading2,
  Heading3,
  ImageIcon,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Quote,
  Table2,
} from 'lucide-react';
import { uploadAndInsert } from '../image-upload';

/**
 * A slash command menu item.
 *
 * Items are grouped by category in the menu. The extension handles trigger
 * detection, range deletion, and keyboard navigation — item commands only
 * need to insert/toggle the desired content.
 */
export interface SlashCommandItem {
  /** Unique identifier (used as React key) */
  name: string;

  /** Display label shown in the menu */
  label: string;

  /** Lucide icon component */
  icon: React.ComponentType<{ className?: string }>;

  /**
   * Category key for grouping. Built-in categories: `basic`, `insert`.
   * Downstream consumers can add custom categories by registering labels
   * via `SlashCommand.configure({ categoryLabels: {...} })`.
   */
  category: string;

  /**
   * Command to execute when the item is selected. The extension deletes
   * the trigger range (`/query`) before calling this, so commands can
   * directly insert or toggle content without worrying about cleanup.
   */
  command: (editor: Editor) => void;

  /** Alternative search terms (e.g., `['h1']` for "Heading 1") */
  aliases?: string[];

  /**
   * Optional description for future UI enhancements (not currently displayed).
   * Reserved for tooltips or expanded menu views.
   */
  description?: string;
}

/**
 * Built-in slash command items — headings, lists, quote, code, table, separator.
 * Organized into two categories: `basic` (formatting blocks) and `insert` (special blocks).
 */
export const slashCommandItems: SlashCommandItem[] = [
  // Basic blocks
  {
    name: 'heading1',
    label: 'Heading 1',
    icon: Heading1,
    category: 'basic',
    command: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    aliases: ['h1'],
  },
  {
    name: 'heading2',
    label: 'Heading 2',
    icon: Heading2,
    category: 'basic',
    command: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    aliases: ['h2'],
  },
  {
    name: 'heading3',
    label: 'Heading 3',
    icon: Heading3,
    category: 'basic',
    command: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    aliases: ['h3'],
  },
  {
    name: 'bulletList',
    label: 'Bullet List',
    icon: List,
    category: 'basic',
    command: (editor) => editor.chain().focus().toggleBulletList().run(),
    aliases: ['ul', 'unordered'],
  },
  {
    name: 'orderedList',
    label: 'Ordered List',
    icon: ListOrdered,
    category: 'basic',
    command: (editor) => editor.chain().focus().toggleOrderedList().run(),
    aliases: ['ol', 'numbered'],
  },
  {
    name: 'taskList',
    label: 'Task List',
    icon: ListTodo,
    category: 'basic',
    command: (editor) => editor.chain().focus().toggleTaskList().run(),
    aliases: ['todo', 'checklist', 'checkbox'],
  },
  {
    name: 'blockquote',
    label: 'Quote',
    icon: Quote,
    category: 'basic',
    command: (editor) => editor.chain().focus().toggleBlockquote().run(),
    aliases: ['quote'],
  },
  {
    name: 'codeBlock',
    label: 'Code Block',
    icon: Code2,
    category: 'basic',
    command: (editor) => editor.chain().focus().toggleCodeBlock().run(),
    aliases: ['code', 'fence'],
  },
  // Insert blocks
  {
    name: 'table',
    label: 'Table',
    icon: Table2,
    category: 'insert',
    command: (editor) =>
      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    aliases: ['grid'],
  },
  {
    name: 'separator',
    label: 'Separator',
    icon: Minus,
    category: 'insert',
    command: (editor) => editor.chain().focus().setHorizontalRule().run(),
    aliases: ['hr', 'divider', 'rule'],
  },
  {
    name: 'image',
    label: 'Image',
    icon: ImageIcon,
    category: 'insert',
    aliases: ['img', 'photo'],
    command: (editor) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = ALLOWED_IMAGE_MIME_TYPES.join(',');
      input.onchange = () => {
        const file = input.files?.[0];
        if (file) {
          const pos = editor.state.selection.from;
          uploadAndInsert(file, editor, pos);
        }
      };
      input.click();
    },
  },
];

/**
 * Filter items by search query. Matches against label, name, and aliases.
 * Used by the slash command extension; exported for reuse by custom menus
 * (e.g., block-editor-ux "+" button).
 */
export function filterItems(items: SlashCommandItem[], query: string): SlashCommandItem[] {
  if (!query) return items;
  const lower = query.toLowerCase();
  return items.filter(
    (item) =>
      item.label.toLowerCase().includes(lower) ||
      item.name.toLowerCase().includes(lower) ||
      item.aliases?.some((a) => a.toLowerCase().includes(lower)),
  );
}

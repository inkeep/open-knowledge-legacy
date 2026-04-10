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

export interface SlashCommandItem {
  name: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  category: 'basic' | 'insert';
  command: (editor: Editor) => void;
  aliases?: string[];
}

export const slashCommandItems: SlashCommandItem[] = [
  // Basic blocks
  {
    name: 'heading1',
    label: 'Heading 1',
    description: 'Large section heading',
    icon: Heading1,
    category: 'basic',
    command: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    aliases: ['h1'],
  },
  {
    name: 'heading2',
    label: 'Heading 2',
    description: 'Medium section heading',
    icon: Heading2,
    category: 'basic',
    command: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    aliases: ['h2'],
  },
  {
    name: 'heading3',
    label: 'Heading 3',
    description: 'Small section heading',
    icon: Heading3,
    category: 'basic',
    command: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    aliases: ['h3'],
  },
  {
    name: 'bulletList',
    label: 'Bullet List',
    description: 'Unordered list',
    icon: List,
    category: 'basic',
    command: (editor) => editor.chain().focus().toggleBulletList().run(),
    aliases: ['ul', 'unordered'],
  },
  {
    name: 'orderedList',
    label: 'Ordered List',
    description: 'Numbered list',
    icon: ListOrdered,
    category: 'basic',
    command: (editor) => editor.chain().focus().toggleOrderedList().run(),
    aliases: ['ol', 'numbered'],
  },
  {
    name: 'taskList',
    label: 'To-do List',
    description: 'Checklist with tasks',
    icon: ListTodo,
    category: 'basic',
    command: (editor) => editor.chain().focus().toggleTaskList().run(),
    aliases: ['todo', 'checklist', 'checkbox'],
  },
  {
    name: 'blockquote',
    label: 'Blockquote',
    description: 'Quoted text block',
    icon: Quote,
    category: 'basic',
    command: (editor) => editor.chain().focus().toggleBlockquote().run(),
    aliases: ['quote'],
  },
  {
    name: 'codeBlock',
    label: 'Code Block',
    description: 'Fenced code block',
    icon: Code2,
    category: 'basic',
    command: (editor) => editor.chain().focus().toggleCodeBlock().run(),
    aliases: ['code', 'fence'],
  },
  // Insert blocks
  {
    name: 'table',
    label: 'Table',
    description: 'Insert a table',
    icon: Table2,
    category: 'insert',
    command: (editor) =>
      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    aliases: ['grid'],
  },
  {
    name: 'separator',
    label: 'Separator',
    description: 'Horizontal divider',
    icon: Minus,
    category: 'insert',
    command: (editor) => editor.chain().focus().setHorizontalRule().run(),
    aliases: ['hr', 'divider', 'rule'],
  },
  {
    name: 'image',
    label: 'Image',
    description: 'Insert an image from URL',
    icon: ImageIcon,
    category: 'insert',
    command: (editor) => {
      const url = window.prompt('Image URL');
      if (url) {
        editor.chain().focus().setImage({ src: url }).run();
      }
    },
    aliases: ['img', 'picture'],
  },
];

export function filterItems(items: SlashCommandItem[], query: string): SlashCommandItem[] {
  if (!query) return items;
  const lower = query.toLowerCase();
  return items.filter(
    (item) =>
      item.label.toLowerCase().includes(lower) ||
      item.name.toLowerCase().includes(lower) ||
      item.aliases?.some((a) => a.includes(lower)),
  );
}

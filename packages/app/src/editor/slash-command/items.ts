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

export interface SlashCommandItem {
  name: string;
  label: string;
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
    command: (editor: Editor) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
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

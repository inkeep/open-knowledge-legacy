import type { Editor } from '@tiptap/react';
import {
  Code2,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Quote,
  Sigma,
  Table2,
} from 'lucide-react';
import type { ReactNode } from 'react';

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

  /**
   * Optional hover preview shown alongside the menu when this item is selected
   * (via mouse hover or keyboard navigation). Items without a preview cause the
   * side panel to disappear.
   */
  preview?: {
    description: string;
    render: () => ReactNode;
  };
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
    preview: {
      description: 'Big section heading.',
      render: () => <h1 className="text-2xl font-semibold tracking-tight">Heading 1</h1>,
    },
  },
  {
    name: 'heading2',
    label: 'Heading 2',
    icon: Heading2,
    category: 'basic',
    command: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    aliases: ['h2'],
    preview: {
      description: 'Medium section heading.',
      render: () => <h2 className="text-xl font-semibold tracking-tight">Heading 2</h2>,
    },
  },
  {
    name: 'heading3',
    label: 'Heading 3',
    icon: Heading3,
    category: 'basic',
    command: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    aliases: ['h3'],
    preview: {
      description: 'Small section heading.',
      render: () => <h3 className="text-base font-semibold tracking-tight">Heading 3</h3>,
    },
  },
  {
    name: 'bulletList',
    label: 'Bullet List',
    icon: List,
    category: 'basic',
    command: (editor) => editor.chain().focus().toggleBulletList().run(),
    aliases: ['ul', 'unordered'],
    preview: {
      description: 'Unordered list of items.',
      render: () => (
        <ul className="list-disc pl-5 text-sm leading-7">
          <li>First item</li>
          <li>Second item</li>
        </ul>
      ),
    },
  },
  {
    name: 'orderedList',
    label: 'Ordered List',
    icon: ListOrdered,
    category: 'basic',
    command: (editor) => editor.chain().focus().toggleOrderedList().run(),
    aliases: ['ol', 'numbered'],
    preview: {
      description: 'Numbered list of items.',
      render: () => (
        <ol className="list-decimal pl-5 text-sm leading-7">
          <li>First item</li>
          <li>Second item</li>
        </ol>
      ),
    },
  },
  {
    name: 'taskList',
    label: 'Task List',
    icon: ListTodo,
    category: 'basic',
    command: (editor) => editor.chain().focus().toggleTaskList().run(),
    aliases: ['todo', 'checklist', 'checkbox'],
    preview: {
      description: 'Checklist with checkboxes.',
      render: () => (
        <ul className="space-y-1.5 text-sm">
          <li className="flex items-center gap-2">
            <input type="checkbox" checked readOnly className="size-3.5" />
            <span className="text-muted-foreground line-through">Done</span>
          </li>
          <li className="flex items-center gap-2">
            <input type="checkbox" readOnly className="size-3.5" />
            <span>To do</span>
          </li>
        </ul>
      ),
    },
  },
  {
    name: 'blockquote',
    label: 'Quote',
    icon: Quote,
    category: 'basic',
    command: (editor) => editor.chain().focus().toggleBlockquote().run(),
    aliases: ['quote'],
    preview: {
      description: 'Indented blockquote for citations.',
      render: () => (
        <blockquote className="border-l-2 border-muted-foreground/40 pl-3 text-sm italic text-muted-foreground">
          A pull quote stands out from the surrounding text.
        </blockquote>
      ),
    },
  },
  {
    name: 'codeBlock',
    label: 'Code Block',
    icon: Code2,
    category: 'basic',
    command: (editor) => editor.chain().focus().toggleCodeBlock().run(),
    aliases: ['code', 'fence'],
    preview: {
      description: 'Fenced code block with monospace text.',
      render: () => (
        <pre className="rounded-md bg-muted px-2.5 py-2 font-mono text-xs leading-5">
          <code>{'const greeting = "Hello";\nconsole.log(greeting);'}</code>
        </pre>
      ),
    },
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
    preview: {
      description: 'Grid of rows and columns with a header row.',
      render: () => (
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="border border-border bg-muted/50 px-2 py-1 text-left font-semibold">
                Name
              </th>
              <th className="border border-border bg-muted/50 px-2 py-1 text-left font-semibold">
                Role
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-border px-2 py-1">Ada</td>
              <td className="border border-border px-2 py-1">Engineer</td>
            </tr>
            <tr>
              <td className="border border-border px-2 py-1">Grace</td>
              <td className="border border-border px-2 py-1">Admiral</td>
            </tr>
          </tbody>
        </table>
      ),
    },
  },
  {
    name: 'separator',
    label: 'Separator',
    icon: Minus,
    category: 'insert',
    command: (editor) => editor.chain().focus().setHorizontalRule().run(),
    aliases: ['hr', 'divider', 'rule'],
    preview: {
      description: 'Horizontal rule that divides sections.',
      render: () => (
        <div className="w-full">
          <p className="mb-2 text-xs text-muted-foreground">Above</p>
          <hr className="border-border" />
          <p className="mt-2 text-xs text-muted-foreground">Below</p>
        </div>
      ),
    },
  },
  {
    // Inline math goes in the static list (not the descriptor-driven
    // `getComponentItems`) because `mathInline` is a PM atom node, not a
    // registered descriptor — it bypasses the registry to avoid lifting
    // NG14 on jsxInline. Insert with empty formula; author edits in
    // source mode (`$x$`) since the WYSIWYG inline atom has no
    // PropPanel-style chrome today.
    name: 'inline-math',
    label: 'Inline Math',
    icon: Sigma,
    category: 'insert',
    command: (editor) => editor.chain().focus().insertMathInline('').run(),
    aliases: ['math', 'latex', 'equation', 'formula', 'katex', 'inlinemath'],
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

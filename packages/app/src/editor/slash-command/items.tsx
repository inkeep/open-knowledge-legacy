import type { Editor } from '@tiptap/react';
import {
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  List,
  ListOrdered,
  ListTodo,
  MessageSquare,
  MessageSquareText,
  Minus,
  Quote,
  Sigma,
  Superscript,
  Table2,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { setPendingAutoOpen } from './component-items';

export interface SlashCommandItem {
  name: string;

  label: string;

  icon: React.ComponentType<{ className?: string }>;

  category: string;

  command: (editor: Editor) => void;

  aliases?: string[];

  description?: string;

  preview?: {
    description: string;
    render: () => ReactNode;
  };
}

export const slashCommandItems: SlashCommandItem[] = [
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
    name: 'highlight',
    label: 'Highlight',
    icon: Highlighter,
    category: 'basic',
    command: (editor) => editor.chain().focus().toggleHighlight().run(),
    aliases: ['mark', 'yellow', '=='],
    preview: {
      description: 'Highlight selected text with a yellow background.',
      render: () => (
        <p className="text-sm leading-6">
          The <mark className="rounded px-0.5">important phrase</mark> stands out from the
          surrounding prose.
        </p>
      ),
    },
  },
  {
    name: 'comment',
    label: 'Comment',
    icon: MessageSquare,
    category: 'basic',
    command: (editor) => editor.chain().focus().toggleComment().run(),
    aliases: ['hidden', 'note', '%%'],
    preview: {
      description: 'Mark selected text as an author-private comment, rendered italic and muted.',
      render: () => (
        <p className="text-sm leading-6">
          A line with{' '}
          <span className="italic text-muted-foreground/70">an author-private note</span> rendered
          alongside the regular prose.
        </p>
      ),
    },
  },
  {
    name: 'footnote',
    label: 'Footnote',
    icon: Superscript,
    category: 'insert',
    command: (editor) => {
      let maxId = 0;
      editor.state.doc.descendants((node) => {
        if (node.type.name === 'footnoteDefinition') {
          const id = String(node.attrs.identifier ?? '');
          const n = Number.parseInt(id, 10);
          if (!Number.isNaN(n) && n > maxId) maxId = n;
        }
        return true;
      });
      const next = String(maxId + 1);
      const docEnd = editor.state.doc.content.size;
      editor
        .chain()
        .focus()
        .insertFootnoteReference(next)
        .insertContentAt(docEnd + 1, {
          type: 'footnoteDefinition',
          attrs: { identifier: next, label: next },
          content: [{ type: 'paragraph' }],
        })
        .run();
    },
    aliases: ['fn', 'ref', '[^'],
    preview: {
      description: 'Insert a footnote reference + matching definition stub.',
      render: () => (
        <p className="text-sm leading-6">
          A line with a footnote
          <sup className="footnote-ref">
            <a className="footnote-ref-link" href="#fn-1">
              [1]
            </a>
          </sup>{' '}
          and a definition shown below.
        </p>
      ),
    },
  },
  {
    name: 'commentBlock',
    label: 'Comment Block',
    icon: MessageSquareText,
    category: 'insert',
    command: (editor) => editor.chain().focus().toggleCommentBlock().run(),
    aliases: ['comment-block', 'hidden-block', 'note-block'],
    preview: {
      description: 'Wrap multiple lines of content as an author-private comment block.',
      render: () => (
        <aside className="border-l-2 border-muted-foreground/30 pl-3 italic text-muted-foreground/70 text-sm leading-6">
          A multi-line comment that spans paragraphs, rendered italic and muted alongside
          surrounding content.
        </aside>
      ),
    },
  },
  {
    name: 'inlineMath',
    label: 'Inline Math',
    icon: Sigma,
    category: 'insert',
    command: (editor) => {
      const insertPos = editor.state.selection.from;
      editor.chain().focus().insertMathInline('').run();
      setPendingAutoOpen(insertPos);
      requestAnimationFrame(() => {
        editor.commands.setNodeSelection(insertPos);
      });
    },
    aliases: ['math', 'latex', 'equation', 'formula', 'katex', 'inlinemath'],
  },
];

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

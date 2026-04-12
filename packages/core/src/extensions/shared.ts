/**
 * Shared extension list used by the editor, persistence layer, and round-trip tests.
 * Single source of truth — drift between these causes silent data corruption.
 */
import Highlight from '@tiptap/extension-highlight';
import Image from '@tiptap/extension-image';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import StarterKit from '@tiptap/starter-kit';
import { BulletListFidelity } from './bullet-list-fidelity.ts';
import { JsxComponent } from './jsx-component.ts';
import { ListItemFidelity } from './list-item-fidelity.ts';
import { OrderedListFidelity } from './ordered-list-fidelity.ts';
import { WikiLink } from './wiki-link.ts';

export const sharedExtensions = [
  // JsxComponent MUST be before StarterKit so its markdown parseMarkdown handler
  // for 'code' tokens runs before codeBlock's handler (registry uses insertion order).
  JsxComponent,
  // WikiLink also needs to register before StarterKit so its custom tokenizer is
  // part of the shared markdown schema everywhere we parse or serialize markdown.
  WikiLink,
  // Tier 2 fidelity overrides: must be before StarterKit so they override
  // the built-in list extensions (higher priority = wins on same token type).
  BulletListFidelity,
  OrderedListFidelity,
  ListItemFidelity,
  StarterKit.configure({
    undoRedo: false,
    link: {
      openOnClick: false,
      HTMLAttributes: {
        target: '_blank',
        rel: 'noopener noreferrer',
      },
    },
  }),
  Table.configure({
    resizable: true,
  }),
  TableRow,
  TableHeader,
  TableCell,
  Image,
  TaskList,
  TaskItem,
  Highlight,
];

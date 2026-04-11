/**
 * Shared extension list used by the editor, persistence layer, and round-trip tests.
 * Single source of truth — drift between these causes silent data corruption.
 */
import Highlight from '@tiptap/extension-highlight';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import StarterKit from '@tiptap/starter-kit';
import { JsxComponent } from './jsx-component.ts';

export const sharedExtensions = [
  // JsxComponent MUST be before StarterKit so its markdown parseMarkdown handler
  // for 'code' tokens runs before codeBlock's handler (registry uses insertion order).
  JsxComponent,
  StarterKit.configure({ undoRedo: false, link: false }),
  Table.configure({
    resizable: true,
  }),
  TableRow,
  TableHeader,
  TableCell,
  Image,
  Link.configure({
    openOnClick: false,
    HTMLAttributes: {
      target: '_blank',
      rel: 'noopener noreferrer',
    },
  }),
  TaskList,
  TaskItem,
  Highlight,
];

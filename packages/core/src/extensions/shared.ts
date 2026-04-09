/**
 * Shared extension list used by the editor, persistence layer, and round-trip tests.
 * Single source of truth — drift between these causes silent data corruption.
 */
import Image from '@tiptap/extension-image';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import StarterKit from '@tiptap/starter-kit';
import { JsxComponent } from './jsx-component.ts';

export const sharedExtensions = [
  // JsxComponent MUST be before StarterKit so its 'jsxBlock' markdownTokenizer
  // is registered before codeBlock's handler (marked extension insertion order).
  JsxComponent,
  StarterKit.configure({ undoRedo: false }),
  Table,
  TableRow,
  TableHeader,
  TableCell,
  Image,
  TaskList,
  TaskItem,
];

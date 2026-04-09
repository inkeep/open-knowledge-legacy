/**
 * Shared TipTap extension list — used by the browser editor AND the server-side
 * MarkdownManager/schema. Must stay identical on both sides; drift causes silent
 * data corruption (different schemas produce different ProseMirror JSON).
 */
import Image from '@tiptap/extension-image';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import StarterKit from '@tiptap/starter-kit';
import { JsxComponent } from './jsx-component';

export const sharedExtensions = [
  // JsxComponent before StarterKit: its parseMarkdown for 'code' tokens must run
  // before codeBlock's handler (TipTap markdown registry uses insertion order).
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

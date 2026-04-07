/**
 * Shared extension list used by the editor, persistence layer, and round-trip tests.
 * Single source of truth — drift between these causes silent data corruption.
 */
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Table } from '@tiptap/extension-table';
import StarterKit from '@tiptap/starter-kit';
import { JsxComponent } from './jsx-component';

export const sharedExtensions = [
  StarterKit.configure({ undoRedo: false }),
  Link,
  Table,
  Image,
  TaskList,
  TaskItem,
  JsxComponent,
];

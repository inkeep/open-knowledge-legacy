/**
 * Shared extension list used by the editor, persistence layer, and round-trip tests.
 * Single source of truth — drift between these causes silent data corruption.
 *
 * The factory call is centralized HERE so every consumer that imports
 * sharedExtensions automatically gets the registry-aware extension set.
 * None of the 9 sites need to import the factory directly (R12).
 */
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import StarterKit from '@tiptap/starter-kit';
import { componentManifest } from '../generated/components.ts';
import { createJsxComponentExtensions } from '../registry/jsx-component-factory.ts';

// Factory call — runs once at module load (ESM single-instance semantics).
// The manifest is committed as synchronous ESM — no async boot needed.
const { editable: jsxComponentEditable, void: jsxComponentVoid } =
  createJsxComponentExtensions(componentManifest);

export { jsxComponentEditable, jsxComponentVoid };

export const sharedExtensions = [
  // JsxComponent extensions MUST be before StarterKit so the 'jsxBlock'
  // markdownTokenizer is registered before codeBlock's handler.
  jsxComponentEditable,
  jsxComponentVoid,
  StarterKit.configure({ undoRedo: false }),
  Table,
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
];

/**
 * Shared extension list used by the editor, persistence layer, and round-trip tests.
 * Single source of truth — drift between these causes silent data corruption.
 *
 * The factory call is centralized HERE so every consumer that imports
 * sharedExtensions automatically gets the registry-aware extension set.
 * None of the 9 sites need to import the factory directly (R12).
 */
import Highlight from '@tiptap/extension-highlight';
import Image from '@tiptap/extension-image';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import StarterKit from '@tiptap/starter-kit';
import { componentManifest } from '../generated/components.ts';
import { createJsxComponentExtensions } from '../registry/jsx-component-factory.ts';
import { WikiLink } from './wiki-link.ts';

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
  // WikiLink also needs to register before StarterKit so its custom tokenizer is
  // part of the shared markdown schema everywhere we parse or serialize markdown.
  WikiLink,
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

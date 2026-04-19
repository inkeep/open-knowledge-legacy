/**
 * Shared extension list used by the editor, persistence layer, and round-trip tests.
 * Single source of truth — drift between these causes silent data corruption.
 */
import Highlight from '@tiptap/extension-highlight';
import Image from '@tiptap/extension-image';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import StarterKit from '@tiptap/starter-kit';
import { CodeBlockFidelity } from './code-block-fidelity.ts';
import { CodeMarkFidelity } from './code-mark-fidelity.ts';
import { EmphasisFidelity, StrongFidelity } from './emphasis-fidelity.ts';
import { EscapeMark } from './escape-mark.ts';
import { HardBreakFidelity } from './hard-break-fidelity.ts';
import { HeadingFidelity } from './heading-fidelity.ts';
import { HtmlBlockFidelity } from './html-block-fidelity.ts';
import { JsxComponent } from './jsx-component.ts';
import { JsxInline } from './jsx-inline.ts';
import { LinkFidelity } from './link-fidelity.ts';
import { LinkRefDefFidelity } from './link-ref-def-fidelity.ts';
import { List, ListItem } from './list.ts';
import { RawMdxFallback } from './raw-mdx-fallback.ts';
import { ThematicBreakFidelity } from './thematic-break-fidelity.ts';
import { WikiLink } from './wiki-link.ts';

export const sharedExtensions = [
  // JsxComponent MUST be before StarterKit so its schema is registered.
  JsxComponent,
  // rawMdxFallback holds raw source for blocks that fail to parse (R5/R6).
  RawMdxFallback,
  // jsxInline at T1 Layer 3 target shape (R3) — inline MDX like <Icon />.
  JsxInline,
  // WikiLink also needs to register before StarterKit.
  WikiLink,
  // Unified list extension (D15) — replaces BulletListFidelity, OrderedListFidelity,
  // ListItemFidelity, TaskList, TaskItem with a single list+listItem NodeSpec.
  List,
  ListItem,
  // Fidelity overrides: StarterKit built-ins are disabled (e.g. bold: false)
  // so these extensions are the active definitions, not overrides.
  // D16: bold→strong, italic→emphasis (mark names). StarterKit disable keys stay
  // as 'bold'/'italic' because those are TipTap extension keys, not schema names.
  EmphasisFidelity,
  StrongFidelity,
  // R24 (US-017): override @tiptap/extension-code's `excludes: '_'`
  // so the Code mark can coexist with emphasis/strong on the same span.
  // CommonMark allows it; the upstream exclusion broke round-trip for
  // `*a \`*\`*` and `_a \`_\`_` inputs.
  CodeMarkFidelity,
  CodeBlockFidelity,
  HeadingFidelity,
  // D17: horizontalRule→thematicBreak (node name)
  ThematicBreakFidelity,
  LinkFidelity,
  HtmlBlockFidelity,
  LinkRefDefFidelity,
  HardBreakFidelity,
  // D20: escapeMark for structurally-ambiguous backslash escapes
  EscapeMark,
  StarterKit.configure({
    undoRedo: false,
    bulletList: false,
    orderedList: false,
    listItem: false,
    italic: false,
    bold: false,
    code: false,
    codeBlock: false,
    heading: false,
    horizontalRule: false,
    hardBreak: false,
    link: false,
  }),
  Table.configure({
    resizable: true,
  }),
  TableRow,
  TableHeader,
  TableCell,
  Image.configure({ inline: true }),
  Highlight,
];

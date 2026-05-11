import Highlight from '@tiptap/extension-highlight';
import { TableRow } from '@tiptap/extension-table';
import StarterKit from '@tiptap/starter-kit';
import { BlockquoteFidelity } from './blockquote-fidelity.ts';
import { CodeBlockFidelity } from './code-block-fidelity.ts';
import { CodeMarkFidelity } from './code-mark-fidelity.ts';
import { CommentBlock } from './comment-block.ts';
import { CommentMark } from './comment-mark.ts';
import { EmphasisFidelity, StrongFidelity } from './emphasis-fidelity.ts';
import { EscapeMark } from './escape-mark.ts';
import { FootnoteDefinition } from './footnote-definition.ts';
import { FootnoteReference } from './footnote-reference.ts';
import { HardBreakFidelity } from './hard-break-fidelity.ts';
import { HeadingFidelity } from './heading-fidelity.ts';
import { HtmlBlockFidelity } from './html-block-fidelity.ts';
import { ImageReferenceFidelity } from './image-reference-fidelity.ts';
import { ImageSrcFidelity } from './image-src-fidelity.ts';
import { JsxComponent } from './jsx-component.ts';
import { JsxInline } from './jsx-inline.ts';
import { LinkFidelity } from './link-fidelity.ts';
import { LinkRefDefFidelity } from './link-ref-def-fidelity.ts';
import { List, ListItem } from './list.ts';
import { MathInline } from './math-inline.ts';
import { RawMdxFallback } from './raw-mdx-fallback.ts';
import { SourceLiteralMark } from './source-literal-mark.ts';
import { TableCellFidelity, TableFidelity, TableHeaderFidelity } from './table-fidelity.ts';
import { Tag } from './tag.ts';
import { ThematicBreakFidelity } from './thematic-break-fidelity.ts';
import { WikiLink } from './wiki-link.ts';
import { WikiLinkEmbed } from './wiki-link-embed.ts';

export const sharedExtensions = [
  JsxComponent,
  RawMdxFallback,
  JsxInline,
  MathInline,
  WikiLink,
  WikiLinkEmbed,
  Tag,
  List,
  ListItem,
  EmphasisFidelity,
  StrongFidelity,
  CodeMarkFidelity,
  CodeBlockFidelity,
  BlockquoteFidelity,
  HeadingFidelity,
  ThematicBreakFidelity,
  LinkFidelity,
  HtmlBlockFidelity,
  LinkRefDefFidelity,
  HardBreakFidelity,
  EscapeMark,
  SourceLiteralMark,
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
    blockquote: false,
    dropcursor: {
      color: 'color-mix(in oklch, var(--primary) 50%, transparent)',
      width: 2,
    },
  }),
  TableFidelity.configure({
    resizable: true,
  }),
  TableRow,
  TableHeaderFidelity,
  TableCellFidelity,
  ImageSrcFidelity.configure({ inline: true }),
  ImageReferenceFidelity,
  Highlight,
  CommentMark,
  CommentBlock,
  FootnoteReference,
  FootnoteDefinition,
];

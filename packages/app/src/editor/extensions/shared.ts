/**
 * App-specific shared extensions — uses core's sharedExtensions but swaps
 * JsxComponent for the React-enabled version with NodeView, and adds
 * app-only extensions (slash command menu, etc.).
 */
import { sharedExtensions as coreExtensions } from '@inkeep/open-knowledge-core';
import FileHandler from '@tiptap/extension-file-handler';
import { uploadAndInsert } from '../image-upload/index.ts';
import { BlockMover } from './block-mover';
import { BlockDragHandle } from './drag-handle';
import { HeadingAnchors } from './heading-anchors';
import { InternalLink } from './internal-link';
import { JsxComponent } from './jsx-component';
import { RawMdxFallback } from './raw-mdx-fallback';
import { SlashCommand } from './slash-command';
import { WikiLink } from './wiki-link';
import { WikiLinkEmbed } from './wiki-link-embed';

// Replace core extensions that have app-side NodeViews or mark views.
export const sharedExtensions = [
  ...coreExtensions.map((ext) => {
    if (ext.name === 'jsxComponent') return JsxComponent;
    if (ext.name === 'rawMdxFallback') return RawMdxFallback;
    if (ext.name === 'wikiLink') return WikiLink;
    if (ext.name === 'wikiLinkEmbed') return WikiLinkEmbed;
    if (ext.name === 'link') return InternalLink;
    return ext;
  }),
  SlashCommand,
  // SPEC §6 D-M accept-all: omit `allowedMimeTypes` so the FileHandler
  // accepts every browser-readable file type. The server is the single
  // policy point — post-streaming (2026-04-22) there's no user-facing
  // cap either; disk fullness (`storage-full` → 507) is the only
  // rejection axis, and the SVG `<img>`-only NFR-3 routing happens
  // server-side. See reports/streaming-upload-refactor/REPORT.md §D8.
  FileHandler.configure({
    onDrop(editor, files, pos) {
      for (const file of files) {
        uploadAndInsert(file, editor, pos);
      }
    },
    onPaste(editor, files, _html) {
      for (const file of files) {
        uploadAndInsert(file, editor, editor.state.selection.from);
      }
    },
  }),
  HeadingAnchors,
  BlockDragHandle,
  BlockMover,
];

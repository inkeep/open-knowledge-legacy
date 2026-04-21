/**
 * App-specific shared extensions — uses core's sharedExtensions but swaps
 * JsxComponent for the React-enabled version with NodeView, and adds
 * app-only extensions (slash command menu, etc.).
 */
import {
  ALLOWED_IMAGE_MIME_TYPES,
  sharedExtensions as coreExtensions,
} from '@inkeep/open-knowledge-core';
import FileHandler from '@tiptap/extension-file-handler';
import { KeyboardNav } from '../block-ux/keyboard-nav';
import { uploadAndInsert } from '../image-upload/index.ts';
import { getComponentItems } from '../slash-command/component-items';
import { slashCommandItems } from '../slash-command/items';
import { BlockMover } from './block-mover';
// BridgeIdPlugin re-enabled — SelectionStatePlugin consumes it to resolve
// stable ancestor-chain IDs across PM re-renders (see Precedent "Selection
// state as typed PM PluginState"). Plugin falls back to pos-derived
// synthetic IDs if absent (unit-test path); production wants the real
// Y.XmlElement-keyed IDs. The Context Bridge Registry that originally
// consumed this was deleted in favor of Fallback 2 (see AGENTS.md
// "Compound components use DOM data-attributes"); bridge-id-plugin lives
// on as a standalone stable-identity primitive.
import { BridgeIdPlugin } from './bridge-id-plugin';
import { BlockDragHandle } from './drag-handle';
import { HeadingAnchors } from './heading-anchors';
import { InternalLink } from './internal-link';
import { JsxComponent } from './jsx-component';
import { RawMdxFallback } from './raw-mdx-fallback';
import { SelectionStatePlugin } from './selection-state-plugin';
import { SlashCommand } from './slash-command';
import { SourceDirtyObserver } from './source-dirty-observer';
import { TypedChildrenGuard } from './typed-children-guard';
import { WikiLink } from './wiki-link';

// Replace core extensions that have app-side NodeViews or mark views.
export const sharedExtensions = [
  ...coreExtensions.map((ext) => {
    if (ext.name === 'jsxComponent') return JsxComponent;
    if (ext.name === 'rawMdxFallback') return RawMdxFallback;
    if (ext.name === 'wikiLink') return WikiLink;
    if (ext.name === 'link') return InternalLink;
    return ext;
  }),
  SlashCommand.configure({
    itemsSources: [() => slashCommandItems, () => getComponentItems()],
    categoryLabels: {
      content: 'Components',
      layout: 'Layout',
      media: 'Media',
      data: 'Data',
    },
  }),
  FileHandler.configure({
    allowedMimeTypes: [...ALLOWED_IMAGE_MIME_TYPES],
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
  // BlockDragHandle — drag grip + "+" button in the left margin on block hover.
  // Registers DragHandlePlugin imperatively (bare DOM container, NOT a React
  // component) so Activity mode flips don't trigger React's removeChild
  // reconciliation error. The `lockDragHandle` / `unlockDragHandle` commands
  // that other surfaces (PropPanel, slash menu) used to get from the stock
  // `DragHandle.extend({...})` are still available — `DragHandlePlugin`
  // registers them as part of the plugin.
  BlockDragHandle,
  BlockMover,
  SourceDirtyObserver,
  TypedChildrenGuard,
  KeyboardNav,
  // Selection layer — must come after BridgeIdPlugin so ancestor-chain
  // lookups resolve stable IDs. Order is load-bearing only wrt BridgeId;
  // KeyboardNav is orthogonal.
  // Placeholder moved to TiptapEditor.tsx (new-doc affordances, PR #157)
  // so it can be configured per-editor-instance with context-aware text.
  BridgeIdPlugin,
  SelectionStatePlugin,
];

/**
 * App-specific shared extensions — uses core's sharedExtensions but swaps
 * JsxComponent for the React-enabled version with NodeView, and adds
 * app-only extensions (slash command menu, etc.).
 */
import {
  ALLOWED_IMAGE_MIME_TYPES,
  sharedExtensions as coreExtensions,
} from '@inkeep/open-knowledge-core';
import { DragHandle } from '@tiptap/extension-drag-handle';
import FileHandler from '@tiptap/extension-file-handler';
import Placeholder from '@tiptap/extension-placeholder';
import { KeyboardNav } from '../block-ux/KeyboardNav';
import { uploadAndInsert } from '../image-upload/index.ts';
import { getComponentItems } from '../slash-command/component-items';
import { slashCommandItems } from '../slash-command/items';
import { BlockMover } from './block-mover';
// BridgeIdPlugin re-enabled — SelectionStatePlugin consumes it to resolve
// stable ancestor-chain IDs across PM re-renders (Precedent #13 + #15).
// Plugin falls back to pos-derived synthetic IDs if this plugin is absent
// (unit-test path), but production wants the real Y.XmlElement-keyed IDs.
import { BridgeIdPlugin } from './bridge-id-plugin';
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
  // Commands-only DragHandle — provides lockDragHandle/unlockDragHandle commands
  // without registering a PM plugin. The actual drag-handle plugin is created by
  // the React <DragHandle> component in SideMenu.tsx to avoid double-registration.
  DragHandle.extend({
    addProseMirrorPlugins() {
      return [];
    },
  }).configure({
    render: () => document.createElement('div'),
  }),
  BlockMover,
  SourceDirtyObserver,
  TypedChildrenGuard,
  KeyboardNav,
  // Selection layer — must come after BridgeIdPlugin so ancestor-chain
  // lookups resolve stable IDs. Order is load-bearing only wrt BridgeId;
  // KeyboardNav is orthogonal.
  BridgeIdPlugin,
  SelectionStatePlugin,
  Placeholder.configure({
    placeholder: "Type '/' for commands",
    showOnlyCurrent: true,
  }),
];

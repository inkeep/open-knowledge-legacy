import { sharedExtensions as coreExtensions } from '@inkeep/open-knowledge-core';
import FileHandler from '@tiptap/extension-file-handler';
import { KeyboardNav } from '../block-ux/keyboard-nav';
import { uploadAndInsert } from '../image-upload/index.ts';
import { getComponentItems, getInlineComponentItems } from '../slash-command/component-items';
import { slashCommandItems } from '../slash-command/items';
import { BlockMover } from './block-mover';
import { BridgeIdPlugin } from './bridge-id-plugin';
import { BlockDragHandle } from './drag-handle';
import { FootnoteAnchorScroll } from './footnote-anchor-scroll';
import { HeadingAnchors } from './heading-anchors';
import { InternalLink } from './internal-link';
import { JsxComponent } from './jsx-component';
import { MathInline } from './math-inline';
import { RawMdxFallback } from './raw-mdx-fallback';
import { SelectionStatePlugin } from './selection-state-plugin';
import { SlashCommand } from './slash-command';
import { SourceDirtyObserver } from './source-dirty-observer';
import { TagClickPlugin } from './tag-click-plugin';
import { Tag } from './tag-view';
import { WikiLink } from './wiki-link';
import { WikiLinkEmbed } from './wiki-link-embed';

export const sharedExtensions = [
  ...coreExtensions.map((ext) => {
    if (ext.name === 'jsxComponent') return JsxComponent;
    if (ext.name === 'rawMdxFallback') return RawMdxFallback;
    if (ext.name === 'wikiLink') return WikiLink;
    if (ext.name === 'wikiLinkEmbed') return WikiLinkEmbed;
    if (ext.name === 'link') return InternalLink;
    if (ext.name === 'mathInline') return MathInline;
    if (ext.name === 'tag') return Tag;
    return ext;
  }),
  SlashCommand.configure({
    itemsSources: [() => slashCommandItems, getComponentItems, getInlineComponentItems],
    categoryLabels: {
      content: 'Components',
      layout: 'Layout',
      media: 'Media',
      data: 'Data',
    },
  }),
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
  TagClickPlugin,
  FootnoteAnchorScroll,
  BlockDragHandle,
  BlockMover,
  SourceDirtyObserver,
  KeyboardNav,
  BridgeIdPlugin,
  SelectionStatePlugin,
];

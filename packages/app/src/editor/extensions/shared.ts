/**
 * App-specific shared extensions — uses core's sharedExtensions but swaps
 * BOTH jsxComponentEditable and jsxComponentVoid with React-enabled versions
 * that have NodeView renderers, and adds app-only extensions (slash commands, placeholder).
 */
import { sharedExtensions as coreExtensions } from '@inkeep/open-knowledge-core';
import Placeholder from '@tiptap/extension-placeholder';
import { getComponentItems } from '../slash-command/component-items';
import { slashCommandItems } from '../slash-command/items';
import { JsxComponentEditable, JsxComponentVoid } from './jsx-component';
import { SlashCommand } from './slash-command';
import { WikiLink } from './wiki-link';

// Replace core extensions that have app-side NodeViews or need app-specific config.
export const sharedExtensions = [
  ...coreExtensions.map((ext) => {
    if (ext.name === 'jsxComponentEditable') return JsxComponentEditable;
    if (ext.name === 'jsxComponentVoid') return JsxComponentVoid;
    if (ext.name === 'wikiLink') return WikiLink;
    return ext;
  }),
  SlashCommand.configure({
    itemsSources: [() => slashCommandItems, getComponentItems],
    categoryLabels: {
      content: 'Content',
      layout: 'Layout',
      media: 'Media',
      data: 'Data',
    },
  }),
  Placeholder.configure({
    placeholder: "Type '/' for commands",
    showOnlyCurrent: true,
  }),
];

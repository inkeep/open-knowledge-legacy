/**
 * App-specific shared extensions — uses core's sharedExtensions but swaps
 * JsxComponent for the React-enabled version with NodeView, and adds
 * app-only extensions (slash command menu, etc.).
 */
import { sharedExtensions as coreExtensions } from '@inkeep/open-knowledge-core';
import Placeholder from '@tiptap/extension-placeholder';
import { HeadingAnchors } from './heading-anchors';
import { JsxComponent } from './jsx-component';
import { SlashCommand } from './slash-command';
import { WikiLink } from './wiki-link';

// Replace core extensions that have app-side NodeViews.
export const sharedExtensions = [
  ...coreExtensions.map((ext) => {
    if (ext.name === 'jsxComponent') return JsxComponent;
    if (ext.name === 'wikiLink') return WikiLink;
    return ext;
  }),
  SlashCommand,
  HeadingAnchors,
  Placeholder.configure({
    placeholder: "Type '/' for commands",
    showOnlyCurrent: true,
  }),
];

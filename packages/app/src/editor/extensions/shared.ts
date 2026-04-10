/**
 * App-specific shared extensions — uses core's sharedExtensions but swaps
 * JsxComponent for the React-enabled version with NodeView, and adds
 * app-only extensions (slash command menu, etc.).
 */
import { sharedExtensions as coreExtensions } from '@inkeep/open-knowledge-core';
import { JsxComponent } from './jsx-component';
import { SlashCommand } from './slash-command';

// Replace core's JsxComponent (no NodeView) with app's (has ReactNodeViewRenderer)
export const sharedExtensions = [
  ...coreExtensions.map((ext) => (ext.name === 'jsxComponent' ? JsxComponent : ext)),
  SlashCommand,
];

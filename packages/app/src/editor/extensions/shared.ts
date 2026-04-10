/**
 * App-specific shared extensions — uses core's sharedExtensions but swaps
 * JsxComponent for the React-enabled version with NodeView, and adds
 * app-only extensions (slash command menu, etc.).
 */
import { sharedExtensions as coreExtensions } from '@inkeep/open-knowledge-core';
import FileHandler from '@tiptap/extension-file-handler';
import { uploadAndInsert } from '../image-upload/index.ts';
import { JsxComponent } from './jsx-component';
import { SlashCommand } from './slash-command';

// Replace core's JsxComponent (no NodeView) with app's (has ReactNodeViewRenderer)
export const sharedExtensions = [
  ...coreExtensions.map((ext) => (ext.name === 'jsxComponent' ? JsxComponent : ext)),
  SlashCommand,
  FileHandler.configure({
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
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
];

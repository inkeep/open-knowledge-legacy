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
import Placeholder from '@tiptap/extension-placeholder';
import { uploadAndInsert } from '../image-upload/index.ts';
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
  Placeholder.configure({
    placeholder: "Type '/' for commands",
    showOnlyCurrent: true,
  }),
];

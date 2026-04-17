/**
 * Public surface of the clipboard module.
 *
 * The four creator functions that callers (`TiptapEditor.tsx`,
 * `SourceEditor.tsx`) need to wire per-view clipboard behavior. The
 * internal dispatcher, is-markdown heuristic, source-detection regex,
 * and structured-telemetry helpers are intentionally NOT re-exported —
 * they're implementation details, not contract.
 *
 * Matches the barrel convention used by sibling editor modules
 * (`source-polish/index.ts`, `image-upload/index.ts`).
 */

export type { PasteDispatcherDeps } from './handle-paste.ts';
export { createHandlePaste } from './handle-paste.ts';
export type { WysiwygSerializerDeps } from './serialize.ts';
export {
  createClipboardHtmlSerializer,
  createClipboardTextSerializer,
} from './serialize.ts';
export type { SourceClipboardDeps } from './source-clipboard.ts';
export { createSourceClipboardExtension } from './source-clipboard.ts';

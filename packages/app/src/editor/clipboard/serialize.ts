/**
 * WYSIWYG clipboard serialization — the copy/cut/dragstart output side.
 *
 * Two hooks on `editorProps` (see TiptapEditor.tsx):
 *
 *   - `clipboardTextSerializer(slice, view) → string` — emits text/plain.
 *     Wraps the slice's content in a transient doc node, serializes to
 *     markdown via MarkdownManager.serialize.
 *
 *   - `clipboardSerializer.serializeFragment(fragment) → DocumentFragment` —
 *     emits text/html. Serializes to markdown first (for cross-view
 *     symmetry — same mdast tree as Source copy produces), then markdown
 *     → HTML via our shared mdast-to-html pipeline, wrapped in a
 *     `<div data-pm-slice="{openStart} {openEnd} {context}">`. Native
 *     paste back into another PM-based editor detects the wrapper and
 *     takes PM's own parseFromClipboard path.
 *
 * Error-path discipline (FR-11):
 *   - text serializer throw → fall through to PM's default textBetween.
 *   - HTML serializer throw → return empty DocumentFragment so PM's
 *     default DOMSerializer runs. No silent data drop.
 */

import type { MarkdownManager } from '@inkeep/open-knowledge-core';
import { markdownToHtml } from '@inkeep/open-knowledge-core';
import type { JSONContent } from '@tiptap/core';
import type { Fragment, Schema, Slice } from '@tiptap/pm/model';
import { DOMSerializer, Slice as SliceCtor } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';

export interface WysiwygSerializerDeps {
  mdManager: MarkdownManager;
}

/**
 * Build `clipboardTextSerializer`. Closes over the shared MarkdownManager;
 * the schema is read from the EditorView at call time, so the hook is safe
 * to construct before the editor mounts.
 */
export function createClipboardTextSerializer(deps: WysiwygSerializerDeps) {
  return (slice: Slice, view: EditorView): string => {
    try {
      return sliceToMarkdown(slice, view.state.schema, deps.mdManager);
    } catch (err) {
      console.warn('[clipboard] text serialize fell through — PM default textBetween', err);
      return slice.content.textBetween(0, slice.content.size, '\n\n');
    }
  };
}

/**
 * Build an object that matches PM's expected `clipboardSerializer` shape.
 *
 * PM only calls `serializeFragment` on this object — it never touches the
 * other DOMSerializer methods. We read the schema off the fragment's
 * first child's type at call time.
 */
/**
 * Subclass `DOMSerializer` so the return value satisfies PM's
 * `clipboardSerializer?: DOMSerializer` type. PM only calls
 * `serializeFragment`; the `nodes` / `marks` tables are unused. We pass
 * empty stubs to the parent constructor and override serializeFragment
 * with our markdown → HTML path.
 */
class MdastClipboardSerializer extends DOMSerializer {
  private readonly mdManager: MarkdownManager;

  constructor(mdManager: MarkdownManager) {
    super({}, {});
    this.mdManager = mdManager;
  }

  override serializeFragment(
    fragment: Fragment,
    _options?: { document?: Document },
    target?: HTMLElement | DocumentFragment,
  ): HTMLElement | DocumentFragment {
    try {
      const schema = fragment.firstChild?.type.schema;
      if (!schema) return target ?? document.createDocumentFragment();
      const html = renderFragmentToHtml(fragment, schema, this.mdManager);
      const frag = parseHtmlToDocumentFragment(html);
      if (target) {
        for (const child of Array.from(frag.childNodes)) target.appendChild(child);
        return target;
      }
      return frag;
    } catch (err) {
      console.warn('[clipboard] HTML serialize fell through — PM default DOMSerializer', err);
      return target ?? document.createDocumentFragment();
    }
  }
}

export function createClipboardHtmlSerializer(deps: WysiwygSerializerDeps): DOMSerializer {
  return new MdastClipboardSerializer(deps.mdManager);
}

function sliceToMarkdown(slice: Slice, schema: Schema, mdManager: MarkdownManager): string {
  return mdManager.serialize(sliceToDocJson(slice, schema));
}

function renderFragmentToHtml(
  fragment: Fragment,
  schema: Schema,
  mdManager: MarkdownManager,
): string {
  const slice = new SliceCtor(fragment, 0, 0);
  const markdown = sliceToMarkdown(slice, schema, mdManager);
  const innerHtml = markdownToHtml(markdown);
  // Wrap with data-pm-slice so same-origin (another OK tab) and any
  // PM-based editor can detect it and route through native
  // parseFromClipboard. PM's own slice-wrapper format is
  // `openStart openEnd context`; 0/0 for a complete doc; `context` is the
  // parent node type name of the copied content.
  const context = fragment.firstChild?.type.name ?? 'doc';
  return `<div data-pm-slice="0 0 ${context}">${innerHtml}</div>`;
}

/**
 * Wrap a slice's content in a synthetic `doc` node. MarkdownManager.serialize
 * expects a PM doc JSON; this synthesizes one from an arbitrary slice.
 *
 * Slice open-depth info (openStart/openEnd) is intentionally discarded —
 * markdown serialization has no concept of it. The paste-side round-trip
 * relies on text content, not on depth preservation.
 */
function sliceToDocJson(slice: Slice, schema: Schema): JSONContent {
  const docNode = schema.topNodeType.createAndFill(null, slice.content);
  if (!docNode) {
    const empty = schema.topNodeType.createAndFill();
    if (!empty) throw new Error('[clipboard] schema cannot fill topNodeType');
    return empty.toJSON() as JSONContent;
  }
  return docNode.toJSON() as JSONContent;
}

function parseHtmlToDocumentFragment(html: string): DocumentFragment {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const frag = document.createDocumentFragment();
  for (const child of Array.from(doc.body.childNodes)) {
    frag.appendChild(child);
  }
  return frag;
}

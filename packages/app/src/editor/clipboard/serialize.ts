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
 *     emits text/html. Walker-first: when an EditorView has been attached
 *     via `setView()`, the live-DOM walker captures whatever React
 *     rendered + whatever CSS resolved (the React render IS the cross-app
 *     HTML shape for the v1 5-pack and 3 compat descriptors). Without an
 *     attached view (first render before `onCreate` fires, or unit-test
 *     mounts with no view), falls through to the markdown→HTML pipeline.
 *     Either way, returns the content directly (no wrapper element): PM's
 *     `serializeForClipboard` (`prosemirror-view/src/clipboard.ts:32-34`)
 *     sets `data-pm-slice` on the first element of whatever we return and
 *     computes the `openStart openEnd context` value from the slice
 *     itself — PM's value is authoritative.
 *
 * Error-path discipline:
 *   - text serializer throw → fall through to PM's default textBetween.
 *   - HTML walker throw → fall through to the markdown→HTML pipeline.
 *   - HTML serializer throw → return empty DocumentFragment so PM's
 *     default DOMSerializer runs. No silent data drop.
 */

import type { MarkdownManager } from '@inkeep/open-knowledge-core';
import { markdownToHtml } from '@inkeep/open-knowledge-core';
import type { JSONContent } from '@tiptap/core';
import type { Fragment, Schema, Slice } from '@tiptap/pm/model';
import { DOMSerializer, Slice as SliceCtor } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';
import { walkLiveDomToInlineStyledFragment } from './clipboard-walker.ts';
import { logSerializeFail } from './instrument.ts';

interface WysiwygSerializerDeps {
  mdManager: MarkdownManager;
}

/**
 * The HTML serializer factory returns this shape so the caller (TiptapEditor)
 * can attach the live `EditorView` after `editor.on('create')` fires. PM's
 * `clipboardSerializer` is set at editor construction — earlier than `view`
 * is available — so we hand back the serializer plus a setter the host calls
 * once the view is mounted.
 */
interface ClipboardHtmlSerializerHandle {
  serializer: DOMSerializer;
  setView: (view: EditorView) => void;
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
      logSerializeFail({
        view: 'wysiwyg',
        kind: 'text',
        reason: (err as Error)?.message ?? 'unknown',
      });
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
 * empty stubs to the parent constructor and override serializeFragment.
 *
 * The walker path requires a live `EditorView` to call `view.nodeDOM(pos)`
 * + `getComputedStyle(el)`. The view is attached lazily after
 * `editor.on('create')` fires; pre-attach calls fall through to the
 * markdown→HTML pipeline.
 */
class MdastClipboardSerializer extends DOMSerializer {
  private readonly mdManager: MarkdownManager;
  private view: EditorView | null = null;

  constructor(mdManager: MarkdownManager) {
    super({}, {});
    this.mdManager = mdManager;
  }

  setView(view: EditorView): void {
    this.view = view;
  }

  override serializeFragment(
    fragment: Fragment,
    _options?: { document?: Document },
    target?: HTMLElement | DocumentFragment,
  ): HTMLElement | DocumentFragment {
    const view = this.view;
    // Walker tier (primary). When a view is attached AND there's an active
    // selection, capture whatever React rendered + whatever CSS resolved.
    // A walker throw or empty result falls through to the markdown tier
    // below — distinct try block so operators can distinguish walker bugs
    // from markdown-pipeline bugs.
    if (view && view.state.selection.from !== view.state.selection.to) {
      try {
        const slice = view.state.selection.content();
        const walked = walkLiveDomToInlineStyledFragment(slice, view);
        if (walked.childNodes.length > 0) {
          if (target) {
            for (const child of Array.from(walked.childNodes)) target.appendChild(child);
            return target;
          }
          return walked;
        }
      } catch (err) {
        logSerializeFail({
          view: 'wysiwyg',
          kind: 'html',
          reason: `walker:${(err as Error)?.message ?? 'unknown'}`,
        });
      }
    }
    // Markdown tier (fallback). Used when no view is attached, the selection
    // is empty (e.g. drag-out), the walker yields an empty fragment, or the
    // walker tier threw above.
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
      logSerializeFail({
        view: 'wysiwyg',
        kind: 'html',
        reason: `markdown:${(err as Error)?.message ?? 'unknown'}`,
      });
      return target ?? document.createDocumentFragment();
    }
  }
}

export function createClipboardHtmlSerializer(
  deps: WysiwygSerializerDeps,
): ClipboardHtmlSerializerHandle {
  const serializer = new MdastClipboardSerializer(deps.mdManager);
  return {
    serializer,
    setView: (view) => serializer.setView(view),
  };
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
  // No wrapper element: PM's `serializeForClipboard` attaches
  // `data-pm-slice` to our first returned element with the correctly
  // computed `openStart openEnd context` value. Wrapping in a `<div>`
  // with a placeholder attribute adds noise to the stored HTML in
  // destinations that preserve attributes verbatim (e.g. GitHub's
  // comment textarea) without providing any functional benefit — PM's
  // paste-side detection uses `querySelector("[data-pm-slice]")` which
  // finds the attribute on any element.
  return markdownToHtml(markdown);
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

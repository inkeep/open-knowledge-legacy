
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

interface ClipboardHtmlSerializerHandle {
  serializer: DOMSerializer;
  setView: (view: EditorView) => void;
}

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
  return markdownToHtml(markdown);
}

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

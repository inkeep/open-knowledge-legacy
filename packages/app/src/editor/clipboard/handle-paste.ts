/**
 * WYSIWYG paste dispatcher — 5-branch router per FR-3 / D6.
 *
 * Branch A: `vscode-editor-data` MIME → fenced code block with language.
 * Branch B: `text/x-gfm` MIME → MarkdownManager.parse (markdown path).
 * Branch C: HTML contains `data-pm-slice` → PM native parseFromClipboard
 *           (return false and let PM handle).
 * Branch D: generic HTML → htmlToMdast → remark-stringify → MarkdownManager.parse.
 * Branch E: text/plain only → markdown-first (FR-13) if isMarkdown
 *           threshold hit; else verbatim plain-text insert.
 *
 * Ambiguous case (both text/plain+markdown and text/html present): branch
 * B (markdown path) wins over branch D per FR-13 (markdown-first
 * hard-coded `true`, D15).
 *
 * FR-10 codeBlock short-circuit: cursor inside a codeBlock → skip all
 * branches, insert text/plain verbatim.
 *
 * FR-17 Cmd+Shift+V: shift held → bypass all branches, insert text/plain
 * verbatim. PM's `doPaste` sets `event.shiftKey` on the event.
 *
 * FR-11 error-path: every conversion call is try/caught; on throw, fall
 * through to the next layer, never silently drop content.
 */

import type { MarkdownManager } from '@inkeep/open-knowledge-core';
import { htmlToMdast, mdastToMarkdown } from '@inkeep/open-knowledge-core';
import type { JSONContent } from '@tiptap/core';
import type { EditorView } from '@tiptap/pm/view';
import { detectSource } from './detect-source.ts';
import { logIfSlow, logSourceDetected } from './instrument.ts';
import { isMarkdown } from './is-markdown.ts';

export interface PasteDispatcherDeps {
  mdManager: MarkdownManager;
}

export function createHandlePaste(deps: PasteDispatcherDeps) {
  return (view: EditorView, event: ClipboardEvent): boolean => {
    const dt = event.clipboardData;
    if (!dt || dt.types.length === 0) return false;

    const start = performance.now();
    const source = detectSource(dt);
    const plain = dt.getData('text/plain');
    const html = dt.getData('text/html');

    // FR-17: Cmd+Shift+V → verbatim plain-text insert. We handle it
    // directly so the dispatcher's explicit behavior replaces PM's
    // default (which would parse text/plain as markdown via our
    // clipboardTextParser).
    if ((event as unknown as { shiftKey?: boolean }).shiftKey) {
      if (plain) insertPlainText(view, plain);
      logSourceDetected({ view: 'wysiwyg', branch: 'shift', source });
      logIfSlow(start, { op: 'paste', view: 'wysiwyg', branch: 'shift', source });
      return true;
    }

    // FR-10: inside a codeBlock — plain-text verbatim.
    if (isCursorInCodeBlock(view)) {
      if (plain) insertPlainText(view, plain);
      logSourceDetected({ view: 'wysiwyg', branch: 'codeblock', source });
      logIfSlow(start, { op: 'paste', view: 'wysiwyg', branch: 'codeblock', source });
      return true;
    }

    // Branch A: VS Code with language metadata.
    const vscodeData = dt.getData('vscode-editor-data');
    if (vscodeData && plain && tryBranchA(view, vscodeData, plain)) {
      logSourceDetected({ view: 'wysiwyg', branch: 'A', source });
      logIfSlow(start, { op: 'paste', view: 'wysiwyg', branch: 'A', source });
      return true;
    }

    // Branch B: explicit text/x-gfm MIME.
    const gfm = dt.getData('text/x-gfm');
    if (gfm && tryBranchMarkdown(view, gfm, deps)) {
      logSourceDetected({ view: 'wysiwyg', branch: 'B', source });
      logIfSlow(start, { op: 'paste', view: 'wysiwyg', branch: 'B', source });
      return true;
    }

    // Branch C: PM-origin slice → let PM handle natively.
    if (html && /data-pm-slice/i.test(html)) {
      logSourceDetected({
        view: 'wysiwyg',
        branch: 'C',
        source,
        htmlBytes: html.length,
      });
      logIfSlow(start, { op: 'paste', view: 'wysiwyg', branch: 'C', source });
      return false;
    }

    // FR-13: markdown-first on ambiguous paste (both text/plain-as-md
    // AND text/html present).
    if (plain && html && isMarkdown(plain) && tryBranchMarkdown(view, plain, deps)) {
      logSourceDetected({ view: 'wysiwyg', branch: 'B', source });
      logIfSlow(start, { op: 'paste', view: 'wysiwyg', branch: 'B', source });
      return true;
    }

    // Branch D: generic HTML → shared htmlToMdast pipeline.
    if (html && tryBranchHtml(view, html, deps)) {
      logSourceDetected({
        view: 'wysiwyg',
        branch: 'D',
        source,
        htmlBytes: html.length,
      });
      logIfSlow(start, {
        op: 'paste',
        view: 'wysiwyg',
        branch: 'D',
        source,
        htmlBytes: html.length,
      });
      return true;
    }

    // Branch E: text/plain only — markdown-first if threshold hit, else
    // plain-text insert.
    if (plain) {
      if (isMarkdown(plain) && tryBranchMarkdown(view, plain, deps)) {
        logSourceDetected({ view: 'wysiwyg', branch: 'E', source: 'markdown-text' });
        logIfSlow(start, { op: 'paste', view: 'wysiwyg', branch: 'E', source: 'markdown-text' });
        return true;
      }
      insertPlainText(view, plain);
      logSourceDetected({ view: 'wysiwyg', branch: 'E', source: 'plaintext' });
      logIfSlow(start, { op: 'paste', view: 'wysiwyg', branch: 'E', source: 'plaintext' });
      return true;
    }

    return false;
  };
}

function isCursorInCodeBlock(view: EditorView): boolean {
  const { $from } = view.state.selection;
  for (let depth = $from.depth; depth >= 0; depth--) {
    if ($from.node(depth).type.name === 'codeBlock') return true;
  }
  return false;
}

function insertPlainText(view: EditorView, text: string): void {
  const { schema, tr } = view.state;
  if (!text) return;
  view.dispatch(tr.replaceSelectionWith(schema.text(text)).scrollIntoView());
}

function tryBranchA(view: EditorView, vscodeData: string, text: string): boolean {
  try {
    const meta = JSON.parse(vscodeData) as { mode?: string };
    const lang = typeof meta.mode === 'string' ? meta.mode : '';
    const codeBlockType = view.state.schema.nodes.codeBlock;
    if (!codeBlockType) return false;
    const codeNode = codeBlockType.create(
      { language: lang },
      text ? view.state.schema.text(text) : null,
    );
    view.dispatch(view.state.tr.replaceSelectionWith(codeNode).scrollIntoView());
    return true;
  } catch (err) {
    console.warn('[clipboard] branch A fell through', err);
    return false;
  }
}

function tryBranchMarkdown(view: EditorView, markdown: string, deps: PasteDispatcherDeps): boolean {
  try {
    const json = deps.mdManager.parse(markdown);
    return applyJsonSlice(view, json);
  } catch (err) {
    console.warn('[clipboard] markdown branch (B/E) fell through', err);
    return false;
  }
}

function tryBranchHtml(view: EditorView, html: string, deps: PasteDispatcherDeps): boolean {
  try {
    const mdast = htmlToMdast(html);
    const markdown = mdastToMarkdown(mdast);
    const json = deps.mdManager.parse(markdown);
    return applyJsonSlice(view, json);
  } catch (err) {
    console.warn('[clipboard] HTML branch (D) fell through', err);
    return false;
  }
}

function applyJsonSlice(view: EditorView, json: JSONContent): boolean {
  try {
    // biome-ignore lint/suspicious/noExplicitAny: schema.nodeFromJSON accepts loose JSONContent at runtime; the public type is narrower than what's actually valid
    const node = view.state.schema.nodeFromJSON(json as any);
    view.dispatch(
      view.state.tr.replaceSelection(node.slice(0, node.content.size)).scrollIntoView(),
    );
    return true;
  } catch (err) {
    console.warn('[clipboard] applyJsonSlice failed', err);
    return false;
  }
}

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
 * FR-17 Cmd+Shift+V: detected via `pasteShiftHeld(event)` which checks the
 * most-recent keyboard event (real browsers don't set `shiftKey` on
 * ClipboardEvent) plus a Playwright-test-style injected property.
 *
 * FR-11 error-path: every conversion call is try/caught; on throw, fall
 * through to the next layer, never silently drop content. Per-stage
 * telemetry emitted as structured `clipboard-html-conversion-fail`
 * events (SPEC §7 Observability) so log aggregators see which stage
 * failed instead of a single bracket-prefixed string.
 */

import type { MarkdownManager } from '@inkeep/open-knowledge-core';
import { htmlToMdast, mdastToMarkdown } from '@inkeep/open-knowledge-core';
import type { JSONContent } from '@tiptap/core';
import type { EditorView } from '@tiptap/pm/view';
import { detectSource } from './detect-source.ts';
import { logConversionFail, logIfSlow, logSourceDetected } from './instrument.ts';
import { isMarkdown } from './is-markdown.ts';
import { pasteShiftHeld } from './shift-tracker.ts';

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
    if (pasteShiftHeld(event)) {
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
    if (vscodeData && plain && tryBranchA(view, vscodeData, plain, source)) {
      logSourceDetected({ view: 'wysiwyg', branch: 'A', source });
      logIfSlow(start, { op: 'paste', view: 'wysiwyg', branch: 'A', source });
      return true;
    }

    // Branch B: explicit text/x-gfm MIME.
    const gfm = dt.getData('text/x-gfm');
    if (gfm && tryBranchMarkdown(view, gfm, deps, 'B', source)) {
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
      });
      logIfSlow(start, { op: 'paste', view: 'wysiwyg', branch: 'C', source });
      return false;
    }

    // FR-13: markdown-first on ambiguous paste (both text/plain-as-md
    // AND text/html present).
    if (plain && html && isMarkdown(plain) && tryBranchMarkdown(view, plain, deps, 'B', source)) {
      logSourceDetected({ view: 'wysiwyg', branch: 'B', source });
      logIfSlow(start, { op: 'paste', view: 'wysiwyg', branch: 'B', source });
      return true;
    }

    // Branch D: generic HTML → shared htmlToMdast pipeline.
    if (html && tryBranchHtml(view, html, deps, source)) {
      logSourceDetected({
        view: 'wysiwyg',
        branch: 'D',
        source,
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
      if (isMarkdown(plain) && tryBranchMarkdown(view, plain, deps, 'E', 'markdown-text')) {
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

// Narrow allowlist for fenced-code language idents so an attacker-controlled
// `vscode-editor-data.mode` cannot break out of the fence. Matches every
// language ident in our `codeLanguages` allowlist and then some.
const LANG_IDENT = /^[A-Za-z0-9_+-]+$/;

function tryBranchA(view: EditorView, vscodeData: string, text: string, source: string): boolean {
  try {
    const meta = JSON.parse(vscodeData) as { mode?: string };
    const rawLang = typeof meta.mode === 'string' ? meta.mode : '';
    const lang = LANG_IDENT.test(rawLang) ? rawLang : '';
    const codeBlockType = view.state.schema.nodes.codeBlock;
    if (!codeBlockType) return false;
    const codeNode = codeBlockType.create(
      { language: lang },
      text ? view.state.schema.text(text) : null,
    );
    view.dispatch(view.state.tr.replaceSelectionWith(codeNode).scrollIntoView());
    return true;
  } catch (err) {
    logConversionFail({
      view: 'wysiwyg',
      stage: 'branchA',
      source,
      reason: (err as Error)?.message ?? 'unknown',
    });
    return false;
  }
}

function tryBranchMarkdown(
  view: EditorView,
  markdown: string,
  deps: PasteDispatcherDeps,
  branchLabel: 'B' | 'E',
  source: string,
): boolean {
  let json: JSONContent;
  try {
    json = deps.mdManager.parse(markdown);
  } catch (err) {
    logConversionFail({
      view: 'wysiwyg',
      stage: 'mdManagerParse',
      source: `${source}:${branchLabel}`,
      reason: (err as Error)?.message ?? 'unknown',
    });
    return false;
  }
  return applyJsonSlice(view, json, source, branchLabel);
}

function tryBranchHtml(
  view: EditorView,
  html: string,
  deps: PasteDispatcherDeps,
  source: string,
): boolean {
  // Each stage has its own try block so the structured telemetry pinpoints
  // the failing pipeline component (SPEC §7 Observability).
  let mdast: ReturnType<typeof htmlToMdast>;
  try {
    mdast = htmlToMdast(html);
  } catch (err) {
    logConversionFail({
      view: 'wysiwyg',
      stage: 'htmlToMdast',
      source,
      reason: (err as Error)?.message ?? 'unknown',
      htmlBytes: html.length,
    });
    return false;
  }
  let markdown: string;
  try {
    markdown = mdastToMarkdown(mdast);
  } catch (err) {
    logConversionFail({
      view: 'wysiwyg',
      stage: 'mdastToMarkdown',
      source,
      reason: (err as Error)?.message ?? 'unknown',
      htmlBytes: html.length,
    });
    return false;
  }
  let json: JSONContent;
  try {
    json = deps.mdManager.parse(markdown);
  } catch (err) {
    logConversionFail({
      view: 'wysiwyg',
      stage: 'mdManagerParse',
      source,
      reason: (err as Error)?.message ?? 'unknown',
      htmlBytes: html.length,
    });
    return false;
  }
  return applyJsonSlice(view, json, source, 'D', html.length);
}

function applyJsonSlice(
  view: EditorView,
  json: JSONContent,
  source: string,
  branchLabel: string,
  htmlBytes?: number,
): boolean {
  try {
    // biome-ignore lint/suspicious/noExplicitAny: schema.nodeFromJSON accepts loose JSONContent at runtime; the public type is narrower than what's actually valid
    const node = view.state.schema.nodeFromJSON(json as any);
    view.dispatch(
      view.state.tr.replaceSelection(node.slice(0, node.content.size)).scrollIntoView(),
    );
    return true;
  } catch (err) {
    logConversionFail({
      view: 'wysiwyg',
      stage: 'applyJsonSlice',
      source: `${source}:${branchLabel}`,
      reason: (err as Error)?.message ?? 'unknown',
      ...(htmlBytes != null ? { htmlBytes } : {}),
    });
    return false;
  }
}

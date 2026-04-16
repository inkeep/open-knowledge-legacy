/**
 * Source-view clipboard extension — `EditorView.domEventHandlers` for copy,
 * cut, and paste per FR-4 / FR-5 / D4 / D5.
 *
 * CodeMirror 6 has no equivalent to PM's `clipboardTextSerializer` /
 * `clipboardSerializer` hooks, so we override the DOM events directly.
 * Per D14, this is the only view where DOM-level override is acceptable
 * (WYSIWYG uses PM's hooks instead). User-facing behavior is symmetric
 * across both views:
 *
 *   - Copy/cut write text/plain = markdown source AND text/html = canonical
 *     rendered HTML (via the shared mdast-to-html module). Cross-view
 *     byte-identical output per D4.
 *
 *   - Paste routes through a 4-branch dispatcher (D5) parallel to the
 *     WYSIWYG 5-branch. Source's insertion IS markdown text, so branch B
 *     (text/x-gfm) collapses into CM6's text/plain default path.
 *
 *   - Cmd+Shift+V / inside-a-codeBlock-ish (not applicable to CM6 — it's
 *     all source) / the rest of the error-path discipline matches
 *     WYSIWYG's implementation.
 */

import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { MarkdownManager } from '@inkeep/open-knowledge-core';
import {
  chunkedYTextInsert,
  htmlToMdast,
  markdownToHtml,
  mdastToMarkdown,
} from '@inkeep/open-knowledge-core';
import type * as Y from 'yjs';
import { detectSource } from './detect-source.ts';
import { logIfSlow, logSourceDetected } from './instrument.ts';

export interface SourceClipboardDeps {
  ydoc: Y.Doc;
  ytext: Y.Text;
  mdManager: MarkdownManager;
}

/**
 * Build the CM6 extension wiring copy/cut/paste DOM handlers.
 *
 * Each handler returns `true` when it has fully handled the event
 * (preventing CM6's default), or `false` to let CM6's built-in run.
 */
export function createSourceClipboardExtension(deps: SourceClipboardDeps): Extension {
  return EditorView.domEventHandlers({
    copy: (event: ClipboardEvent, view: EditorView) => handleCopyOrCut(event, view, deps, 'copy'),
    cut: (event: ClipboardEvent, view: EditorView) => handleCopyOrCut(event, view, deps, 'cut'),
    paste: (event: ClipboardEvent, view: EditorView) => handlePaste(event, view, deps),
  });
}

function handleCopyOrCut(
  event: ClipboardEvent,
  view: EditorView,
  _deps: SourceClipboardDeps,
  kind: 'copy' | 'cut',
): boolean {
  const { from, to } = view.state.selection.main;
  if (from === to) return false; // empty selection → CM6 default no-op.

  const dt = event.clipboardData;
  if (!dt) return false;

  const start = performance.now();
  try {
    const markdown = view.state.sliceDoc(from, to);
    dt.setData('text/plain', markdown);
    try {
      dt.setData('text/html', markdownToHtml(markdown));
    } catch (err) {
      console.warn('[clipboard] source: HTML render fell through — text/plain only', err);
    }
    event.preventDefault();
    if (kind === 'cut') {
      view.dispatch({ changes: { from, to, insert: '' } });
    }
    logIfSlow(start, { op: kind, view: 'source', branch: 'serialize', source: 'ok' });
    return true;
  } catch (err) {
    console.warn('[clipboard] source: copy/cut serialize fell through — CM6 default', err);
    return false;
  }
}

function handlePaste(event: ClipboardEvent, view: EditorView, deps: SourceClipboardDeps): boolean {
  const dt = event.clipboardData;
  if (!dt || dt.types.length === 0) return false;

  const start = performance.now();
  const source = detectSource(dt);
  const plain = dt.getData('text/plain');
  const html = dt.getData('text/html');

  // FR-17: Cmd+Shift+V → let CM6 default text/plain verbatim insert run.
  // ClipboardEvent doesn't declare shiftKey on its public type; the DOM
  // dispatches the paste with a KeyboardEvent-like shiftKey in practice.
  if ((event as unknown as { shiftKey?: boolean }).shiftKey) {
    logSourceDetected({ view: 'source', branch: 'shift', source });
    logIfSlow(start, { op: 'paste', view: 'source', branch: 'shift', source });
    return false;
  }

  // Branch A: VS Code → fenced code block at selection.
  const vscodeData = dt.getData('vscode-editor-data');
  if (vscodeData && plain) {
    const handled = tryBranchAVscode(view, vscodeData, plain);
    if (handled) {
      event.preventDefault();
      logSourceDetected({ view: 'source', branch: 'A', source });
      logIfSlow(start, { op: 'paste', view: 'source', branch: 'A', source });
      return true;
    }
  }

  // Branch C: PM-origin slice — the data-pm-slice wrapper's inner content
  // is the canonical markdown (because our copy path wrote HTML from the
  // same markdown the text/plain carries). Let CM6 default insert the
  // text/plain verbatim.
  if (html && /data-pm-slice/i.test(html)) {
    logSourceDetected({
      view: 'source',
      branch: 'C',
      source,
      htmlBytes: html.length,
    });
    logIfSlow(start, { op: 'paste', view: 'source', branch: 'C', source });
    return false;
  }

  // Branch D: generic HTML → htmlToMdast → markdown string → Y.Text insert.
  if (html) {
    const handled = tryBranchDHtml(view, html, deps);
    if (handled) {
      event.preventDefault();
      logSourceDetected({
        view: 'source',
        branch: 'D',
        source,
        htmlBytes: html.length,
      });
      logIfSlow(start, {
        op: 'paste',
        view: 'source',
        branch: 'D',
        source,
        htmlBytes: html.length,
      });
      return true;
    }
  }

  // Branch E: text/plain only — CM6 default insert. Source's insertion IS
  // markdown, so no conversion needed.
  logSourceDetected({ view: 'source', branch: 'E', source });
  logIfSlow(start, { op: 'paste', view: 'source', branch: 'E', source });
  return false;
}

function tryBranchAVscode(view: EditorView, vscodeData: string, text: string): boolean {
  try {
    const meta = JSON.parse(vscodeData) as { mode?: string };
    const lang = typeof meta.mode === 'string' ? meta.mode : '';
    const block = `\`\`\`${lang}\n${text}\n\`\`\`\n`;
    const { from, to } = view.state.selection.main;
    view.dispatch({
      changes: { from, to, insert: block },
      selection: { anchor: from + block.length },
    });
    return true;
  } catch (err) {
    console.warn('[clipboard] source: branch A VS Code fell through', err);
    return false;
  }
}

function tryBranchDHtml(view: EditorView, html: string, deps: SourceClipboardDeps): boolean {
  try {
    const mdast = htmlToMdast(html);
    const markdown = mdastToMarkdown(mdast);
    const { from, to } = view.state.selection.main;
    // For small inserts, let CM6's dispatch handle the Y.Text mutation via
    // the yCollab binding. For large inserts (FR-21) bypass the CM6 path
    // and chunk directly into Y.Text — yCollab observes Y.Text changes
    // and mirrors them into CM6, so the view catches up.
    const shouldChunk = markdown.length > 500 * 1024;
    if (!shouldChunk) {
      view.dispatch({
        changes: { from, to, insert: markdown },
        selection: { anchor: from + markdown.length },
      });
      return true;
    }
    // Chunked path: delete the selection first (single CM6 dispatch) then
    // append via chunked Y.Text insertion. rAF yields keep the UI 60fps.
    if (from !== to) {
      view.dispatch({ changes: { from, to, insert: '' } });
    }
    // Fire-and-forget — the Promise resolves as chunks land, but paste
    // event handler must return synchronously. yCollab surfaces the
    // inserts incrementally.
    void chunkedYTextInsert(deps.ydoc, deps.ytext, from, markdown).catch((err) => {
      console.warn('[clipboard] chunked Y.Text insertion failed', err);
    });
    return true;
  } catch (err) {
    console.warn('[clipboard] source: branch D HTML pipeline fell through', err);
    return false;
  }
}

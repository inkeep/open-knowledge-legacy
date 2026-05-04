/**
 * Source-view clipboard extension — `EditorView.domEventHandlers` for copy,
 * cut, and paste per precedent #19(c).
 *
 * CodeMirror 6 has no equivalent to PM's `clipboardTextSerializer` /
 * `clipboardSerializer` hooks, so we override the DOM events directly.
 * This is the only view where DOM-level override is acceptable (WYSIWYG
 * uses PM's hooks instead per precedent #19(b)). User-facing behavior is
 * symmetric across both views:
 *
 *   - Copy/cut write text/plain = markdown source AND text/html = canonical
 *     rendered HTML (via the shared mdast-to-html module). Cross-view
 *     byte-identical output.
 *
 *   - Paste routes through a 5-branch dispatcher parallel to WYSIWYG's
 *     5-branch (A/B/C/D/E). Source's insertion IS markdown text, so the
 *     markdown-first tiebreak (Branch B), the Branch C `data-pm-slice`
 *     check, and Branch E all resolve to "let CM6 default text/plain
 *     verbatim insert run" — the dispatcher's value here is structural,
 *     not behavioral. The tiebreak fires AHEAD of Branch C and Branch D
 *     for the narrow case where external markdown carries a rich-HTML
 *     preview; without it Branch D's `htmlToMdast` would normalize bytes
 *     that the user pasted as canonical markdown.
 *
 *   - Cmd+Shift+V detected via `pasteShiftHeld(event)` (keyboard-event
 *     tracker — ClipboardEvent does not expose shiftKey natively).
 *
 *   - Large-paste chunked insert: payloads >500KB bypass the CM6 dispatch
 *     and land via `chunkedYTextInsert` directly. A Y.RelativePosition is
 *     pinned before the first chunk so concurrent peers writing at offsets
 *     ≤ writeIndex during rAF yields do not shift the target. Mid-stream
 *     failure surfaces as a structured `clipboard-chunked-insert-failed`
 *     event with partial-progress fields.
 */

import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  ChunkedInsertError,
  chunkedYTextInsert,
  htmlToMdast,
  markdownToHtml,
  mdastToMarkdown,
} from '@inkeep/open-knowledge-core';
import { toast } from 'sonner';
import * as Y from 'yjs';
import { type ClipboardSource, detectSource } from './detect-source.ts';
import {
  classifyError,
  logChunkedInsertFail,
  logConversionFail,
  logIfSlow,
  logSerializeFail,
  logSourceDetected,
} from './instrument.ts';
import { isMarkdown } from './is-markdown.ts';
import { installShiftTracker, pasteShiftHeld } from './shift-tracker.ts';

export interface SourceClipboardDeps {
  ydoc: Y.Doc;
  ytext: Y.Text;
}

export function createSourceClipboardExtension(deps: SourceClipboardDeps): Extension {
  installShiftTracker();
  return EditorView.domEventHandlers({
    copy: (event: ClipboardEvent, view: EditorView) => handleCopyOrCut(event, view, 'copy'),
    cut: (event: ClipboardEvent, view: EditorView) => handleCopyOrCut(event, view, 'cut'),
    paste: (event: ClipboardEvent, view: EditorView) => handlePaste(event, view, deps),
  });
}

function handleCopyOrCut(event: ClipboardEvent, view: EditorView, kind: 'copy' | 'cut'): boolean {
  const { from, to } = view.state.selection.main;
  if (from === to) {
    event.preventDefault();
    return true;
  }

  const dt = event.clipboardData;
  if (!dt) return false;

  const start = performance.now();
  try {
    const markdown = view.state.sliceDoc(from, to);
    dt.setData('text/plain', markdown);
    try {
      dt.setData('text/html', markdownToHtml(markdown));
    } catch (err) {
      logSerializeFail({
        view: 'source',
        kind: 'html',
        reason: (err as Error)?.message ?? 'unknown',
      });
    }
    event.preventDefault();
    if (kind === 'cut') {
      view.dispatch({ changes: { from, to, insert: '' } });
    }
    logIfSlow(start, { op: kind, view: 'source', branch: 'serialize', source: 'local' });
    return true;
  } catch (err) {
    logSerializeFail({
      view: 'source',
      kind: 'text',
      reason: (err as Error)?.message ?? 'unknown',
    });
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

  if (pasteShiftHeld(event)) {
    logSourceDetected({ view: 'source', branch: 'shift', source });
    logIfSlow(start, { op: 'paste', view: 'source', branch: 'shift', source });
    return false;
  }

  const vscodeData = dt.getData('vscode-editor-data');
  if (vscodeData && plain) {
    const handled = tryBranchAVscode(view, vscodeData, plain, source);
    if (handled) {
      event.preventDefault();
      logSourceDetected({ view: 'source', branch: 'A', source });
      logIfSlow(start, { op: 'paste', view: 'source', branch: 'A', source });
      return true;
    }
  }

  if (plain && html && isMarkdown(plain)) {
    logSourceDetected({ view: 'source', branch: 'B', source });
    logIfSlow(start, { op: 'paste', view: 'source', branch: 'B', source });
    return false;
  }

  if (html && /data-pm-slice/i.test(html)) {
    logSourceDetected({
      view: 'source',
      branch: 'C',
      source,
    });
    logIfSlow(start, { op: 'paste', view: 'source', branch: 'C', source });
    return false;
  }

  if (html) {
    const handled = tryBranchDHtml(view, html, deps, source);
    if (handled) {
      event.preventDefault();
      logSourceDetected({
        view: 'source',
        branch: 'D',
        source,
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

  logSourceDetected({ view: 'source', branch: 'E', source });
  logIfSlow(start, { op: 'paste', view: 'source', branch: 'E', source });
  return false;
}

const LANG_IDENT = /^[A-Za-z0-9_+-]+$/;

function tryBranchAVscode(
  view: EditorView,
  vscodeData: string,
  text: string,
  source: ClipboardSource,
): boolean {
  try {
    const meta = JSON.parse(vscodeData) as { mode?: string };
    const rawLang = typeof meta.mode === 'string' ? meta.mode : '';
    const lang = LANG_IDENT.test(rawLang) ? rawLang : '';
    const block = `\`\`\`${lang}\n${text}\n\`\`\`\n`;
    const { from, to } = view.state.selection.main;
    view.dispatch({
      changes: { from, to, insert: block },
      selection: { anchor: from + block.length },
    });
    return true;
  } catch (err) {
    logConversionFail({
      view: 'source',
      stage: 'branchA',
      source,
      branch: 'A',
      reason: (err as Error)?.message ?? 'unknown',
      errorClass: classifyError(err),
    });
    return false;
  }
}

function tryBranchDHtml(
  view: EditorView,
  html: string,
  deps: SourceClipboardDeps,
  source: ClipboardSource,
): boolean {
  let mdast: ReturnType<typeof htmlToMdast>;
  try {
    mdast = htmlToMdast(html);
  } catch (err) {
    logConversionFail({
      view: 'source',
      stage: 'htmlToMdast',
      source,
      branch: 'D',
      reason: (err as Error)?.message ?? 'unknown',
      errorClass: classifyError(err),
      htmlBytes: html.length,
    });
    return false;
  }
  let markdown: string;
  try {
    markdown = mdastToMarkdown(mdast);
  } catch (err) {
    logConversionFail({
      view: 'source',
      stage: 'mdastToMarkdown',
      source,
      branch: 'D',
      reason: (err as Error)?.message ?? 'unknown',
      errorClass: classifyError(err),
      htmlBytes: html.length,
    });
    return false;
  }
  const { from, to } = view.state.selection.main;
  const shouldChunk = markdown.length > 500 * 1024;
  if (!shouldChunk) {
    view.dispatch({
      changes: { from, to, insert: markdown },
      selection: { anchor: from + markdown.length },
    });
    return true;
  }

  const restoreText = from === to ? '' : view.state.sliceDoc(from, to);
  if (from !== to) {
    view.dispatch({ changes: { from, to, insert: '' } });
  }
  const anchorIndex = from;
  const relPos = Y.createRelativePositionFromTypeIndex(deps.ytext, anchorIndex);

  const resolveOffset = (logical: number): number => {
    const abs = Y.createAbsolutePositionFromRelativePosition(relPos, deps.ydoc);
    if (abs == null) return logical; // fall back to the monotonic index.
    return abs.index + (logical - anchorIndex);
  };

  void chunkedYTextInsert(deps.ydoc, deps.ytext, anchorIndex, markdown, {
    resolveOffset,
  }).catch((err) => {
    handleChunkedInsertFailure({
      view,
      source,
      html,
      restoreText,
      anchorIndex,
      anchorRelPos: relPos,
      ydoc: deps.ydoc,
      err,
    });
  });
  return true;
}

export interface ChunkedInsertFailureContext {
  view: EditorView;
  source: ClipboardSource;
  html: string;
  restoreText: string;
  anchorIndex: number;
  anchorRelPos?: Y.RelativePosition;
  ydoc?: Y.Doc;
  err: unknown;
}

export function handleChunkedInsertFailure(ctx: ChunkedInsertFailureContext): void {
  const { view, source, html, restoreText, anchorIndex, anchorRelPos, ydoc, err } = ctx;

  type RestoreOutcome = 'restored' | 'restore-failed' | 'no-restore-needed';
  let restoreOutcome: RestoreOutcome = 'no-restore-needed';
  if (err instanceof ChunkedInsertError && err.bytesWritten > 0) {
    const absStart =
      anchorRelPos && ydoc
        ? (Y.createAbsolutePositionFromRelativePosition(anchorRelPos, ydoc)?.index ?? anchorIndex)
        : anchorIndex;
    const deleteEnd = Math.min(absStart + err.bytesWritten, view.state.doc.length);
    try {
      view.dispatch({
        changes: { from: absStart, to: deleteEnd, insert: restoreText },
      });
      restoreOutcome = restoreText.length > 0 ? 'restored' : 'no-restore-needed';
    } catch (restoreErr) {
      console.warn('[clipboard] partial-chunk rollback dispatch failed', restoreErr);
      restoreOutcome = restoreText.length > 0 ? 'restore-failed' : 'no-restore-needed';
    }
  } else if (restoreText.length > 0) {
    try {
      view.dispatch({ changes: { from: anchorIndex, to: anchorIndex, insert: restoreText } });
      restoreOutcome = 'restored';
    } catch (restoreErr) {
      console.warn('[clipboard] selection-restore dispatch failed', restoreErr);
      restoreOutcome = 'restore-failed';
    }
  }

  const restoreSuffix =
    restoreOutcome === 'restored'
      ? ' Your selection has been restored.'
      : restoreOutcome === 'restore-failed'
        ? ' Your selection could not be restored.'
        : '';

  if (err instanceof ChunkedInsertError) {
    logChunkedInsertFail({
      view: 'source',
      chunksCompleted: err.chunksCompleted,
      totalChunks: err.totalChunks,
      bytesWritten: err.bytesWritten,
      bytesRemaining: err.bytesRemaining,
      reason: err.message,
    });
    toast.error(
      `Paste was incomplete — ${err.chunksCompleted} of ${err.totalChunks} chunks landed.${restoreSuffix}`,
    );
    return;
  }
  logConversionFail({
    view: 'source',
    stage: 'chunkedYTextInsert',
    source,
    branch: 'D',
    reason: (err as Error)?.message ?? 'unknown',
    errorClass: classifyError(err),
    htmlBytes: html.length,
  });
  toast.error(`Paste failed.${restoreSuffix}`);
}

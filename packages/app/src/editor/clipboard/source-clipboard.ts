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
 *   - Cmd+Shift+V detected via `pasteShiftHeld(event)` (keyboard-event
 *     tracker — ClipboardEvent does not expose shiftKey natively).
 *
 *   - FR-21 large-paste chunked insert: payloads >500KB bypass the CM6
 *     dispatch and land via `chunkedYTextInsert` directly. A Y.RelativePosition
 *     is pinned before the first chunk so concurrent peers writing at
 *     offsets ≤ writeIndex during rAF yields do not shift the target.
 *     Mid-stream failure surfaces as a structured `clipboard-chunked-insert-failed`
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
import { installShiftTracker, pasteShiftHeld } from './shift-tracker.ts';

export interface SourceClipboardDeps {
  ydoc: Y.Doc;
  ytext: Y.Text;
}

/**
 * Build the CM6 extension wiring copy/cut/paste DOM handlers.
 *
 * Each handler returns `true` when it has fully handled the event
 * (preventing CM6's default), or `false` to let CM6's built-in run.
 */
export function createSourceClipboardExtension(deps: SourceClipboardDeps): Extension {
  // Attach the shift-key tracker so Cmd+Shift+V detection works. Calling
  // this eagerly ensures the listener is already in place when the first
  // paste event arrives.
  installShiftTracker();
  return EditorView.domEventHandlers({
    copy: (event: ClipboardEvent, view: EditorView) => handleCopyOrCut(event, view, 'copy'),
    cut: (event: ClipboardEvent, view: EditorView) => handleCopyOrCut(event, view, 'cut'),
    paste: (event: ClipboardEvent, view: EditorView) => handlePaste(event, view, deps),
  });
}

function handleCopyOrCut(event: ClipboardEvent, view: EditorView, kind: 'copy' | 'cut'): boolean {
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

  // FR-17: Cmd+Shift+V → let CM6 default text/plain verbatim insert run.
  if (pasteShiftHeld(event)) {
    logSourceDetected({ view: 'source', branch: 'shift', source });
    logIfSlow(start, { op: 'paste', view: 'source', branch: 'shift', source });
    return false;
  }

  // Branch A: VS Code → fenced code block at selection.
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

  // Branch C: PM-origin slice — the data-pm-slice wrapper's inner content
  // is the canonical markdown (because our copy path wrote HTML from the
  // same markdown the text/plain carries). Let CM6 default insert the
  // text/plain verbatim.
  if (html && /data-pm-slice/i.test(html)) {
    logSourceDetected({
      view: 'source',
      branch: 'C',
      source,
    });
    logIfSlow(start, { op: 'paste', view: 'source', branch: 'C', source });
    return false;
  }

  // Branch D: generic HTML → htmlToMdast → markdown string → Y.Text insert.
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

  // Branch E: text/plain only — CM6 default insert. Source's insertion IS
  // markdown, so no conversion needed.
  logSourceDetected({ view: 'source', branch: 'E', source });
  logIfSlow(start, { op: 'paste', view: 'source', branch: 'E', source });
  return false;
}

// Same allowlist used by the WYSIWYG dispatcher's Branch A.
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
    // Unsanitized `mode` could embed newlines + fence chars and break out of
    // the fenced block we build below; restrict to ident chars.
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
  // Y.RelativePosition tracks the intended write anchor so a concurrent
  // peer inserting before the anchor during a yield does not shift us.
  //
  // Recovery discipline: capture the original selection text BEFORE the
  // delete dispatch so `handleChunkedInsertFailure` can restore it if the
  // chunked insertion throws mid-stream. Without this, chunk-0 failure
  // would leave the user's selection vanished with only a DevTools log.
  // The captured `relPos` also bounds the partial-chunk rollback range so a
  // mid-stream throw after N chunks wrote doesn't leave truncated content
  // behind — see `handleChunkedInsertFailure` below.
  const restoreText = from === to ? '' : view.state.sliceDoc(from, to);
  if (from !== to) {
    view.dispatch({ changes: { from, to, insert: '' } });
  }
  const anchorIndex = from;
  // `assoc = 0` (default) is left-binding: concurrent inserts AT anchorIndex
  // leave our anchor at the original spot, so their content lands AFTER our
  // chunks. This matches the intuitive "my paste goes where my cursor was,
  // their concurrent edits follow" semantic. Right-binding (`assoc = 1`)
  // would flip this — revisit only with explicit product direction.
  const relPos = Y.createRelativePositionFromTypeIndex(deps.ytext, anchorIndex);

  const resolveOffset = (logical: number): number => {
    // `logical` is the monotonic chunk writeIndex counted from anchorIndex.
    // Resolve anchorIndex against current Y.Text state, then add the local
    // offset within our insert sequence.
    const abs = Y.createAbsolutePositionFromRelativePosition(relPos, deps.ydoc);
    if (abs == null) return logical; // fall back to the monotonic index.
    return abs.index + (logical - anchorIndex);
  };

  // Fire-and-forget — the Promise resolves as chunks land, but paste
  // event handler must return synchronously. yCollab surfaces the
  // inserts incrementally.
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

/**
 * Recovery for a mid-stream chunked-insert failure. Three concerns:
 *
 * 1. Rollback partial chunks + restore selection: chunked insertion writes
 *    N of M chunks before throwing, leaving `bytesWritten` bytes in Y.Text
 *    at `[anchor, anchor+bytesWritten)`. Without cleanup, the user's selection
 *    is gone AND truncated paste content is in the doc. We resolve the
 *    captured `anchorRelPos` (pinned before chunk-0 so concurrent peers
 *    between paste-start and failure-time don't shift the range) and replace
 *    `[absStart, absStart+bytesWritten)` with `restoreText` in a single
 *    `view.dispatch` — atomic from yCollab's observer perspective.
 * 2. Telemetry: emit a structured event (typed `ChunkedInsertError` variant
 *    with partial-progress fields; fallback to `clipboard-html-conversion-failed`
 *    for non-chunked errors).
 * 3. User-visible signal: a sonner toast so the user knows the paste failed
 *    rather than relying on DevTools to spot the console.warn.
 *
 * Non-typed errors (not `ChunkedInsertError`) can't know `bytesWritten`, so
 * we fall back to the simpler selection-restore path — same behavior as
 * before this fix for those exotic failure modes.
 *
 * Exported for the unit test (`source-clipboard-recovery.test.ts`) so the
 * recovery contract is mechanically covered even though the full CM6 paste
 * integration is out of reach for bun-test.
 */
export interface ChunkedInsertFailureContext {
  view: EditorView;
  source: ClipboardSource;
  html: string;
  /** Original selection text, or '' if the selection was empty. */
  restoreText: string;
  /** CM6/Y.Text offset where the first chunk was written. */
  anchorIndex: number;
  /**
   * Y.RelativePosition captured pre-chunk-0. Used at recovery time to resolve
   * the partial-paste start position through concurrent peer activity so the
   * delete range targets the right bytes. Optional for legacy tests that
   * predate the rollback discipline.
   */
  anchorRelPos?: Y.RelativePosition;
  /** Y.Doc for resolving the relative position. Optional for the same reason. */
  ydoc?: Y.Doc;
  err: unknown;
}

export function handleChunkedInsertFailure(ctx: ChunkedInsertFailureContext): void {
  const { view, source, html, restoreText, anchorIndex, anchorRelPos, ydoc, err } = ctx;

  // 1. Rollback + restore. If we know bytesWritten (ChunkedInsertError) we
  //    delete the partial range; otherwise we restore the selection at the
  //    anchor (best effort).
  if (err instanceof ChunkedInsertError && err.bytesWritten > 0) {
    const absStart =
      anchorRelPos && ydoc
        ? (Y.createAbsolutePositionFromRelativePosition(anchorRelPos, ydoc)?.index ?? anchorIndex)
        : anchorIndex;
    // Clamp end to current doc length — concurrent peers may have deleted
    // some of our partial content before we recovered.
    const deleteEnd = Math.min(absStart + err.bytesWritten, view.state.doc.length);
    try {
      view.dispatch({
        changes: { from: absStart, to: deleteEnd, insert: restoreText },
      });
    } catch (restoreErr) {
      console.warn('[clipboard] partial-chunk rollback dispatch failed', restoreErr);
    }
  } else if (restoreText.length > 0) {
    // Non-typed error or zero bytes written — restore the user's selection
    // at the anchor. No partial range to delete.
    try {
      view.dispatch({ changes: { from: anchorIndex, to: anchorIndex, insert: restoreText } });
    } catch (restoreErr) {
      // Restoration is best-effort — the view may be destroyed by the time
      // the promise settles. Log, then continue emitting the telemetry /
      // toast paths.
      console.warn('[clipboard] selection-restore dispatch failed', restoreErr);
    }
  }

  // 2. Emit structured telemetry.
  if (err instanceof ChunkedInsertError) {
    logChunkedInsertFail({
      view: 'source',
      chunksCompleted: err.chunksCompleted,
      totalChunks: err.totalChunks,
      bytesWritten: err.bytesWritten,
      bytesRemaining: err.bytesRemaining,
      reason: err.message,
    });
    // 3. User-visible signal with partial-progress info.
    toast.error(
      `Paste was incomplete — ${err.chunksCompleted} of ${err.totalChunks} chunks landed. Your selection has been restored.`,
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
  toast.error('Paste failed. Your selection has been restored.');
}

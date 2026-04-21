/**
 * RawMdxFallback NodeView with embedded CodeMirror 6 (FR-30..FR-35, §9.14).
 *
 * Implements the canonical ProseMirror + CodeMirror pattern
 * (prosemirror.net/examples/codemirror/) adapted for TipTap's React NodeView.
 *
 * Architecture (Precedent #24 — direct PM dispatch, NOT y-codemirror.next):
 *   CM keystroke → forwardUpdate → PM transaction → y-prosemirror → CRDT
 *   PM change → NodeView.update(node) → computeChange → CM transaction
 *   Single `updating` boolean prevents feedback loops.
 *
 * This NodeView embeds a CodeMirror EditorView inside a React component.
 * The CM instance is NOT mounted via React (would conflict with PM's DOM management).
 * Instead, CM is mounted imperatively into a ref'd container, and React
 * renders the chrome (badge, border) around it.
 */

import { Compartment } from '@codemirror/state';
import { EditorView as CMEditorView, keymap } from '@codemirror/view';
import type { NodeViewProps } from '@tiptap/core';
import { NodeSelection, Selection } from '@tiptap/pm/state';
import { NodeViewWrapper } from '@tiptap/react';
import { Trash2 } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useRef } from 'react';
import { markUserTyping } from '../observers';
import { getYDoc } from '../utils/get-ydoc';
import { classifySeverity, SEVERITY_STYLES } from '../utils/severity';
import { createNestedCMExtensions, darkTheme, lightTheme } from './nested-cm-extensions';

/**
 * Decide whether an arrow keystroke at the CM cursor should escape out of
 * the nested CM into the outer PM document. Returns the direction to escape
 * (`-1` = before the node, `+1` = after the node) or `null` if the key
 * should stay inside CM.
 *
 * Mirrors the canonical PM+CM example's `maybeEscape` per
 * <https://prosemirror.net/examples/codemirror/> adapted for CM 6's selection
 * API. Escapes only when the selection is a collapsed cursor at the document
 * boundary in the given direction — anything inside the doc keeps default
 * CM navigation.
 *
 * @param cmView CodeMirror view whose selection is being inspected
 * @param unit  `'line'` for Up/Down (check line boundary), `'char'` for
 *              Left/Right (check caret boundary)
 * @param dir   `-1` for Up/Left, `+1` for Down/Right
 */
export function shouldEscapeNestedCM(
  cmView: CMEditorView,
  unit: 'line' | 'char',
  dir: -1 | 1,
): boolean {
  const { state } = cmView;
  const main = state.selection.main;
  if (!main.empty) return false;
  if (unit === 'line') {
    const line = state.doc.lineAt(main.head);
    return dir < 0 ? line.from === 0 : line.to === state.doc.length;
  }
  return dir < 0 ? main.head === 0 : main.head === state.doc.length;
}

/**
 * Compute the minimal change between two strings.
 * Returns null if they're identical.
 */
export function computeChange(
  oldVal: string,
  newVal: string,
): { from: number; to: number; text: string } | null {
  if (oldVal === newVal) return null;
  let start = 0;
  let oldEnd = oldVal.length;
  let newEnd = newVal.length;

  while (start < oldEnd && oldVal.charCodeAt(start) === newVal.charCodeAt(start)) {
    start++;
  }
  while (
    oldEnd > start &&
    newEnd > start &&
    oldVal.charCodeAt(oldEnd - 1) === newVal.charCodeAt(newEnd - 1)
  ) {
    oldEnd--;
    newEnd--;
  }

  return { from: start, to: oldEnd, text: newVal.slice(start, newEnd) };
}

export function RawMdxFallbackView({ node, editor, getPos }: NodeViewProps) {
  const cmContainerRef = useRef<HTMLDivElement>(null);
  const cmViewRef = useRef<CMEditorView | null>(null);
  const updatingRef = useRef(false);
  const themeCompartmentRef = useRef(new Compartment());
  const { resolvedTheme } = useTheme();
  const reason = (node.attrs.reason as string) || 'Parse failed';
  const severity = classifySeverity(reason);
  const style = SEVERITY_STYLES[severity];

  // CM→PM sync: forward CM changes as PM transactions.
  // Uses getPos() and editor.view.state directly (both stable across renders)
  // instead of refs (React Compiler prohibits ref writes during render).
  const forwardUpdate = (newText: string) => {
    const pos = typeof getPos === 'function' ? getPos() : undefined;
    if (pos === undefined) return;

    const pmView = editor.view;
    if (!pmView) return;

    // Look up the current node at this position to get its size
    const currentNode = pmView.state.doc.nodeAt(pos);
    if (!currentNode) return;

    const start = pos + 1;
    const end = pos + currentNode.nodeSize - 1;

    // Always release the flag: if dispatch throws (e.g. position went stale
    // under a concurrent transaction), leaving the flag true would pin the
    // CM→PM bridge off for the rest of the NodeView's lifetime — the user
    // keeps typing but keystrokes never reach PM. React Compiler does not
    // support try/finally without a catch, so we catch/release/rethrow.
    updatingRef.current = true;
    try {
      const tr = pmView.state.tr;
      if (newText.length === 0) {
        tr.delete(start, end);
      } else {
        const textNode = pmView.state.schema.text(newText);
        tr.replaceWith(start, end, textNode);
      }
      pmView.dispatch(tr);
    } catch (err) {
      updatingRef.current = false;
      throw err;
    }
    updatingRef.current = false;
  };

  // Mount the CM instance imperatively (once).
  // biome-ignore lint/correctness/useExhaustiveDependencies: CM view mounts once imperatively; re-mount on deps change would destroy the editor state. Theme handled by separate compartment effect; content sync handled by PM→CM sync effect below.
  useEffect(() => {
    const container = cmContainerRef.current;
    if (!container) return;

    const themeCompartment = themeCompartmentRef.current;

    // Undo/Redo delegation to PM (FR-31)
    const undoRedoKeymap = keymap.of([
      {
        key: 'Mod-z',
        run: () => {
          editor.commands.undo();
          return true;
        },
      },
      {
        key: 'Mod-y',
        run: () => {
          editor.commands.redo();
          return true;
        },
      },
      {
        key: 'Mod-Shift-z',
        run: () => {
          editor.commands.redo();
          return true;
        },
      },
    ]);

    // Arrow-at-boundary escape to outer PM (canonical PM+CM pattern).
    // When the cursor reaches a CM doc boundary in a given direction, move
    // PM selection past the fallback node in that direction and hand focus
    // back. Canonical reference: https://prosemirror.net/examples/codemirror/
    // Without these, the cursor traps inside the nested CM — no keyboard
    // path exists to leave the block without clicking.
    const escapeToPM = (dir: -1 | 1): boolean => {
      const pos = typeof getPos === 'function' ? getPos() : undefined;
      if (typeof pos !== 'number') return false;
      const pmView = editor.view;
      if (!pmView) return false;
      const currentNode = pmView.state.doc.nodeAt(pos);
      if (!currentNode) return false;
      const targetPos = dir < 0 ? pos : pos + currentNode.nodeSize;
      const selection = Selection.near(pmView.state.doc.resolve(targetPos), dir);
      pmView.dispatch(pmView.state.tr.setSelection(selection).scrollIntoView());
      pmView.focus();
      return true;
    };
    const escapeKeymap = keymap.of([
      {
        key: 'ArrowUp',
        run: (v) => (shouldEscapeNestedCM(v, 'line', -1) ? escapeToPM(-1) : false),
      },
      {
        key: 'ArrowLeft',
        run: (v) => (shouldEscapeNestedCM(v, 'char', -1) ? escapeToPM(-1) : false),
      },
      {
        key: 'ArrowDown',
        run: (v) => (shouldEscapeNestedCM(v, 'line', 1) ? escapeToPM(1) : false),
      },
      {
        key: 'ArrowRight',
        run: (v) => (shouldEscapeNestedCM(v, 'char', 1) ? escapeToPM(1) : false),
      },
    ]);

    const ydoc = getYDoc(editor);
    const extensions = createNestedCMExtensions({
      themeCompartment,
      resolvedTheme,
      ydoc: ydoc ?? undefined,
      extraKeymaps: undoRedoKeymap,
    });
    extensions.push(escapeKeymap);

    // CM→PM sync via update listener. Two responsibilities:
    //   1. Doc changes → forward text into PM (existing behavior).
    //   2. Focus changes → set PM NodeSelection on this block when CM gains
    //      focus (e.g. user clicks inside CM). Without this, SelectionStatePlugin
    //      (Precedent #27) sees stale `state.selection` whenever CM has focus,
    //      so halo/breadcrumb/aria-live report the wrong block. The guard in
    //      the canonical PM+CM example uses `updatingRef` to prevent PM→CM→PM
    //      loops; we reuse the same flag.
    extensions.push(
      CMEditorView.updateListener.of((update) => {
        if (update.docChanged && !updatingRef.current) {
          forwardUpdate(update.state.doc.toString());
        }
        if (update.focusChanged && update.view.hasFocus && !updatingRef.current) {
          const pos = typeof getPos === 'function' ? getPos() : undefined;
          if (typeof pos !== 'number') return;
          const pmView = editor.view;
          if (!pmView) return;
          const currentSel = pmView.state.selection;
          // Already a NodeSelection on this exact node → nothing to do
          if (currentSel instanceof NodeSelection && currentSel.from === pos) return;
          const currentNode = pmView.state.doc.nodeAt(pos);
          if (!currentNode) return;
          updatingRef.current = true;
          try {
            pmView.dispatch(
              pmView.state.tr.setSelection(NodeSelection.create(pmView.state.doc, pos)),
            );
          } catch (err) {
            updatingRef.current = false;
            throw err;
          }
          updatingRef.current = false;
        }
      }),
    );

    const cmView = new CMEditorView({
      doc: node.textContent,
      extensions,
      parent: container,
    });

    cmViewRef.current = cmView;

    // FR-32: forward markUserTyping so SystemDocSubscriber's agent-focus
    // typing guard sees keystrokes originating inside the embedded CM editor
    // (global wall-clock timestamp; no per-doc state since precedent #14).
    const mark = () => markUserTyping();
    const dom = cmView.contentDOM;
    dom.addEventListener('keydown', mark);
    dom.addEventListener('paste', mark);
    dom.addEventListener('drop', mark);
    dom.addEventListener('cut', mark);
    const teardownTypingListeners = () => {
      dom.removeEventListener('keydown', mark);
      dom.removeEventListener('paste', mark);
      dom.removeEventListener('drop', mark);
      dom.removeEventListener('cut', mark);
    };

    return () => {
      teardownTypingListeners();
      cmView.destroy();
      cmViewRef.current = null;
    };
  }, []);

  // Theme hot-swap (FR-33): each instance uses its own Compartment
  useEffect(() => {
    const cmView = cmViewRef.current;
    if (!cmView) return;
    const theme = resolvedTheme === 'dark' ? darkTheme : lightTheme;
    cmView.dispatch({
      effects: themeCompartmentRef.current.reconfigure(theme),
    });
  }, [resolvedTheme]);

  // PM→CM selection sync (Precedent #27 + canonical PM+CM pattern): when
  // PM selection lands on or inside this node — via outer arrow navigation,
  // slash-insert-with-focus, programmatic commands — mirror it into CM so
  // the nested editor reflects the intended caret. Two cases:
  //   (a) NodeSelection on this node → CM just gets focus (cursor stays at
  //       its previous position, matching canonical `selectNode` behavior).
  //   (b) TextSelection inside the content range → forward the offsets into
  //       CM so the caret lands where PM meant it to.
  // Without this effect, the outer arrow handler (in raw-mdx-fallback.ts)
  // can move PM selection into the node but CM never reflects it, so the
  // visible caret is wherever CM happened to be.
  useEffect(() => {
    const handler = () => {
      const pos = typeof getPos === 'function' ? getPos() : undefined;
      if (typeof pos !== 'number') return;
      const cmView = cmViewRef.current;
      if (!cmView) return;
      if (updatingRef.current) return;
      const pmView = editor.view;
      if (!pmView) return;
      const currentNode = pmView.state.doc.nodeAt(pos);
      if (!currentNode) return;

      const sel = pmView.state.selection;
      const nodeStart = pos + 1; // offset 0 of content
      const nodeEnd = pos + currentNode.nodeSize - 1;

      // NodeSelection on this exact node — just take focus
      if (sel instanceof NodeSelection && sel.from === pos) {
        if (!cmView.hasFocus) {
          updatingRef.current = true;
          try {
            cmView.focus();
          } catch (err) {
            updatingRef.current = false;
            throw err;
          }
          updatingRef.current = false;
        }
        return;
      }

      // TextSelection inside this node's content range — forward anchor/head
      if (sel.from >= nodeStart && sel.to <= nodeEnd) {
        const maxOffset = cmView.state.doc.length;
        const anchor = Math.max(0, Math.min(sel.anchor - nodeStart, maxOffset));
        const head = Math.max(0, Math.min(sel.head - nodeStart, maxOffset));
        const cmSel = cmView.state.selection.main;
        if (cmSel.anchor === anchor && cmSel.head === head && cmView.hasFocus) return;
        updatingRef.current = true;
        try {
          cmView.dispatch({ selection: { anchor, head } });
          if (!cmView.hasFocus) cmView.focus();
        } catch (err) {
          updatingRef.current = false;
          throw err;
        }
        updatingRef.current = false;
      }
    };
    editor.on('selectionUpdate', handler);
    return () => {
      editor.off('selectionUpdate', handler);
    };
  }, [editor, getPos]);

  // PM→CM sync: when the PM node's text content changes externally
  // (e.g., remote peer edit, agent write), update the CM view.
  const textContent = node.textContent;
  useEffect(() => {
    const cmView = cmViewRef.current;
    if (!cmView || updatingRef.current) return;

    const oldText = cmView.state.doc.toString();
    const change = computeChange(oldText, textContent);
    if (!change) return;

    // Symmetric release with forwardUpdate: a CM dispatch throw must not
    // strand the PM→CM bridge in the "skip" state forever. React Compiler
    // does not support try/finally without a catch, so we catch/release/rethrow.
    updatingRef.current = true;
    try {
      cmView.dispatch({
        changes: { from: change.from, to: change.to, insert: change.text },
      });
    } catch (err) {
      updatingRef.current = false;
      throw err;
    }
    updatingRef.current = false;
  }, [textContent]);

  const handleDelete = () => {
    const p = typeof getPos === 'function' ? getPos() : undefined;
    if (typeof p !== 'number') return;
    editor.chain().focus().setNodeSelection(p).deleteSelection().run();
  };

  return (
    <NodeViewWrapper
      className={`raw-mdx-fallback-wrapper relative my-2 py-2 rounded border border-dashed ${style.wrapperClass}`}
      contentEditable={false}
      data-drag-handle=""
      draggable="true"
      data-severity={severity}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: stopPropagation required inside PM NodeView */}
      <div
        className="absolute top-1 right-1 z-10 flex items-center gap-1.5"
        contentEditable={false}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${style.badgeClass}`}
          title={reason}
        >
          {style.label}
        </span>
        <button
          type="button"
          className="jsx-chrome-btn jsx-chrome-btn--delete"
          aria-label="Delete block"
          onClick={handleDelete}
        >
          <Trash2 size={12} />
        </button>
      </div>

      <div ref={cmContainerRef} className="raw-mdx-fallback-cm" />
    </NodeViewWrapper>
  );
}

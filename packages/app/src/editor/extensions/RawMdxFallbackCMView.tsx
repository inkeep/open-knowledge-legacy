/**
 * RawMdxFallback NodeView with embedded CodeMirror 6 (FR-30..FR-35, §9.14).
 *
 * Implements the canonical ProseMirror + CodeMirror pattern
 * (prosemirror.net/examples/codemirror/) adapted for TipTap's React NodeView.
 *
 * Architecture (Precedent #18 — direct PM dispatch, NOT y-codemirror.next):
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
import { NodeViewWrapper } from '@tiptap/react';
import { Trash2 } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useRef } from 'react';
import { markUserTyping } from '../observers';
import { getYDoc } from '../utils/get-ydoc';
import { classifySeverity, SEVERITY_STYLES } from '../utils/severity';
import { createNestedCMExtensions, darkTheme, lightTheme } from './nested-cm-extensions';

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

    const ydoc = getYDoc(editor);
    const extensions = createNestedCMExtensions({
      themeCompartment,
      resolvedTheme,
      ydoc: ydoc ?? undefined,
      extraKeymaps: undoRedoKeymap,
    });

    // CM→PM sync via update listener
    extensions.push(
      CMEditorView.updateListener.of((update) => {
        if (updatingRef.current || !update.docChanged) return;
        forwardUpdate(update.state.doc.toString());
      }),
    );

    const cmView = new CMEditorView({
      doc: node.textContent,
      extensions,
      parent: container,
    });

    cmViewRef.current = cmView;

    // FR-32: forward markUserTyping for Observer B typing-defer
    try {
      if (ydoc) {
        const mark = () => markUserTyping(ydoc);
        const dom = cmView.contentDOM;
        dom.addEventListener('keydown', mark);
        dom.addEventListener('paste', mark);
        dom.addEventListener('drop', mark);
        dom.addEventListener('cut', mark);
      }
    } catch {
      // No collaboration extension — typing-defer not wired
    }

    return () => {
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

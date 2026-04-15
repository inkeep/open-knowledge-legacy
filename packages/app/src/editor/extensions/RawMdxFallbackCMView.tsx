/**
 * RawMdxFallback NodeView with embedded CodeMirror 6 (FR-30..FR-35, §9.14).
 *
 * Implements the canonical ProseMirror + CodeMirror pattern
 * (prosemirror.net/examples/codemirror/) adapted for TipTap's React NodeView.
 *
 * Architecture (Precedent #12 — direct PM dispatch, NOT y-codemirror.next):
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
import { useTheme } from 'next-themes';
import { useEffect, useRef } from 'react';
import { markUserTyping } from '../observers';
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

  // Stable ref for forwardUpdate so the CM listener closure always has
  // the latest getPos/node values without re-creating the CM instance.
  const forwardUpdateRef = useRef<(newText: string) => void>(() => {});
  forwardUpdateRef.current = (newText: string) => {
    const pos = typeof getPos === 'function' ? getPos() : undefined;
    if (pos === undefined) return;

    const pmView = editor.view;
    if (!pmView) return;

    const start = pos + 1;
    const end = pos + node.nodeSize - 1;

    updatingRef.current = true;
    const tr = pmView.state.tr;
    if (newText.length === 0) {
      tr.delete(start, end);
    } else {
      const textNode = pmView.state.schema.text(newText);
      tr.replaceWith(start, end, textNode);
    }
    pmView.dispatch(tr);
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

    const extensions = createNestedCMExtensions({
      themeCompartment,
      resolvedTheme,
      extraKeymaps: undoRedoKeymap,
    });

    // CM→PM sync via update listener
    extensions.push(
      CMEditorView.updateListener.of((update) => {
        if (updatingRef.current || !update.docChanged) return;
        forwardUpdateRef.current(update.state.doc.toString());
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
      const collabExt = editor.extensionManager.extensions.find((e) => e.name === 'collaboration');
      const ydoc = collabExt?.options?.document as import('yjs').Doc | undefined;
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

    updatingRef.current = true;
    cmView.dispatch({
      changes: { from: change.from, to: change.to, insert: change.text },
    });
    updatingRef.current = false;
  }, [textContent]);

  return (
    <NodeViewWrapper
      className="raw-mdx-fallback-wrapper relative my-2 rounded border border-dashed border-amber-400/60 dark:border-amber-500/40 bg-amber-50/50 dark:bg-amber-900/10"
      contentEditable={false}
      data-drag-handle=""
      draggable="true"
    >
      <span
        className="absolute top-1 right-1 z-10 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30"
        title={reason}
      >
        raw
      </span>

      <div ref={cmContainerRef} className="raw-mdx-fallback-cm" />
    </NodeViewWrapper>
  );
}

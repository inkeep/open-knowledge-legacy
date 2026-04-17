'use client';

import { offset } from '@floating-ui/dom';
import { Extension } from '@tiptap/core';
import { DragHandlePlugin, normalizeNestedOptions } from '@tiptap/extension-drag-handle';
import Placeholder from '@tiptap/extension-placeholder';
import { Table } from '@tiptap/extension-table';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableRow } from '@tiptap/extension-table-row';
import { TaskItem } from '@tiptap/extension-task-item';
import { TaskList } from '@tiptap/extension-task-list';
import type { Node as PmNode } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Markdown as TiptapMarkdown } from 'tiptap-markdown';
import { DemoSlashCommand } from './demo-slash-command';

const DEMO_MARKDOWN = `# Getting Started with Open Knowledge

Open Knowledge is an **agent-native knowledge platform** where humans and AI collaborate in real time.

## Quick Setup

Run a single command to start:

\`\`\`
npx @inkeep/open-knowledge
\`\`\`

This starts the server, editor, and MCP endpoint. Your current directory becomes the content root — every \`.md\` file is instantly available.

## Key Concepts

- **CRDT collaboration** — multiple writers never conflict
- **Wiki Links** — connect ideas across pages
- **Shadow git** — every edit is attributed to its author
- Connect any MCP-compatible agent: *Claude*, *Cursor*, *Codex*

> Open Knowledge stores everything as plain markdown files. No database, no lock-in — just files in a folder you already own.`;

export function EditorDemo() {
  const [mode, setMode] = useState<'visual' | 'source'>('visual');
  const [markdown, setMarkdown] = useState(DEMO_MARKDOWN);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      TiptapMarkdown.configure({
        html: false,
        transformCopiedText: true,
        transformPastedText: true,
      }),
      DemoSlashCommand,
      DemoBlockDragHandle,
      Placeholder.configure({
        placeholder: "Type '/' for commands",
        showOnlyCurrent: true,
      }),
    ],
    content: DEMO_MARKDOWN,
    editorProps: {
      attributes: {
        class: 'ok-prosemirror outline-none min-h-[360px] px-8 py-6 sm:pl-16 sm:pr-12 sm:py-8',
        style: 'line-height: 1.7; color: var(--slide-text)',
      },
    },
  });

  function handleModeChange(newMode: 'visual' | 'source') {
    if (newMode === mode) return;

    if (newMode === 'source' && editor) {
      // tiptap-markdown extends storage but doesn't export types
      const storage = editor.storage as unknown as Record<string, { getMarkdown: () => string }>;
      const md = storage.markdown.getMarkdown();
      setMarkdown(md);
    }

    if (newMode === 'visual' && editor) {
      editor.commands.setContent(markdown);
    }

    setMode(newMode);
  }

  useEffect(() => {
    if (mode === 'source' && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [mode]);

  return (
    <section>
      <div className="px-6 py-16 text-center md:py-20">
        <p className="mb-3 text-sm font-medium uppercase tracking-[0.2em] text-[var(--slide-accent)]">
          Try it
        </p>
        <h2 className="text-3xl font-light tracking-tight text-[var(--slide-text)] sm:text-4xl">
          Two modes, one source of truth
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-[var(--slide-muted)]">
          Switch between rich editing and raw markdown. Edit in either mode — the content stays in
          sync, just like the real product.
        </p>
      </div>

      <div
        className="overflow-hidden"
        style={{
          borderColor: 'var(--slide-border)',
          backgroundColor: 'var(--slide-bg-elevated)',
        }}
      >
        <header
          className="flex h-12 shrink-0 items-center border-b"
          style={{ borderColor: 'var(--slide-border)' }}
        >
          <div className="flex flex-1 items-center gap-2 px-4 sm:px-6">
            <SidebarIcon />
            <div className="h-4 w-px shrink-0" style={{ backgroundColor: 'var(--slide-border)' }} />
            <span className="truncate text-sm text-[var(--slide-muted)]">getting-started.md</span>
          </div>

          <ModeToggle mode={mode} onChange={handleModeChange} />

          <div className="flex flex-1 items-center justify-end gap-2 px-4 sm:px-6">
            <MockPresenceBar />
          </div>
        </header>

        <div className="relative h-[50vh] min-h-[420px] max-h-[640px] overflow-hidden">
          {/* Visual mode — real TipTap editor */}
          <div
            className="absolute inset-0 overflow-y-auto transition-all duration-400"
            style={{
              opacity: mode === 'visual' ? 1 : 0,
              transform: mode === 'visual' ? 'translateX(0)' : 'translateX(-20px)',
              pointerEvents: mode === 'visual' ? 'auto' : 'none',
              transitionTimingFunction: 'cubic-bezier(0.23, 1, 0.32, 1)',
            }}
          >
            <div className="mx-auto max-w-4xl">
              <EditorContent editor={editor} />
            </div>
          </div>

          {/* Source mode — editable textarea */}
          <div
            className="absolute inset-0 overflow-y-auto transition-all duration-400"
            style={{
              opacity: mode === 'source' ? 1 : 0,
              transform: mode === 'source' ? 'translateX(0)' : 'translateX(20px)',
              pointerEvents: mode === 'source' ? 'auto' : 'none',
              transitionTimingFunction: 'cubic-bezier(0.23, 1, 0.32, 1)',
            }}
          >
            <div className="mx-auto max-w-4xl">
              <SourceTextarea ref={textareaRef} value={markdown} onChange={setMarkdown} />
            </div>
          </div>

          <div
            className="pointer-events-none absolute right-0 bottom-0 left-0 h-24 z-10"
            style={{
              background:
                'linear-gradient(to top, var(--slide-bg), var(--slide-bg-elevated) 60%, transparent)',
            }}
          />
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * SourceTextarea — styled to look like the real CodeMirror source editor
 * --------------------------------------------------------------------------- */

function SourceTextarea({
  ref,
  value,
  onChange,
}: {
  ref: React.Ref<HTMLTextAreaElement>;
  value: string;
  onChange: (value: string) => void;
}) {
  const lines = value.split('\n');
  return (
    <div
      className="flex h-full py-3"
      style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}
    >
      {/* Line numbers */}
      <div
        className="shrink-0 select-none pt-0 text-right text-[13px] leading-[1.7] whitespace-pre"
        style={{
          color: 'var(--slide-muted)',
          opacity: 0.35,
          width: '3rem',
          paddingRight: '0.75rem',
        }}
        aria-hidden="true"
      >
        {lines.map((_, i) => `${i + 1}\n`).join('')}
      </div>
      {/* Editable area */}
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 resize-none border-none bg-transparent text-[13px] leading-[1.7] outline-none"
        style={{ color: 'var(--slide-text)', caretColor: 'var(--slide-accent)' }}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
      />
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Icons — exact SVGs from packages/app/src/components/icons/
 * --------------------------------------------------------------------------- */

function TextboxIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
      <path d="M112,40a8,8,0,0,0-8,8V64H24A16,16,0,0,0,8,80v96a16,16,0,0,0,16,16h80v16a8,8,0,0,0,16,0V48A8,8,0,0,0,112,40ZM24,176V80h80v96ZM248,80v96a16,16,0,0,1-16,16H144a8,8,0,0,1,0-16h88V80H144a8,8,0,0,1,0-16h88A16,16,0,0,1,248,80ZM88,112a8,8,0,0,1-8,8H72v24a8,8,0,0,1-16,0V120H48a8,8,0,0,1,0-16H80A8,8,0,0,1,88,112Z" />
    </svg>
  );
}

function MarkdownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
      <path d="M232,48H24A16,16,0,0,0,8,64V192a16,16,0,0,0,16,16H232a16,16,0,0,0,16-16V64A16,16,0,0,0,232,48Zm0,144H24V64H232V192ZM128,104v48a8,8,0,0,1-16,0V123.31L93.66,141.66a8,8,0,0,1-11.32,0L64,123.31V152a8,8,0,0,1-16,0V104a8,8,0,0,1,13.66-5.66L88,124.69l26.34-26.35A8,8,0,0,1,128,104Zm77.66,18.34a8,8,0,0,1,0,11.32l-24,24a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L168,132.69V104a8,8,0,0,1,16,0v28.69l10.34-10.35A8,8,0,0,1,205.66,122.34Z" />
    </svg>
  );
}

function SidebarIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ color: 'var(--slide-muted)' }}
    >
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
    </svg>
  );
}

/* ---------------------------------------------------------------------------
 * ModeToggle — mirrors the real ToggleGroup with variant="segmented" size="sm"
 * --------------------------------------------------------------------------- */

function ModeToggle({
  mode,
  onChange,
}: {
  mode: 'visual' | 'source';
  onChange: (mode: 'visual' | 'source') => void;
}) {
  return (
    <div
      className="flex shrink-0 items-center gap-1 rounded-[10px] p-0.5"
      style={{ backgroundColor: 'color-mix(in srgb, var(--slide-text) 5%, transparent)' }}
    >
      <ToggleItem active={mode === 'visual'} onClick={() => onChange('visual')}>
        <TextboxIcon className="size-3.5 shrink-0" />
        Visual
      </ToggleItem>
      <ToggleItem active={mode === 'source'} onClick={() => onChange('source')}>
        <MarkdownIcon className="size-3.5 shrink-0" />
        Markdown
      </ToggleItem>
    </div>
  );
}

function ToggleItem({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-7 items-center gap-1.5 rounded-[10px] px-2.5 text-[0.8rem] font-medium transition-all duration-200"
      style={{
        color: active ? 'var(--slide-text)' : 'var(--slide-muted)',
        backgroundColor: active ? 'var(--slide-bg-elevated)' : 'transparent',
        boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
      }}
    >
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------------------
 * DemoBlockDragHandle — uses the real @tiptap/extension-drag-handle plugin.
 * Mirrors packages/app/src/editor/extensions/drag-handle.ts but self-contained.
 * --------------------------------------------------------------------------- */

const HANDLE_HEIGHT = 20;
const MAX_SINGLE_LINE_HEIGHT = 44;
const BODY_LINE_HEIGHT = 28;

const DemoBlockDragHandle = Extension.create({
  name: 'demoBlockDragHandle',

  addProseMirrorPlugins() {
    const editor = this.editor;

    let currentNode: PmNode | null = null;
    let currentNodePos = -1;

    const container = document.createElement('div');
    container.className = 'ok-block-controls';
    container.style.visibility = 'hidden';

    const addBtn = document.createElement('button');
    addBtn.className = 'ok-add-block-btn';
    addBtn.setAttribute('aria-label', 'Add block below');
    addBtn.setAttribute('type', 'button');
    addBtn.innerHTML = `<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>`;

    addBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    const grip = document.createElement('div');
    grip.className = 'ok-drag-grip';
    grip.setAttribute('aria-hidden', 'true');
    grip.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>`;

    container.appendChild(addBtn);
    container.appendChild(grip);

    addBtn.addEventListener('click', () => {
      if (!currentNode || currentNodePos < 0) return;
      const { state, view } = editor;
      const insertAt = currentNodePos + currentNode.nodeSize;
      if (insertAt > state.doc.content.size) return;

      const { tr } = state;
      const paragraph = state.schema.nodes.paragraph?.create();
      if (!paragraph) return;

      tr.insert(insertAt, paragraph);
      const sel = TextSelection.near(tr.doc.resolve(insertAt + 1));
      tr.setSelection(sel).scrollIntoView();
      view.dispatch(tr);
      view.focus();

      editor.commands.insertContent('/');
    });

    return [
      DragHandlePlugin({
        element: container,
        editor,
        onNodeChange({ node, pos }: { node: PmNode | null; pos: number }) {
          currentNode = node;
          currentNodePos = pos ?? -1;
        },
        computePositionConfig: {
          placement: 'left-start',
          strategy: 'absolute',
          middleware: [
            offset(({ rects }) => {
              const firstLineHeight =
                rects.reference.height <= MAX_SINGLE_LINE_HEIGHT
                  ? rects.reference.height
                  : BODY_LINE_HEIGHT;
              return {
                mainAxis: 10,
                crossAxis: (firstLineHeight - HANDLE_HEIGHT) / 2,
              };
            }),
          ],
        },
        nestedOptions: normalizeNestedOptions(false),
      }).plugin,
    ];
  },
});

/* ---------------------------------------------------------------------------
 * MockPresenceBar — mirrors packages/app/src/presence/PresenceBar.tsx
 * --------------------------------------------------------------------------- */

function MockPresenceBar() {
  return (
    <div className="flex items-center gap-2 px-1 py-1.5">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wide text-[var(--slide-muted)]">
        <span className="relative inline-flex size-2">
          <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
        </span>
      </span>
      <div className="flex items-center -space-x-1.5">
        <div
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-full ring-2"
          style={
            {
              backgroundColor: '#6366f1',
              '--tw-ring-color': 'var(--slide-bg-elevated)',
            } as React.CSSProperties
          }
          role="img"
          aria-label="Happy Turtle"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#fff"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m12 10 2 4v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3a8 8 0 1 0-16 0v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3l2-4h4Z" />
            <path d="M4.82 7.9 8 10" />
            <path d="M15.18 7.9 12 10" />
            <path d="M16.93 10H20a2 2 0 0 1 0 4H2" />
          </svg>
        </div>
        <div
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-full ring-2"
          style={
            {
              backgroundColor: '#d97757',
              '--tw-ring-color': 'var(--slide-bg-elevated)',
            } as React.CSSProperties
          }
          role="img"
          aria-label="Claude"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#fff"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 8V4H8" />
            <rect width="16" height="12" x="4" y="8" rx="2" />
            <path d="M2 14h2" />
            <path d="M20 14h2" />
            <path d="M15 13v2" />
            <path d="M9 13v2" />
          </svg>
        </div>
      </div>
    </div>
  );
}

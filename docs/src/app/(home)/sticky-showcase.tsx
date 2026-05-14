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
import type { LucideIcon } from 'lucide-react';
import { BrainCircuitIcon, PenToolIcon, TerminalIcon } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Markdown as TiptapMarkdown } from 'tiptap-markdown';

interface ShowcaseItem {
  step: string;
  icon: LucideIcon;
  title: string;
  description: string;
  visual: React.ReactNode;
}

const items: ShowcaseItem[] = [
  {
    step: '01',
    icon: TerminalIcon,
    title: 'Run one command',
    description: 'npx @inkeep/open-knowledge',
    visual: <InstallVisual />,
  },
  {
    step: '02',
    icon: PenToolIcon,
    title: 'Open the editor\nand start writing',
    description:
      'A rich WYSIWYG editor opens in your browser. Toggle to source mode anytime. Your content is saved as plain markdown files — no database, just files in a folder.',
    visual: <EditorVisual />,
  },
  {
    step: '03',
    icon: BrainCircuitIcon,
    title: 'Connect an AI agent\nand collaborate in real time',
    description:
      'Point any MCP-compatible agent — Claude, Cursor, Codex — at the server. The agent reads, writes, and searches your knowledge base alongside you, live.',
    visual: <CollabVisual />,
  },
];

export function StickyShowcase() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const observers: IntersectionObserver[] = [];

    for (const [i, section] of sectionRefs.current.entries()) {
      if (!section) continue;

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setActiveIndex(i);
          }
        },
        { threshold: 0.5 },
      );

      observer.observe(section);
      observers.push(observer);
    }

    return () => {
      for (const obs of observers) obs.disconnect();
    };
  }, []);

  return (
    <section className="bg-[var(--slide-bg)] px-6">
      <div ref={containerRef} className="mx-auto max-w-6xl">
        <div className="pt-24 md:pt-32">
          <p className="mb-3 text-sm font-medium uppercase tracking-[0.2em] text-[var(--slide-accent)]">
            Get started
          </p>
          <h2 className="text-3xl font-light tracking-tight text-[var(--slide-text)] sm:text-4xl">
            Up and running in under a minute
          </h2>
          <p className="mt-4 max-w-2xl text-[var(--slide-muted)]">
            Three steps from zero to a live, AI-collaborative knowledge base.
          </p>
        </div>
        <div className="relative md:grid md:grid-cols-2 md:gap-12 lg:gap-20">
          {/* Left: scrolling text */}
          <div className="py-16 md:py-20">
            {items.map((item, i) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.step}
                  ref={(el) => {
                    sectionRefs.current[i] = el;
                  }}
                  className="flex min-h-[70vh] flex-col justify-center py-12 first:pt-0 last:pb-0"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-semibold text-[var(--slide-accent)]">
                      {item.step}
                    </span>
                    <div className="h-px flex-1 max-w-8 bg-[var(--slide-accent)]/30" />
                    <Icon className="size-4 text-[var(--slide-accent)]" strokeWidth={2} />
                  </div>

                  <h3 className="mt-5 whitespace-pre-line text-2xl font-light leading-snug tracking-tight text-[var(--slide-text)] sm:text-3xl">
                    {item.title}
                  </h3>

                  <p className="mt-4 max-w-md text-[15px] leading-relaxed text-[var(--slide-muted)]">
                    {item.description}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Right: sticky visual */}
          <div className="hidden md:block">
            <div className="sticky top-28 py-20">
              <div
                className="mb-2 flex items-end justify-center gap-1.5 transition-all duration-500"
                style={{
                  opacity: activeIndex === 1 ? 1 : 0,
                  transform: activeIndex === 1 ? 'translateY(0)' : 'translateY(-6px)',
                }}
              >
                <span className="text-sm font-medium italic text-[var(--slide-accent)]">
                  Try it
                </span>
                <svg
                  width="20"
                  height="28"
                  viewBox="0 0 20 28"
                  fill="none"
                  className="-mb-0.5 text-[var(--slide-accent)]"
                  aria-hidden="true"
                  role="img"
                >
                  <title>Arrow pointing to editor</title>
                  <path
                    d="M10 2C10 8 10 16 10 22"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M5 18L10 23L15 18"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div className="relative aspect-[4/3] w-full overflow-hidden">
                {items.map((item, i) => (
                  <div
                    key={item.step}
                    className="absolute inset-0 transition-all duration-500 ease-out"
                    style={{
                      opacity: activeIndex === i ? 1 : 0,
                      pointerEvents: activeIndex === i ? 'auto' : 'none',
                      transform:
                        activeIndex === i
                          ? 'translateY(0) scale(1)'
                          : activeIndex > i
                            ? 'translateY(-12px) scale(0.97)'
                            : 'translateY(12px) scale(0.97)',
                    }}
                  >
                    {item.visual}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Mobile: inline visuals */}
          <div className="md:hidden">
            {items.map((item) => (
              <div key={`mobile-${item.step}`} className="mb-16 aspect-[4/3]">
                {item.visual}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function MockBrowserChrome({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="flex h-full flex-col overflow-hidden rounded-xl shadow-lg"
      style={{
        border: '1px solid var(--slide-border)',
        backgroundColor: 'var(--slide-bg-elevated)',
      }}
    >
      <div
        className="flex items-center gap-2 border-b px-4 py-2.5"
        style={{ borderColor: 'var(--slide-border)' }}
      >
        <div className="flex gap-1.5">
          <div className="size-2.5 rounded-full bg-[#ff5f57]" />
          <div className="size-2.5 rounded-full bg-[#febc2e]" />
          <div className="size-2.5 rounded-full bg-[#28c840]" />
        </div>
        <span className="ml-2 text-xs text-[var(--slide-muted)]">{title}</span>
      </div>
      <div className="flex-1 overflow-hidden p-4">{children}</div>
    </div>
  );
}

const EDITOR_DEMO_MD = `# Getting Started

Open Knowledge is an **agent-native knowledge platform** where humans and AI collaborate in real time.

## Quick Setup

Run a single command to start:

\`\`\`
npx @inkeep/open-knowledge
\`\`\`

This starts the server, editor, and MCP endpoint.

## Key Concepts

- **CRDT collaboration** — multiple writers never conflict
- **Wiki Links** — connect ideas across pages
- **Shadow git** — every edit is attributed to its author`;

function EditorVisual() {
  const [mode, setMode] = useState<'visual' | 'source'>('visual');
  const [markdown, setMarkdown] = useState(EDITOR_DEMO_MD);
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
      CompactDragHandle,
      Placeholder.configure({
        placeholder: "Type '/' for commands",
        showOnlyCurrent: true,
      }),
    ],
    content: EDITOR_DEMO_MD,
    editorProps: {
      attributes: {
        class: 'ok-prosemirror outline-none min-h-[200px] px-4 py-3 sm:pl-14 sm:pr-4',
        style: 'line-height: 1.7; color: var(--slide-text); font-size: 12px',
      },
    },
  });

  function handleModeChange(newMode: 'visual' | 'source') {
    if (newMode === mode) return;
    if (newMode === 'source' && editor) {
      const storage = editor.storage as unknown as Record<string, { getMarkdown: () => string }>;
      setMarkdown(storage.markdown.getMarkdown());
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
    <MockBrowserChrome title="open-knowledge — Getting Started">
      <div className="flex flex-col h-full -m-4">
        <div
          className="flex items-center justify-between border-b px-3 py-1.5"
          style={{ borderColor: 'var(--slide-border)' }}
        >
          <span className="text-[10px] text-[var(--slide-muted)]">getting-started.md</span>
          <MiniModeToggle mode={mode} onChange={handleModeChange} />
        </div>
        <div className="relative flex-1 overflow-hidden">
          <div
            className="absolute inset-0 overflow-y-auto transition-all duration-300"
            style={{
              opacity: mode === 'visual' ? 1 : 0,
              transform: mode === 'visual' ? 'translateX(0)' : 'translateX(-12px)',
              pointerEvents: mode === 'visual' ? 'auto' : 'none',
            }}
          >
            {/* biome-ignore lint/plugin/no-unportaled-editor-content: single-editor docs showcase — no cross-Activity DOM neighbor possible; H6 vacuum precondition (shared view.dom parent) cannot arise here */}
            <EditorContent editor={editor} />
          </div>
          <div
            className="absolute inset-0 overflow-y-auto transition-all duration-300"
            style={{
              opacity: mode === 'source' ? 1 : 0,
              transform: mode === 'source' ? 'translateX(0)' : 'translateX(12px)',
              pointerEvents: mode === 'source' ? 'auto' : 'none',
            }}
          >
            <CompactSourceView ref={textareaRef} value={markdown} onChange={setMarkdown} />
          </div>
          <div
            className="pointer-events-none absolute right-0 bottom-0 left-0 h-10 z-10"
            style={{
              background: 'linear-gradient(to top, var(--slide-bg-elevated), transparent)',
            }}
          />
        </div>
      </div>
    </MockBrowserChrome>
  );
}

function MiniModeToggle({
  mode,
  onChange,
}: {
  mode: 'visual' | 'source';
  onChange: (mode: 'visual' | 'source') => void;
}) {
  return (
    <div
      className="flex items-center gap-0.5 rounded-md p-0.5"
      style={{ backgroundColor: 'color-mix(in srgb, var(--slide-text) 5%, transparent)' }}
    >
      <button
        type="button"
        onClick={() => onChange('visual')}
        className="rounded-md px-1.5 py-0.5 text-[9px] font-medium transition-all duration-200"
        style={{
          color: mode === 'visual' ? 'var(--slide-text)' : 'var(--slide-muted)',
          backgroundColor: mode === 'visual' ? 'var(--slide-bg-elevated)' : 'transparent',
          boxShadow: mode === 'visual' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
        }}
      >
        Visual
      </button>
      <button
        type="button"
        onClick={() => onChange('source')}
        className="rounded-md px-1.5 py-0.5 text-[9px] font-medium transition-all duration-200"
        style={{
          color: mode === 'source' ? 'var(--slide-text)' : 'var(--slide-muted)',
          backgroundColor: mode === 'source' ? 'var(--slide-bg-elevated)' : 'transparent',
          boxShadow: mode === 'source' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
        }}
      >
        Markdown
      </button>
    </div>
  );
}

function CompactSourceView({
  ref,
  value,
  onChange,
}: {
  ref: React.Ref<HTMLTextAreaElement>;
  value: string;
  onChange: (v: string) => void;
}) {
  const lines = value.split('\n');
  return (
    <div
      className="flex h-full py-3"
      style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}
    >
      <div
        className="shrink-0 select-none text-right text-[10px] leading-[1.7] whitespace-pre"
        style={{
          color: 'var(--slide-muted)',
          opacity: 0.35,
          width: '2rem',
          paddingRight: '0.5rem',
        }}
        aria-hidden="true"
      >
        {lines.map((_, i) => `${i + 1}\n`).join('')}
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 resize-none border-none bg-transparent text-[10px] leading-[1.7] outline-none"
        style={{ color: 'var(--slide-text)', caretColor: 'var(--slide-accent)' }}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
      />
    </div>
  );
}

const HANDLE_HEIGHT = 20;
const MAX_SINGLE_LINE_HEIGHT = 44;
const BODY_LINE_HEIGHT = 28;

const CompactDragHandle = Extension.create({
  name: 'compactDragHandle',

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
    addBtn.innerHTML = `<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>`;
    addBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    const grip = document.createElement('div');
    grip.className = 'ok-drag-grip';
    grip.setAttribute('aria-hidden', 'true');
    grip.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>`;

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
              return { mainAxis: 8, crossAxis: (firstLineHeight - HANDLE_HEIGHT) / 2 };
            }),
          ],
        },
        nestedOptions: normalizeNestedOptions(false),
      }).plugin,
    ];
  },
});

function CollabVisual() {
  return (
    <MockBrowserChrome title="open-knowledge — API Reference">
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b border-[var(--slide-border)] pb-2">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <div className="size-5 rounded-full bg-[var(--slide-accent)] text-center text-[8px] leading-5 font-bold text-white">
                Y
              </div>
              <div className="size-5 rounded-full bg-emerald-500 text-center text-[8px] leading-5 font-bold text-white">
                AI
              </div>
            </div>
            <span className="text-[10px] text-[var(--slide-muted)]">2 connected</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="size-1.5 rounded-full bg-emerald-500" />
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400">Live</span>
          </div>
        </div>
        <div className="space-y-2.5">
          <div
            className="h-5 w-2/3 rounded"
            style={{ backgroundColor: 'var(--slide-text)', opacity: 0.12 }}
          />
          <div className="space-y-1.5">
            <div
              className="h-3 w-full rounded"
              style={{ backgroundColor: 'var(--slide-text)', opacity: 0.06 }}
            />
            <div
              className="h-3 w-5/6 rounded"
              style={{ backgroundColor: 'var(--slide-text)', opacity: 0.06 }}
            />
          </div>
          <div
            className="relative rounded-md p-2.5"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--slide-accent) 4%, transparent)',
              border: '1px solid color-mix(in srgb, var(--slide-accent) 15%, transparent)',
            }}
          >
            <div className="absolute -top-2 left-3 rounded bg-[var(--slide-accent)] px-1.5 py-0.5 text-[8px] font-bold text-white">
              You
            </div>
            <div className="space-y-1.5 pt-1">
              <div
                className="h-2.5 w-full rounded"
                style={{ backgroundColor: 'var(--slide-text)', opacity: 0.06 }}
              />
              <div
                className="h-2.5 w-3/4 rounded"
                style={{ backgroundColor: 'var(--slide-text)', opacity: 0.06 }}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <div
              className="h-3 w-full rounded"
              style={{ backgroundColor: 'var(--slide-text)', opacity: 0.06 }}
            />
          </div>
          <div
            className="relative rounded-md p-2.5"
            style={{
              backgroundColor: 'color-mix(in srgb, #10b981 4%, transparent)',
              border: '1px solid color-mix(in srgb, #10b981 15%, transparent)',
            }}
          >
            <div className="absolute -top-2 left-3 rounded bg-emerald-500 px-1.5 py-0.5 text-[8px] font-bold text-white">
              AI Agent
            </div>
            <div className="space-y-1.5 pt-1">
              <div
                className="h-2.5 w-full rounded"
                style={{ backgroundColor: 'var(--slide-text)', opacity: 0.06 }}
              />
              <div
                className="h-2.5 w-11/12 rounded"
                style={{ backgroundColor: 'var(--slide-text)', opacity: 0.06 }}
              />
              <div
                className="h-2.5 w-2/3 rounded"
                style={{
                  backgroundColor: '#10b981',
                  opacity: 0.15,
                }}
              />
            </div>
            <div className="mt-2 flex items-center gap-1">
              <div
                className="size-1 animate-pulse rounded-full"
                style={{ backgroundColor: '#10b981' }}
              />
              <span className="text-[8px] text-emerald-600 dark:text-emerald-400">typing...</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <div
              className="h-3 w-4/5 rounded"
              style={{ backgroundColor: 'var(--slide-text)', opacity: 0.06 }}
            />
            <div
              className="h-3 w-full rounded"
              style={{ backgroundColor: 'var(--slide-text)', opacity: 0.06 }}
            />
          </div>
        </div>
      </div>
    </MockBrowserChrome>
  );
}

function InstallVisual() {
  return (
    <MockBrowserChrome title="terminal">
      <div className="space-y-3 font-mono text-[11px] leading-relaxed">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[var(--slide-muted)]">$</span>
            <span className="text-[var(--slide-text)]">npx @inkeep/open-knowledge</span>
          </div>
        </div>
        <div className="space-y-1">
          <div className="text-[var(--slide-muted)]">Scaffolding .ok/ ...</div>
          <div className="text-[var(--slide-muted)]">Registering MCP server in .mcp.json ...</div>
        </div>
        <div
          className="rounded-md p-3"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--slide-accent) 5%, transparent)',
            border: '1px solid color-mix(in srgb, var(--slide-accent) 15%, transparent)',
          }}
        >
          <div className="space-y-1.5">
            <div className="text-emerald-600 dark:text-emerald-400">
              Server running at http://localhost:5173
            </div>
            <div className="text-emerald-600 dark:text-emerald-400">
              MCP server ready for agent connections
            </div>
            <div className="text-[var(--slide-muted)]">Watching ./content for changes...</div>
          </div>
        </div>
        <div className="space-y-1 text-[var(--slide-muted)]">
          <div>
            Found <span className="text-[var(--slide-text)]">12 markdown files</span> in content/
          </div>
          <div>Shadow repo initialized at .git/ok/</div>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <div className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
            Ready — open http://localhost:5173 in your browser
          </span>
        </div>
      </div>
    </MockBrowserChrome>
  );
}

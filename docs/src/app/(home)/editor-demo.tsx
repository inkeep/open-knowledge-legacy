'use client';

import { useState } from 'react';

const DEMO_MARKDOWN = `# Getting Started with Open Knowledge

Open Knowledge is an **agent-native knowledge platform** where humans and AI collaborate in real time.

## Quick Setup

Run a single command to start:

\`\`\`bash
npx @inkeep/open-knowledge
\`\`\`

This starts the server, editor, and MCP endpoint. Your current directory becomes the content root — every \`.md\` file is instantly available.

## Key Concepts

- **CRDT collaboration** — multiple writers never conflict
- **[[Wiki Links]]** — connect ideas across pages
- **Shadow git** — every edit is attributed to its author
- Connect any MCP-compatible agent: *Claude*, *Cursor*, *Codex*

> Open Knowledge stores everything as plain markdown files. No database, no lock-in — just files in a folder you already own.`;

export function EditorDemo() {
  const [mode, setMode] = useState<'visual' | 'source'>('visual');

  return (
    <section className="border-t border-[var(--slide-border)] bg-[var(--slide-bg)] px-6 py-24 md:py-32">
      <div className="mx-auto max-w-5xl">
        <div className="mb-12 text-center">
          <p className="mb-3 text-sm font-medium uppercase tracking-[0.2em] text-[var(--slide-accent)]">
            Try it
          </p>
          <h2 className="text-3xl font-light tracking-tight text-[var(--slide-text)] sm:text-4xl">
            Two modes, one source of truth
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[var(--slide-muted)]">
            Switch between rich editing and raw markdown at any time. The CRDT bridge keeps them
            perfectly in sync — your content is always plain{' '}
            <code className="rounded bg-[var(--slide-border)]/50 px-1.5 py-0.5 text-[13px]">
              .md
            </code>{' '}
            files.
          </p>
        </div>

        {/* Editor shell — mirrors the real app's EditorPane + EditorHeader */}
        <div
          className="overflow-hidden rounded-xl border shadow-2xl"
          style={{
            borderColor: 'var(--slide-border)',
            backgroundColor: 'var(--slide-bg-elevated)',
          }}
        >
          {/* EditorHeader — matches packages/app/src/components/EditorHeader.tsx */}
          <header
            className="flex h-12 shrink-0 items-center border-b"
            style={{ borderColor: 'var(--slide-border)' }}
          >
            {/* Left: sidebar trigger + doc name */}
            <div className="flex flex-1 items-center gap-2 px-3">
              <SidebarIcon />
              <div
                className="h-4 w-px shrink-0"
                style={{ backgroundColor: 'var(--slide-border)' }}
              />
              <span className="truncate text-sm text-[var(--slide-muted)]">getting-started.md</span>
            </div>

            {/* Center: segmented toggle — mirrors the real ToggleGroup variant="segmented" */}
            <ModeToggle mode={mode} onChange={setMode} />

            {/* Right: presence bar + sync */}
            <div className="flex flex-1 items-center justify-end gap-2 px-3">
              <MockPresenceBar />
            </div>
          </header>

          {/* Content area — mirrors EditorArea.tsx's CSS show/hide pattern */}
          <div className="relative h-[420px] overflow-hidden sm:h-[480px]">
            <div
              className="absolute inset-0 overflow-y-auto transition-all duration-400"
              style={{
                opacity: mode === 'visual' ? 1 : 0,
                transform: mode === 'visual' ? 'translateX(0)' : 'translateX(-20px)',
                pointerEvents: mode === 'visual' ? 'auto' : 'none',
                transitionTimingFunction: 'cubic-bezier(0.23, 1, 0.32, 1)',
              }}
            >
              <ProseMirrorView />
            </div>
            <div
              className="absolute inset-0 overflow-y-auto transition-all duration-400"
              style={{
                opacity: mode === 'source' ? 1 : 0,
                transform: mode === 'source' ? 'translateX(0)' : 'translateX(20px)',
                pointerEvents: mode === 'source' ? 'auto' : 'none',
                transitionTimingFunction: 'cubic-bezier(0.23, 1, 0.32, 1)',
              }}
            >
              <CodeMirrorView content={DEMO_MARKDOWN} />
            </div>
            <div
              className="pointer-events-none absolute right-0 bottom-0 left-0 h-20"
              style={{
                background: 'linear-gradient(to top, var(--slide-bg-elevated), transparent)',
              }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * Icons — exact SVGs from packages/app/src/components/icons/
 * --------------------------------------------------------------------------- */

function TextboxIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 256 256"
      fill="currentColor"
      width="16"
      height="16"
      aria-hidden="true"
    >
      <path d="M112,40a8,8,0,0,0-8,8V64H24A16,16,0,0,0,8,80v96a16,16,0,0,0,16,16h80v16a8,8,0,0,0,16,0V48A8,8,0,0,0,112,40ZM24,176V80h80v96ZM248,80v96a16,16,0,0,1-16,16H144a8,8,0,0,1,0-16h88V80H144a8,8,0,0,1,0-16h88A16,16,0,0,1,248,80ZM88,112a8,8,0,0,1-8,8H72v24a8,8,0,0,1-16,0V120H48a8,8,0,0,1,0-16H80A8,8,0,0,1,88,112Z" />
    </svg>
  );
}

function MarkdownIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 256 256"
      fill="currentColor"
      width="16"
      height="16"
      aria-hidden="true"
    >
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
      className="relative flex shrink-0 rounded-lg p-0.5"
      style={{ backgroundColor: 'color-mix(in srgb, var(--slide-text) 6%, transparent)' }}
    >
      {/* Sliding background pill */}
      <div
        className="absolute top-0.5 bottom-0.5 rounded-md transition-all duration-300"
        style={{
          backgroundColor: 'var(--slide-bg-elevated)',
          boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
          width: 'calc(50% - 2px)',
          left: mode === 'visual' ? '2px' : 'calc(50%)',
          transitionTimingFunction: 'cubic-bezier(0.23, 1, 0.32, 1)',
        }}
      />
      <button
        type="button"
        onClick={() => onChange('visual')}
        className="relative z-10 flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-200"
        style={{
          color: mode === 'visual' ? 'var(--slide-text)' : 'var(--slide-muted)',
        }}
      >
        <TextboxIcon className="size-3.5" />
        Visual
      </button>
      <button
        type="button"
        onClick={() => onChange('source')}
        className="relative z-10 flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-200"
        style={{
          color: mode === 'source' ? 'var(--slide-text)' : 'var(--slide-muted)',
        }}
      >
        <MarkdownIcon className="size-3.5" />
        Markdown
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * MockPresenceBar — mirrors packages/app/src/presence/PresenceBar.tsx
 * --------------------------------------------------------------------------- */

function MockPresenceBar() {
  return (
    <div className="flex items-center gap-2 px-1 py-1.5">
      {/* SyncIndicator — "synced" state: green dot, no label */}
      <span className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wide text-[var(--slide-muted)]">
        <span className="relative inline-flex size-2">
          <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
        </span>
      </span>
      {/* Participant avatars — overlapping like the real -space-x-1.5 */}
      <div className="flex items-center -space-x-1.5">
        {/* Human avatar with animal icon */}
        <div
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-full ring-2"
          style={
            {
              backgroundColor: '#6366f1',
              // ring color matches elevated bg for punched-out look
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
        {/* Agent avatar (Claude) */}
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

/* ---------------------------------------------------------------------------
 * ProseMirrorView — styled to match the real .ProseMirror CSS from globals.css
 * Uses the exact same font sizes, spacing, colors, and element styling.
 * --------------------------------------------------------------------------- */

function ProseMirrorView() {
  return (
    <div
      className="ok-prosemirror px-8 py-6 sm:px-12 sm:py-8"
      style={{ lineHeight: 1.7, color: 'var(--slide-text)' }}
    >
      <h1>Getting Started with Open Knowledge</h1>

      <p>
        Open Knowledge is an <strong>agent-native knowledge platform</strong> where humans and AI
        collaborate in real time.
      </p>

      <h2>Quick Setup</h2>

      <p>Run a single command to start:</p>

      <pre>
        <code>npx @inkeep/open-knowledge</code>
      </pre>

      <p>
        This starts the server, editor, and MCP endpoint. Your current directory becomes the content
        root — every <code>.md</code> file is instantly available.
      </p>

      <h2>Key Concepts</h2>

      <ul>
        <li>
          <strong>CRDT collaboration</strong> — multiple writers never conflict
        </li>
        <li>
          <span className="ok-wikilink">[[Wiki Links]]</span> — connect ideas across pages
        </li>
        <li>
          <strong>Shadow git</strong> — every edit is attributed to its author
        </li>
        <li>
          Connect any MCP-compatible agent: <em>Claude</em>, <em>Cursor</em>, <em>Codex</em>
        </li>
      </ul>

      <blockquote>
        <p>
          Open Knowledge stores everything as plain markdown files. No database, no lock-in — just
          files in a folder you already own.
        </p>
      </blockquote>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * CodeMirrorView — styled to match the real CodeMirror source editor
 * --------------------------------------------------------------------------- */

function CodeMirrorView({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <div
      className="source-editor-demo py-3"
      style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}
    >
      {lines.map((line, n) => (
        <div key={lineKey(line, n + 1)} className="flex">
          <span
            className="inline-block w-10 shrink-0 select-none pr-3 text-right text-[13px] leading-[1.7]"
            style={{ color: 'var(--slide-muted)', opacity: 0.35 }}
            aria-hidden="true"
          >
            {n + 1}
          </span>
          <span className="flex-1 text-[13px] leading-[1.7]">
            <HighlightedLine line={line} />
          </span>
        </div>
      ))}
    </div>
  );
}

function lineKey(line: string, n: number) {
  return `${n}:${line.length}:${line.charCodeAt(0) || 0}`;
}

function HighlightedLine({ line }: { line: string }) {
  if (line.startsWith('# ') || line.startsWith('## ')) {
    return <span style={{ color: 'var(--slide-accent)', fontWeight: 600 }}>{line}</span>;
  }

  if (line.startsWith('```')) {
    return <span style={{ color: 'var(--slide-muted)' }}>{line}</span>;
  }

  if (line.startsWith('> ')) {
    return (
      <span>
        <span style={{ color: 'var(--slide-accent)', opacity: 0.6 }}>{'> '}</span>
        <span style={{ color: 'var(--slide-text)', opacity: 0.7, fontStyle: 'italic' }}>
          {line.slice(2)}
        </span>
      </span>
    );
  }

  if (line.startsWith('- ')) {
    return (
      <span>
        <span style={{ color: 'var(--slide-accent)', opacity: 0.5 }}>{'- '}</span>
        <HighlightInline text={line.slice(2)} />
      </span>
    );
  }

  if (line === '') return <span>{'\u200B'}</span>;

  return <HighlightInline text={line} />;
}

function HighlightInline({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/^\*\*(.+?)\*\*/);
    if (boldMatch) {
      parts.push(
        <span key={`b${key++}`} style={{ color: 'var(--slide-text)', fontWeight: 600 }}>
          <span style={{ opacity: 0.4 }}>**</span>
          {boldMatch[1]}
          <span style={{ opacity: 0.4 }}>**</span>
        </span>,
      );
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    const italicMatch = remaining.match(/^\*(.+?)\*/);
    if (italicMatch) {
      parts.push(
        <span key={`i${key++}`} style={{ color: 'var(--slide-text)', fontStyle: 'italic' }}>
          <span style={{ opacity: 0.4 }}>*</span>
          {italicMatch[1]}
          <span style={{ opacity: 0.4 }}>*</span>
        </span>,
      );
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    const codeMatch = remaining.match(/^`(.+?)`/);
    if (codeMatch) {
      parts.push(
        <span
          key={`c${key++}`}
          className="rounded px-1"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--slide-accent) 10%, transparent)',
            color: 'var(--slide-accent)',
          }}
        >
          `{codeMatch[1]}`
        </span>,
      );
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    const wikiMatch = remaining.match(/^\[\[(.+?)\]\]/);
    if (wikiMatch) {
      parts.push(
        <span key={`w${key++}`} style={{ color: 'var(--slide-accent)' }}>
          [[{wikiMatch[1]}]]
        </span>,
      );
      remaining = remaining.slice(wikiMatch[0].length);
      continue;
    }

    const nextSpecial = remaining.search(/\*\*|\*|`|\[\[/);
    if (nextSpecial === -1) {
      parts.push(
        <span key={`t${key++}`} style={{ color: 'var(--slide-text)', opacity: 0.85 }}>
          {remaining}
        </span>,
      );
      break;
    }
    parts.push(
      <span key={`t${key++}`} style={{ color: 'var(--slide-text)', opacity: 0.85 }}>
        {remaining.slice(0, nextSpecial)}
      </span>,
    );
    remaining = remaining.slice(nextSpecial);
  }

  return <>{parts}</>;
}

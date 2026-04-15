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
  const [mode, setMode] = useState<'visual' | 'markdown'>('visual');

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

        <div
          className="overflow-hidden rounded-xl shadow-2xl"
          style={{
            border: '1px solid var(--slide-border)',
            backgroundColor: 'var(--slide-bg-elevated)',
          }}
        >
          {/* Title bar */}
          <div
            className="flex items-center gap-2 border-b px-4 py-2.5"
            style={{ borderColor: 'var(--slide-border)' }}
          >
            <div className="flex gap-1.5">
              <div className="size-3 rounded-full bg-[#ff5f57]" />
              <div className="size-3 rounded-full bg-[#febc2e]" />
              <div className="size-3 rounded-full bg-[#28c840]" />
            </div>
            <span className="ml-2 text-xs text-[var(--slide-muted)]">
              open-knowledge — getting-started.md
            </span>
          </div>

          {/* Toolbar */}
          <div
            className="flex items-center justify-between border-b px-4 py-2"
            style={{ borderColor: 'var(--slide-border)' }}
          >
            <div className="flex items-center gap-1">
              <ModeToggle mode={mode} onChange={setMode} />
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <div className="size-5 rounded-full bg-[var(--slide-accent)] text-center text-[9px] leading-5 font-bold text-white">
                  Y
                </div>
                <div className="size-5 rounded-full bg-emerald-500 text-center text-[9px] leading-5 font-bold text-white">
                  AI
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="size-1.5 rounded-full bg-emerald-500" />
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400">Live</span>
              </div>
            </div>
          </div>

          {/* Content area */}
          <div className="relative h-[420px] overflow-hidden sm:h-[480px]">
            <div
              className="absolute inset-0 overflow-y-auto transition-all duration-400 ease-out"
              style={{
                opacity: mode === 'visual' ? 1 : 0,
                transform: mode === 'visual' ? 'translateX(0)' : 'translateX(-20px)',
                pointerEvents: mode === 'visual' ? 'auto' : 'none',
              }}
            >
              <VisualView />
            </div>
            <div
              className="absolute inset-0 overflow-y-auto transition-all duration-400 ease-out"
              style={{
                opacity: mode === 'markdown' ? 1 : 0,
                transform: mode === 'markdown' ? 'translateX(0)' : 'translateX(20px)',
                pointerEvents: mode === 'markdown' ? 'auto' : 'none',
              }}
            >
              <MarkdownView content={DEMO_MARKDOWN} />
            </div>
            {/* Bottom fade */}
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

function ModeToggle({
  mode,
  onChange,
}: {
  mode: 'visual' | 'markdown';
  onChange: (mode: 'visual' | 'markdown') => void;
}) {
  return (
    <div
      className="relative flex rounded-md p-0.5"
      style={{ backgroundColor: 'color-mix(in srgb, var(--slide-text) 6%, transparent)' }}
    >
      <div
        className="absolute top-0.5 bottom-0.5 rounded transition-all duration-300 ease-out"
        style={{
          backgroundColor: 'var(--slide-bg-elevated)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          width: 'calc(50% - 2px)',
          left: mode === 'visual' ? '2px' : 'calc(50%)',
        }}
      />
      <button
        type="button"
        onClick={() => onChange('visual')}
        className="relative z-10 flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition-colors duration-200"
        style={{
          color: mode === 'visual' ? 'var(--slide-text)' : 'var(--slide-muted)',
        }}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          role="img"
          aria-label="Visual mode"
        >
          <path d="M12 20h9" />
          <path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z" />
        </svg>
        Visual
      </button>
      <button
        type="button"
        onClick={() => onChange('markdown')}
        className="relative z-10 flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition-colors duration-200"
        style={{
          color: mode === 'markdown' ? 'var(--slide-text)' : 'var(--slide-muted)',
        }}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          role="img"
          aria-label="Markdown mode"
        >
          <path d="m18 16 4-4-4-4" />
          <path d="m6 8-4 4 4 4" />
          <path d="m14.5 4-5 16" />
        </svg>
        Markdown
      </button>
    </div>
  );
}

function VisualView() {
  return (
    <div className="wysiwyg-demo overflow-y-auto p-6 sm:p-8 md:p-10">
      <h1
        className="mb-5 text-2xl font-semibold tracking-tight sm:text-3xl"
        style={{ color: 'var(--slide-text)' }}
      >
        Getting Started with Open Knowledge
      </h1>

      <p
        className="mb-5 text-[15px] leading-relaxed"
        style={{ color: 'var(--slide-text)', opacity: 0.85 }}
      >
        Open Knowledge is an{' '}
        <strong className="font-semibold" style={{ color: 'var(--slide-text)' }}>
          agent-native knowledge platform
        </strong>{' '}
        where humans and AI collaborate in real time.
      </p>

      <h2
        className="mb-4 mt-8 text-xl font-semibold tracking-tight"
        style={{ color: 'var(--slide-text)' }}
      >
        Quick Setup
      </h2>

      <p
        className="mb-4 text-[15px] leading-relaxed"
        style={{ color: 'var(--slide-text)', opacity: 0.85 }}
      >
        Run a single command to start:
      </p>

      <div
        className="mb-5 overflow-hidden rounded-lg"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--slide-text) 5%, transparent)',
          border: '1px solid var(--slide-border)',
        }}
      >
        <div
          className="flex items-center gap-2 px-4 py-2 text-[11px]"
          style={{
            borderBottom: '1px solid var(--slide-border)',
            color: 'var(--slide-muted)',
          }}
        >
          bash
        </div>
        <pre className="overflow-x-auto p-4">
          <code className="text-[13px]" style={{ color: 'var(--slide-text)', opacity: 0.9 }}>
            npx @inkeep/open-knowledge
          </code>
        </pre>
      </div>

      <p
        className="mb-5 text-[15px] leading-relaxed"
        style={{ color: 'var(--slide-text)', opacity: 0.85 }}
      >
        This starts the server, editor, and MCP endpoint. Your current directory becomes the content
        root — every{' '}
        <code
          className="rounded px-1.5 py-0.5 text-[13px]"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--slide-text) 7%, transparent)',
            color: 'var(--slide-accent)',
          }}
        >
          .md
        </code>{' '}
        file is instantly available.
      </p>

      <h2
        className="mb-4 mt-8 text-xl font-semibold tracking-tight"
        style={{ color: 'var(--slide-text)' }}
      >
        Key Concepts
      </h2>

      <ul className="mb-5 space-y-2 pl-6" style={{ color: 'var(--slide-text)', opacity: 0.85 }}>
        <li className="list-disc text-[15px] leading-relaxed">
          <strong className="font-semibold" style={{ color: 'var(--slide-text)' }}>
            CRDT collaboration
          </strong>{' '}
          — multiple writers never conflict
        </li>
        <li className="list-disc text-[15px] leading-relaxed">
          <span
            className="rounded px-1 py-0.5 text-[14px] font-medium"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--slide-accent) 10%, transparent)',
              color: 'var(--slide-accent)',
            }}
          >
            [[Wiki Links]]
          </span>{' '}
          — connect ideas across pages
        </li>
        <li className="list-disc text-[15px] leading-relaxed">
          <strong className="font-semibold" style={{ color: 'var(--slide-text)' }}>
            Shadow git
          </strong>{' '}
          — every edit is attributed to its author
        </li>
        <li className="list-disc text-[15px] leading-relaxed">
          Connect any MCP-compatible agent: <em>Claude</em>, <em>Cursor</em>, <em>Codex</em>
        </li>
      </ul>

      <div
        className="rounded-lg p-4"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--slide-accent) 5%, transparent)',
          borderLeft: '3px solid var(--slide-accent)',
        }}
      >
        <p
          className="text-[15px] leading-relaxed"
          style={{ color: 'var(--slide-text)', opacity: 0.85 }}
        >
          Open Knowledge stores everything as plain markdown files. No database, no lock-in — just
          files in a folder you already own.
        </p>
      </div>
    </div>
  );
}

function MarkdownView({ content }: { content: string }) {
  return (
    <div className="overflow-y-auto p-6 sm:p-8 md:p-10">
      <div className="relative">
        <LineNumbers content={content} />
        <pre className="overflow-x-auto pl-12">
          <code className="text-[13px] leading-[1.7]">
            <HighlightedMarkdown content={content} />
          </code>
        </pre>
      </div>
    </div>
  );
}

function lineKey(line: string, n: number) {
  return `${n}:${line.length}:${line.charCodeAt(0) || 0}`;
}

function LineNumbers({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <div
      className="absolute top-0 left-0 select-none text-right text-[13px] leading-[1.7]"
      style={{ color: 'var(--slide-muted)', opacity: 0.4, width: '2rem' }}
      aria-hidden="true"
    >
      {lines.map((line, n) => (
        <div key={lineKey(line, n + 1)}>{n + 1}</div>
      ))}
    </div>
  );
}

function HighlightedMarkdown({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <>
      {lines.map((line, n) => (
        <div key={lineKey(line, n + 1)}>
          <HighlightedLine line={line} />
        </div>
      ))}
    </>
  );
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
        <span key={key++} style={{ color: 'var(--slide-text)', fontWeight: 600 }}>
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
        <span key={key++} style={{ color: 'var(--slide-text)', fontStyle: 'italic' }}>
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
          key={key++}
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
        <span key={key++} style={{ color: 'var(--slide-accent)' }}>
          [[{wikiMatch[1]}]]
        </span>,
      );
      remaining = remaining.slice(wikiMatch[0].length);
      continue;
    }

    const nextSpecial = remaining.search(/\*\*|\*|`|\[\[/);
    if (nextSpecial === -1) {
      parts.push(
        <span key={key++} style={{ color: 'var(--slide-text)', opacity: 0.85 }}>
          {remaining}
        </span>,
      );
      break;
    }
    parts.push(
      <span key={key++} style={{ color: 'var(--slide-text)', opacity: 0.85 }}>
        {remaining.slice(0, nextSpecial)}
      </span>,
    );
    remaining = remaining.slice(nextSpecial);
  }

  return <>{parts}</>;
}

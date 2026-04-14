'use client';

import { BrainCircuitIcon, GitBranchIcon, type LucideIcon, PenToolIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface ShowcaseItem {
  icon: LucideIcon;
  badge: string;
  title: string;
  description: string;
  visual: React.ReactNode;
}

const items: ShowcaseItem[] = [
  {
    icon: PenToolIcon,
    badge: 'Rich Editing',
    title: 'Write with a rich editor\nthat feels like home',
    description:
      'A polished WYSIWYG editor with source mode toggle. Headings, tables, code blocks, callouts — everything you expect, powered by TipTap and CodeMirror.',
    visual: <EditorVisual />,
  },
  {
    icon: BrainCircuitIcon,
    badge: 'AI Co-authoring',
    title: 'Watch AI write\nalongside you in real time',
    description:
      'Any AI agent connects via MCP and writes into the same document. You see their cursor, their edits, and can undo them — just like a human collaborator.',
    visual: <CollabVisual />,
  },
  {
    icon: GitBranchIcon,
    badge: 'Git-Native',
    title: 'Plain markdown files,\nversioned in git',
    description:
      'No proprietary database. Every page is a .md file in your repo. Branch, diff, merge, and review knowledge changes like code.',
    visual: <GitVisual />,
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
    <section className="border-t border-[var(--slide-border)] bg-[var(--slide-bg)] px-6">
      <div ref={containerRef} className="mx-auto max-w-6xl">
        <div className="relative md:grid md:grid-cols-2 md:gap-12 lg:gap-20">
          {/* Left: scrolling text */}
          <div className="py-24 md:py-32">
            {items.map((item, i) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.badge}
                  ref={(el) => {
                    sectionRefs.current[i] = el;
                  }}
                  className="flex min-h-[70vh] flex-col justify-center py-12 first:pt-0 last:pb-0"
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="size-4 text-[var(--slide-accent)]" strokeWidth={2} />
                    <span className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--slide-accent)]">
                      {item.badge}
                    </span>
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
            <div className="sticky top-28 py-32">
              <div className="relative aspect-[4/3] w-full overflow-hidden">
                {items.map((item, i) => (
                  <div
                    key={item.badge}
                    className="absolute inset-0 transition-all duration-500 ease-out"
                    style={{
                      opacity: activeIndex === i ? 1 : 0,
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
              <div key={`mobile-${item.badge}`} className="mb-16 aspect-[4/3]">
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

function EditorVisual() {
  return (
    <MockBrowserChrome title="open-knowledge — Getting Started">
      <div className="space-y-3">
        <div className="flex items-center gap-2 border-b border-[var(--slide-border)] pb-2">
          <div className="rounded bg-[var(--slide-accent)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--slide-accent)]">
            WYSIWYG
          </div>
          <div className="rounded px-2 py-0.5 text-[10px] text-[var(--slide-muted)]">Source</div>
        </div>
        <div className="space-y-2.5">
          <div
            className="h-5 w-3/5 rounded"
            style={{ backgroundColor: 'var(--slide-text)', opacity: 0.12 }}
          />
          <div className="space-y-1.5">
            <div
              className="h-3 w-full rounded"
              style={{ backgroundColor: 'var(--slide-text)', opacity: 0.06 }}
            />
            <div
              className="h-3 w-11/12 rounded"
              style={{ backgroundColor: 'var(--slide-text)', opacity: 0.06 }}
            />
            <div
              className="h-3 w-4/5 rounded"
              style={{ backgroundColor: 'var(--slide-text)', opacity: 0.06 }}
            />
          </div>
          <div
            className="rounded-md p-2.5"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--slide-accent) 6%, transparent)',
              borderLeft: '3px solid var(--slide-accent)',
            }}
          >
            <div
              className="mb-1.5 h-3 w-16 rounded"
              style={{ backgroundColor: 'var(--slide-accent)', opacity: 0.3 }}
            />
            <div
              className="h-2.5 w-4/5 rounded"
              style={{ backgroundColor: 'var(--slide-text)', opacity: 0.06 }}
            />
            <div
              className="mt-1 h-2.5 w-3/5 rounded"
              style={{ backgroundColor: 'var(--slide-text)', opacity: 0.06 }}
            />
          </div>
          <div className="space-y-1.5">
            <div
              className="h-3 w-full rounded"
              style={{ backgroundColor: 'var(--slide-text)', opacity: 0.06 }}
            />
            <div
              className="h-3 w-3/4 rounded"
              style={{ backgroundColor: 'var(--slide-text)', opacity: 0.06 }}
            />
          </div>
          <div
            className="overflow-hidden rounded-md"
            style={{
              border: '1px solid var(--slide-border)',
            }}
          >
            <div
              className="px-2.5 py-1.5"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--slide-text) 4%, transparent)',
                borderBottom: '1px solid var(--slide-border)',
              }}
            >
              <div
                className="h-2 w-12 rounded"
                style={{ backgroundColor: 'var(--slide-accent)', opacity: 0.4 }}
              />
            </div>
            <div className="space-y-1 p-2.5">
              <div
                className="h-2.5 w-11/12 rounded font-mono"
                style={{ backgroundColor: 'var(--slide-text)', opacity: 0.06 }}
              />
              <div
                className="h-2.5 w-4/5 rounded"
                style={{ backgroundColor: 'var(--slide-text)', opacity: 0.06 }}
              />
              <div
                className="h-2.5 w-3/5 rounded"
                style={{ backgroundColor: 'var(--slide-text)', opacity: 0.06 }}
              />
            </div>
          </div>
        </div>
      </div>
    </MockBrowserChrome>
  );
}

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

function GitVisual() {
  return (
    <MockBrowserChrome title="terminal — git log">
      <div className="space-y-2.5 font-mono text-[11px] leading-relaxed">
        <div className="flex items-center gap-2 border-b border-[var(--slide-border)] pb-2">
          <span className="text-[var(--slide-muted)]">$</span>
          <span className="text-[var(--slide-text)]">git log --oneline content/</span>
        </div>
        <div className="space-y-2">
          {[
            {
              hash: 'a3f8c2d',
              msg: 'agent: expand API reference section',
              color: '#10b981',
            },
            {
              hash: 'e1b4a09',
              msg: 'docs: fix typo in getting started',
              color: 'var(--slide-accent)',
            },
            {
              hash: '7d2f1c5',
              msg: 'agent: add troubleshooting guide',
              color: '#10b981',
            },
            {
              hash: 'b9e3d47',
              msg: 'docs: restructure navigation',
              color: 'var(--slide-accent)',
            },
            {
              hash: 'f6a0c81',
              msg: 'agent: cross-link related pages',
              color: '#10b981',
            },
          ].map((commit) => (
            <div key={commit.hash} className="flex items-start gap-2">
              <span className="shrink-0 font-bold" style={{ color: commit.color }}>
                {commit.hash}
              </span>
              <span className="text-[var(--slide-text)]">{commit.msg}</span>
            </div>
          ))}
        </div>
        <div
          className="mt-3 rounded-md p-2.5"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--slide-text) 4%, transparent)',
            border: '1px solid var(--slide-border)',
          }}
        >
          <div className="mb-1.5 text-[10px] text-[var(--slide-muted)]">
            content/getting-started.md
          </div>
          <div className="space-y-0.5">
            <div className="text-[var(--slide-muted)]">{'  '}## Quick Start</div>
            <div className="text-emerald-600 dark:text-emerald-400">
              + Run `npx @inkeep/open-knowledge`
            </div>
            <div className="text-emerald-600 dark:text-emerald-400">
              + to start the server and editor.
            </div>
            <div className="text-red-500">- Run the CLI to get started.</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <div className="size-2 rounded-full bg-emerald-500" />
            <span className="text-[10px] text-[var(--slide-muted)]">3 agent</span>
          </div>
          <div className="flex items-center gap-1">
            <div
              className="size-2 rounded-full"
              style={{ backgroundColor: 'var(--slide-accent)' }}
            />
            <span className="text-[10px] text-[var(--slide-muted)]">2 human</span>
          </div>
        </div>
      </div>
    </MockBrowserChrome>
  );
}

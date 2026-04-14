'use client';

import type { LucideIcon } from 'lucide-react';
import { BrainCircuitIcon, PenToolIcon, TerminalIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

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
    title: 'Run one command\nto start the server',
    description:
      'No config files, no setup wizard. A single npx command starts the server, editor, and MCP endpoint. Your current directory becomes the content root.',
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
    <section className="border-t border-[var(--slide-border)] bg-[var(--slide-bg)] px-6">
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
              <div className="relative aspect-[4/3] w-full overflow-hidden">
                {items.map((item, i) => (
                  <div
                    key={item.step}
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
          <div className="text-[var(--slide-muted)]">Scaffolding .open-knowledge/ ...</div>
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
          <div>Shadow repo initialized at .git/openknowledge/</div>
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

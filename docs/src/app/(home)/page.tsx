import {
  ArrowRightIcon,
  BrainCircuitIcon,
  GitBranchIcon,
  LayersIcon,
  PenToolIcon,
  ZapIcon,
} from 'lucide-react';
import Link from 'next/link';
import { EditorDemo } from './editor-demo';
import { StickyShowcase } from './sticky-showcase';

export default function HomePage() {
  return (
    <main className="font-[family-name:var(--font-dm-sans)] selection:bg-[var(--slide-accent)]/20">
      <Hero />
      <EditorDemo />
      <StickyShowcase />
      <HowItWorks />
      <Inspiration />
      <CTA />
      <SiteFooter />
    </main>
  );
}

function Hero() {
  return (
    <section className="relative bg-[var(--slide-bg)] px-6 pt-32 pb-28 md:pt-44 md:pb-36">
      <div
        className="pointer-events-none absolute top-20 right-8 z-10 size-12 rounded-full md:top-24 md:right-16 md:size-16"
        style={{ background: 'var(--slide-accent)' }}
      />

      <div className="mx-auto max-w-5xl">
        <p className="mb-8 text-sm font-medium italic text-[var(--slide-accent)]">
          Now open source
        </p>

        <h1 className="max-w-4xl text-4xl font-light tracking-tight text-[var(--slide-text)] sm:text-5xl lg:text-[4.25rem] lg:leading-[1.1]">
          Your knowledge, co-authored{' '}
          <span className="relative inline-block">
            by AI in real time
            <svg
              className="absolute -bottom-2 left-0 h-3 w-full"
              viewBox="0 0 286 14"
              fill="none"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path
                d="M3 11C45 3.5 91.5 1.5 143 5.5C194.5 9.5 241 7 283 3"
                stroke="var(--slide-accent)"
                strokeWidth="5"
                strokeLinecap="round"
              />
            </svg>
          </span>
        </h1>

        <p className="mt-8 max-w-xl text-lg leading-relaxed text-[var(--slide-muted)]">
          An agent-native knowledge platform where humans and AI co-create. VS Code meets Notion —
          connected to any AI agent via MCP.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Link
            href="/docs"
            className="slide-btn-accent inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-medium transition-opacity"
          >
            Get Started
            <ArrowRightIcon className="size-4" />
          </Link>
          <Link
            target="_blank"
            href="https://github.com/inkeep/open-knowledge"
            className="slide-btn-outline inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-medium transition-colors"
          >
            <GitBranchIcon className="size-4" />
            View on GitHub
          </Link>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      step: '01',
      title: 'You write',
      description:
        'Take notes in a rich WYSIWYG editor or raw markdown. Real-time CRDT sync means your cursor never fights the AI.',
      icon: PenToolIcon,
    },
    {
      step: '02',
      title: 'AI co-authors',
      description:
        'An AI agent writes alongside you — expanding ideas, adding references, structuring content — all visible in real time.',
      icon: BrainCircuitIcon,
    },
    {
      step: '03',
      title: 'Knowledge compiles',
      description:
        'A background agent continuously organizes your notes into a structured wiki — categorized, cross-linked, and always current.',
      icon: LayersIcon,
    },
    {
      step: '04',
      title: 'Query & grow',
      description:
        'Ask complex questions against your knowledge base. Answers get filed back, so every query makes the wiki smarter.',
      icon: ZapIcon,
    },
  ];

  return (
    <section className="border-t border-[var(--slide-border)] bg-[var(--slide-bg)] px-6 py-24 md:py-32">
      <div className="mx-auto max-w-5xl">
        <p className="mb-3 text-sm font-medium uppercase tracking-[0.2em] text-[var(--slide-accent)]">
          How it works
        </p>
        <h2 className="text-3xl font-light tracking-tight text-[var(--slide-text)] sm:text-4xl">
          From raw notes to structured knowledge
        </h2>
        <p className="mt-4 max-w-2xl text-[var(--slide-muted)]">
          Inspired by Andrej Karpathy&apos;s viral{' '}
          <a
            className="text-[var(--slide-accent)]"
            href="https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f"
          >
            LLM knowledge base workflow
          </a>{' '}
          — automated, real-time, and built for the way you actually think.
        </p>

        <div className="mt-16 grid gap-12 md:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          {steps.map(({ step, title, description, icon: Icon }) => (
            <div key={step}>
              <div className="mb-5 flex items-center gap-3">
                <Icon className="size-6 text-[var(--slide-accent)]" strokeWidth={1.5} />
                <span className="font-mono text-xs text-[var(--slide-muted)]">{step}</span>
              </div>
              <h3 className="text-lg font-medium text-[var(--slide-text)]">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--slide-muted)]">
                {description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Inspiration() {
  return (
    <section className="border-t border-[var(--slide-border)] bg-[var(--slide-bg)] px-6 py-24 md:py-32">
      <div className="mx-auto max-w-3xl">
        <blockquote>
          <p className="text-xl leading-relaxed font-light text-[var(--slide-text)] md:text-2xl">
            &ldquo;You rarely ever write or edit the wiki manually, it&apos;s the domain of the LLM.
            I think there is room here for{' '}
            <span className="font-medium text-[var(--slide-accent)]">
              an incredible new product
            </span>{' '}
            instead of a hacky collection of scripts.&rdquo;
          </p>
          <footer className="mt-8 flex items-center gap-3">
            <div
              className="flex size-10 items-center justify-center rounded-full text-sm font-bold"
              style={{ backgroundColor: 'var(--slide-border)', color: 'var(--slide-muted)' }}
            >
              AK
            </div>
            <div>
              <div className="font-medium text-[var(--slide-text)]">Andrej Karpathy</div>
              <Link
                href="https://x.com/karpathy/status/2039805659525644595"
                className="text-sm text-[var(--slide-muted)] transition-colors hover:text-[var(--slide-accent)]"
              >
                on LLM Knowledge Bases
              </Link>
            </div>
          </footer>
        </blockquote>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="bg-[var(--slide-bg)] px-6 py-24 md:py-32">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-3xl font-light tracking-tight text-[var(--slide-text)] sm:text-4xl">
          Start building your{' '}
          <span className="relative inline-block">
            knowledge base
            <svg
              className="absolute -bottom-1 left-0 w-full"
              viewBox="0 0 220 10"
              fill="none"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path
                d="M2 7C35 2 80 8 110 4C140 0 185 6 218 3"
                stroke="var(--slide-accent)"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
          </span>
        </h2>
        <p className="mx-auto mt-6 max-w-lg text-[var(--slide-muted)]">
          One command to get started. Connect your favorite AI agent and let the knowledge compile
          itself.
        </p>
        <div className="mt-10">
          <Link
            href="/docs"
            className="slide-btn-accent inline-flex items-center gap-2 rounded-lg px-8 py-3.5 text-sm font-medium transition-opacity"
          >
            Get Started
            <ArrowRightIcon className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-[var(--slide-border)] bg-[var(--slide-bg)] px-6 py-10">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-6 sm:flex-row">
        <div className="flex items-center gap-6 text-sm text-[var(--slide-muted)]">
          <Link href="/docs" className="transition-colors hover:text-[var(--slide-text)]">
            Docs
          </Link>
          <Link
            href="https://github.com/inkeep/open-knowledge"
            className="transition-colors hover:text-[var(--slide-text)]"
          >
            GitHub
          </Link>
        </div>
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-[var(--slide-muted)]">
          2026 Inkeep. Agents you can trust.
        </p>
      </div>
    </footer>
  );
}

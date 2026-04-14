import {
  ArrowRightIcon,
  BookOpenIcon,
  BrainCircuitIcon,
  GitBranchIcon,
  LayersIcon,
  PenToolIcon,
  TerminalIcon,
  WrenchIcon,
  ZapIcon,
} from 'lucide-react';
import Link from 'next/link';

export default function HomePage() {
  return (
    <main>
      <Hero />
      <LogoCloud />
      <HowItWorks />
      <Features />
      <Inspiration />
      <OpenSource />
      <CTA />
      <Footer />
    </main>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-fd-border">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-fd-background via-fd-background to-fd-background/80" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-[600px] w-[900px] rounded-full bg-fd-primary/5 blur-3xl" />
        <div className="absolute top-40 right-0 h-[300px] w-[400px] rounded-full bg-fd-primary/3 blur-3xl" />
      </div>

      <div className="mx-auto max-w-6xl px-6 pt-32 pb-20 text-center md:pt-44 md:pb-28">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-fd-border bg-fd-muted/50 px-4 py-1.5 text-sm text-fd-muted-foreground">
          <span className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          </span>
          Now open source
        </div>

        <h1 className="mx-auto max-w-4xl text-4xl font-bold tracking-tight text-fd-foreground sm:text-6xl lg:text-7xl">
          Your knowledge, co-authored{' '}
          <span className="bg-gradient-to-r from-fd-primary to-fd-primary/60 bg-clip-text text-transparent">
            by AI in real time
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-lg text-fd-muted-foreground md:text-xl">
          An agent-native knowledge platform where humans and AI co-create. Rich editing, markdown
          in git, real-time CRDT collaboration — connected to any AI agent via MCP.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/docs"
            className="inline-flex items-center gap-2 rounded-lg bg-fd-primary px-6 py-3 text-sm font-medium text-fd-primary-foreground shadow-lg shadow-fd-primary/25 transition-all hover:brightness-110"
          >
            Get Started
            <ArrowRightIcon className="size-4" />
          </Link>
          <Link
            href="https://github.com/inkeep/open-knowledge"
            className="inline-flex items-center gap-2 rounded-lg border border-fd-border bg-fd-card px-6 py-3 text-sm font-medium text-fd-foreground transition-colors hover:bg-fd-accent"
          >
            <GitBranchIcon className="size-4" />
            View on GitHub
          </Link>
        </div>

        <div className="mx-auto mt-12 max-w-xl rounded-xl border border-fd-border bg-fd-card/80 p-4 backdrop-blur">
          <div className="mb-3 flex items-center gap-2 border-b border-fd-border pb-3">
            <div className="flex gap-1.5">
              <div className="size-3 rounded-full bg-red-500/80" />
              <div className="size-3 rounded-full bg-yellow-500/80" />
              <div className="size-3 rounded-full bg-green-500/80" />
            </div>
            <span className="font-mono text-xs text-fd-muted-foreground">terminal</span>
          </div>
          <pre className="text-left text-sm leading-relaxed">
            <code>
              <span className="text-fd-muted-foreground">$</span>{' '}
              <span className="text-fd-foreground">npx @inkeep/open-knowledge</span>
              {'\n'}
              <span className="text-emerald-500">
                {'>'} Server running at http://localhost:5173
              </span>
              {'\n'}
              <span className="text-emerald-500">{'>'} MCP server ready for agent connections</span>
              {'\n'}
              <span className="text-fd-muted-foreground">
                {'>'} Watching ./content for changes...
              </span>
            </code>
          </pre>
        </div>
      </div>
    </section>
  );
}

function LogoCloud() {
  const techs = ['TipTap', 'Yjs', 'ProseMirror', 'CodeMirror', 'Hocuspocus', 'MCP'];
  return (
    <section className="border-b border-fd-border py-10">
      <p className="mb-6 text-center text-xs font-medium uppercase tracking-widest text-fd-muted-foreground">
        Built on
      </p>
      <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 px-6">
        {techs.map((t) => (
          <span key={t} className="text-sm font-medium text-fd-muted-foreground/80">
            {t}
          </span>
        ))}
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
    <section className="py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <p className="mb-3 text-sm font-medium uppercase tracking-widest text-fd-primary">
          How it works
        </p>
        <h2 className="text-3xl font-bold tracking-tight text-fd-foreground sm:text-4xl">
          From raw notes to structured knowledge
        </h2>
        <p className="mt-4 max-w-2xl text-fd-muted-foreground">
          Inspired by Andrej Karpathy&apos;s viral LLM knowledge base workflow — automated,
          real-time, and built for the way you actually think.
        </p>

        <div className="mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {steps.map(({ step, title, description, icon: Icon }) => (
            <div key={step} className="group relative">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-fd-primary/10 text-fd-primary transition-colors group-hover:bg-fd-primary group-hover:text-fd-primary-foreground">
                  <Icon className="size-5" />
                </div>
                <span className="font-mono text-xs text-fd-muted-foreground">{step}</span>
              </div>
              <h3 className="text-lg font-semibold text-fd-foreground">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-fd-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Features() {
  const features = [
    {
      icon: PenToolIcon,
      title: 'Rich editing',
      description:
        'Obsidian-grade WYSIWYG with a source mode toggle. TipTap + CodeMirror, not a terminal text editor.',
    },
    {
      icon: GitBranchIcon,
      title: 'Markdown in git',
      description:
        'Plain .md files are the canonical source of truth. Branch, diff, merge — your knowledge is just files.',
    },
    {
      icon: BrainCircuitIcon,
      title: 'Agent-agnostic',
      description:
        'No LLM baked in. Any AI agent — Claude, Cursor, Codex — connects via MCP tools to read, write, and search.',
    },
    {
      icon: ZapIcon,
      title: 'Real-time CRDT',
      description:
        'Yjs-powered conflict-free editing. Human and AI cursors coexist without stepping on each other.',
    },
    {
      icon: TerminalIcon,
      title: 'One command',
      description:
        'npx @inkeep/open-knowledge — starts the server, editor, and MCP endpoint. No config required.',
    },
    {
      icon: WrenchIcon,
      title: 'Extensible',
      description:
        'Shadow git for attribution, undo/redo per agent, rescue buffers, reconciliation — built for serious knowledge work.',
    },
  ];

  return (
    <section className="border-t border-fd-border bg-fd-muted/30 py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center">
          <p className="mb-3 text-sm font-medium uppercase tracking-widest text-fd-primary">
            Features
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-fd-foreground sm:text-4xl">
            Everything you need for AI-native knowledge
          </h2>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="group rounded-xl border border-fd-border bg-fd-card p-6 transition-all hover:border-fd-primary/30 hover:shadow-lg hover:shadow-fd-primary/5"
            >
              <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-fd-primary/10 text-fd-primary">
                <Icon className="size-5" />
              </div>
              <h3 className="text-base font-semibold text-fd-foreground">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-fd-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Inspiration() {
  return (
    <section className="py-24 md:py-32">
      <div className="mx-auto max-w-4xl px-6">
        <div className="relative rounded-2xl border border-fd-border bg-fd-card p-8 md:p-12">
          <div className="absolute -top-4 left-8 rounded-full border border-fd-border bg-fd-background px-4 py-1 text-sm font-medium text-fd-primary">
            Inspiration
          </div>
          <blockquote className="mt-2">
            <p className="text-lg leading-relaxed text-fd-foreground md:text-xl">
              &ldquo;A significant fraction of my recent token throughput is going less into
              manipulating code, and more into manipulating knowledge. I think there is room here
              for <span className="font-medium text-fd-primary">an incredible new product</span>{' '}
              instead of a hacky collection of scripts.&rdquo;
            </p>
            <footer className="mt-6 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-fd-muted text-sm font-bold text-fd-muted-foreground">
                AK
              </div>
              <div>
                <div className="font-medium text-fd-foreground">Andrej Karpathy</div>
                <Link
                  href="https://x.com/karpathy/status/2039805659525644595"
                  className="text-sm text-fd-muted-foreground transition-colors hover:text-fd-primary"
                >
                  on LLM Knowledge Bases
                </Link>
              </div>
            </footer>
          </blockquote>
        </div>
      </div>
    </section>
  );
}

function OpenSource() {
  return (
    <section className="border-t border-fd-border bg-fd-muted/30 py-24 md:py-32">
      <div className="mx-auto max-w-4xl px-6 text-center">
        <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-2xl bg-fd-primary/10">
          <BookOpenIcon className="size-7 text-fd-primary" />
        </div>
        <h2 className="text-3xl font-bold tracking-tight text-fd-foreground sm:text-4xl">
          Open source, open knowledge
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-fd-muted-foreground">
          The entire platform is MIT-licensed. Your knowledge lives as markdown files in git — no
          vendor lock-in, no proprietary formats, no black boxes.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="https://github.com/inkeep/open-knowledge"
            className="inline-flex items-center gap-2 rounded-lg border border-fd-border bg-fd-card px-6 py-3 text-sm font-medium text-fd-foreground transition-colors hover:bg-fd-accent"
          >
            <GitBranchIcon className="size-4" />
            Star on GitHub
          </Link>
          <Link
            href="/docs"
            className="inline-flex items-center gap-2 text-sm font-medium text-fd-primary transition-colors hover:text-fd-primary/80"
          >
            Read the docs
            <ArrowRightIcon className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="py-24 md:py-32">
      <div className="mx-auto max-w-4xl px-6 text-center">
        <h2 className="text-3xl font-bold tracking-tight text-fd-foreground sm:text-4xl">
          Start building your knowledge base
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-fd-muted-foreground">
          One command to get started. Connect your favorite AI agent and let the knowledge compile
          itself.
        </p>
        <div className="mx-auto mt-8 max-w-md rounded-xl border border-fd-border bg-fd-card p-4">
          <pre className="text-left text-sm">
            <code>
              <span className="text-fd-muted-foreground">$</span>{' '}
              <span className="text-fd-foreground">npx @inkeep/open-knowledge</span>
            </code>
          </pre>
        </div>
        <div className="mt-8">
          <Link
            href="/docs"
            className="inline-flex items-center gap-2 rounded-lg bg-fd-primary px-8 py-3.5 text-sm font-medium text-fd-primary-foreground shadow-lg shadow-fd-primary/25 transition-all hover:brightness-110"
          >
            Get Started
            <ArrowRightIcon className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-fd-border py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
        <div className="flex items-center gap-2 text-sm text-fd-muted-foreground">
          <BookOpenIcon className="size-4" />
          <span>
            Open Knowledge by{' '}
            <Link href="https://inkeep.com" className="transition-colors hover:text-fd-foreground">
              Inkeep
            </Link>
          </span>
        </div>
        <div className="flex items-center gap-6 text-sm text-fd-muted-foreground">
          <Link href="/docs" className="transition-colors hover:text-fd-foreground">
            Docs
          </Link>
          <Link
            href="https://github.com/inkeep/open-knowledge"
            className="transition-colors hover:text-fd-foreground"
          >
            GitHub
          </Link>
        </div>
      </div>
    </footer>
  );
}

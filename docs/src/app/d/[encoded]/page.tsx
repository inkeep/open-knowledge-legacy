import { ArrowRightIcon, DownloadIcon, ExternalLinkIcon, GitBranchIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { buildSplashViewModel, SPLASH_DOWNLOAD_URL } from '@/lib/share-splash';
import { SplashCtaCluster } from './splash-cta-cluster';

export const dynamic = 'force-static';

interface SplashPageProps {
  params: Promise<{ encoded: string }>;
}

export async function generateMetadata({ params }: SplashPageProps): Promise<Metadata> {
  const { encoded } = await params;
  const view = buildSplashViewModel(encoded);

  if (view.kind !== 'ok') {
    return {
      title: 'Open Knowledge',
      description: 'Open in Open Knowledge.',
    };
  }

  return {
    title: `${view.filename} · Open Knowledge`,
    description: 'Open in Open Knowledge.',
    openGraph: {
      title: view.filename,
      description: 'Open in Open Knowledge.',
      url: `https://openknowledge.ai/d/${encoded}`,
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title: view.filename,
      description: 'Open in Open Knowledge.',
    },
  };
}

export default async function SplashPage({ params }: SplashPageProps) {
  const { encoded } = await params;
  const view = buildSplashViewModel(encoded);

  if (view.kind === 'unsupported-version') {
    return <SplashFallback heading="Update Open Knowledge to open this share." />;
  }

  if (view.kind === 'invalid') {
    return <SplashFallback heading="Invalid share URL." />;
  }

  return (
    <main className="relative min-h-screen bg-[var(--slide-bg)] font-[family-name:var(--font-dm-sans)]">
      <Image
        src="/ok-logo.png"
        alt=""
        width={64}
        height={64}
        className="pointer-events-none absolute top-8 right-8 z-10 size-10 md:top-12 md:right-12 md:size-12"
        aria-hidden="true"
      />

      <section className="px-6 pt-32 pb-16 md:pt-44 md:pb-20">
        <div className="mx-auto max-w-3xl">
          <p className="mb-6 text-sm font-medium italic text-[var(--slide-accent-strong)]">
            Shared via Open Knowledge
          </p>

          <h1
            className="text-3xl font-light tracking-tight text-[var(--slide-text)] sm:text-4xl lg:text-[3.25rem] lg:leading-[1.1]"
            data-testid="splash-filename"
          >
            <span className="relative inline-block break-words">
              {view.filename}
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
                  strokeWidth="4"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </h1>

          <p
            className="mt-8 text-lg leading-relaxed text-[var(--slide-muted)]"
            data-testid="splash-repo-path"
          >
            {view.repoPath}
          </p>

          {view.isDefaultBranch ? null : (
            <p
              className="mt-2 inline-flex items-center gap-2 text-sm text-[var(--slide-muted)]"
              data-testid="splash-branch-indicator"
            >
              <GitBranchIcon className="size-4" aria-hidden="true" />
              <span>
                on <span className="font-medium text-[var(--slide-text)]">{view.branch}</span>
              </span>
            </p>
          )}

          <SplashCtaCluster
            downloadUrl={SPLASH_DOWNLOAD_URL}
            customSchemeUrl={view.customSchemeUrl}
            githubUrl={view.githubUrl}
          />
        </div>
      </section>
    </main>
  );
}

function SplashFallback({ heading }: { heading: string }) {
  return (
    <main className="relative min-h-screen bg-[var(--slide-bg)] font-[family-name:var(--font-dm-sans)]">
      <Image
        src="/ok-logo.png"
        alt=""
        width={64}
        height={64}
        className="pointer-events-none absolute top-8 right-8 z-10 size-10 md:top-12 md:right-12 md:size-12"
        aria-hidden="true"
      />

      <section className="px-6 pt-32 pb-16 md:pt-44 md:pb-20">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-3xl font-light tracking-tight text-[var(--slide-text)] sm:text-4xl">
            {heading}
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-[var(--slide-muted)]">
            Head to Open Knowledge to learn more.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link
              href="/"
              className="slide-btn-outline inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--slide-accent)]"
            >
              <ArrowRightIcon className="size-4" aria-hidden="true" />
              Visit Open Knowledge
            </Link>
            <a
              href={SPLASH_DOWNLOAD_URL}
              className="slide-btn-primary inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-medium transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--slide-accent-strong)]"
            >
              <DownloadIcon className="size-4" aria-hidden="true" />
              Download for macOS
            </a>
          </div>

          <p className="mt-8 inline-flex items-center gap-2 text-sm text-[var(--slide-muted)]">
            <ExternalLinkIcon className="size-4" aria-hidden="true" />
            Share URLs are only opened on macOS in v1.
          </p>
        </div>
      </section>
    </main>
  );
}

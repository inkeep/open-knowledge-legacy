import { ArrowRightIcon, DownloadIcon, ExternalLinkIcon } from 'lucide-react';

interface SplashCtaClusterProps {
  downloadUrl: string;
  customSchemeUrl: string;
  githubUrl: string;
}

export function SplashCtaCluster({
  downloadUrl,
  customSchemeUrl,
  githubUrl,
}: SplashCtaClusterProps) {
  return (
    <div className="mt-12 flex flex-wrap items-center gap-4">
      <a
        href={downloadUrl}
        data-testid="splash-download-cta"
        className="slide-btn-primary inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-medium transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--slide-accent-strong)]"
      >
        <DownloadIcon className="size-4" aria-hidden="true" />
        Download Open Knowledge for macOS
      </a>

      <a
        href={customSchemeUrl}
        data-testid="splash-open-cta"
        className="slide-btn-outline inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--slide-accent)]"
      >
        Open in Open Knowledge
        <ArrowRightIcon className="size-4" aria-hidden="true" />
      </a>

      <a
        href={githubUrl}
        data-testid="splash-github-cta"
        rel="noopener noreferrer"
        target="_blank"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--slide-muted)] transition-colors hover:text-[var(--slide-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--slide-accent)] focus-visible:rounded"
      >
        View on GitHub
        <ExternalLinkIcon className="size-3.5" aria-hidden="true" />
      </a>
    </div>
  );
}

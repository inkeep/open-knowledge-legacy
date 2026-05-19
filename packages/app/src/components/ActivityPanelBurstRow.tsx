// biome-ignore-all lint/plugin/no-raw-html-interactive-element: pre-rule backlog — file uses raw <button> awaiting shadcn Button migration; tracked at https://github.com/inkeep/open-knowledge-legacy/blob/main/biome-plugins/README.md#no-raw-html-interactive-elementgrit
import { ChevronDown, ChevronRight } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import type { BurstData } from '@/lib/use-activity-panel';

const LazyActivityPanelDiffView = lazy(async () => {
  const mod = await import('./ActivityPanelDiffView');
  return { default: mod.ActivityPanelDiffView };
});

interface ActivityPanelBurstRowProps {
  burst: BurstData;
  docName: string;
  fetchBurstDiff: (docName: string, stackIndex: number) => Promise<string>;
}

function formatRelative(ms: number, now: number): string {
  const diff = Math.max(0, now - ms);
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  const d = new Date(ms);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function ActivityPanelBurstRow({
  burst,
  docName,
  fetchBurstDiff,
}: ActivityPanelBurstRowProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const [diff, setDiff] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const toggle = (): void => {
    const next = !expanded;
    setExpanded(next);
    if (next && diff === null && !loading) {
      setLoading(true);
      setLoadError(null);
      fetchBurstDiff(docName, burst.stackIndex)
        .then((text) => {
          setDiff(text);
          setLoading(false);
        })
        .catch((err: unknown) => {
          setLoadError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        });
    }
  };

  return (
    <div className="border-t border-border/50">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-2 px-4 py-1.5 text-xs text-muted-foreground hover:bg-muted/40"
        aria-expanded={expanded}
        aria-label={`${expanded ? 'Collapse' : 'Expand'} burst ${burst.stackIndex + 1} diff`}
      >
        {expanded ? (
          <ChevronDown className="size-3 shrink-0" aria-hidden="true" />
        ) : (
          <ChevronRight className="size-3 shrink-0" aria-hidden="true" />
        )}
        <span className="font-mono">{formatRelative(burst.ts, now)}</span>
        <span className="ml-auto font-mono">
          <span className="text-green-600 dark:text-green-400">+{burst.additions}</span>{' '}
          <span className="text-red-600 dark:text-red-400">−{burst.deletions}</span>
        </span>
      </button>
      {expanded ? (
        <div className="bg-muted/20">
          {loading ? (
            <div className="px-4 py-2 text-xs text-muted-foreground italic">Loading diff</div>
          ) : loadError ? (
            <div className="px-4 py-2 text-xs text-destructive">Failed: {loadError}</div>
          ) : diff !== null ? (
            <Suspense
              fallback={
                <div className="px-4 py-2 text-xs text-muted-foreground italic">Loading diff</div>
              }
            >
              <LazyActivityPanelDiffView diff={diff} />
            </Suspense>
          ) : (
            <div className="px-4 py-2 text-xs text-muted-foreground italic">No diff.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

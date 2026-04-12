import { useEffect, useState } from 'react';

interface BacklinkItem {
  source: string;
  title: string;
  snippet: string | null;
}

interface BacklinksResponse {
  ok: boolean;
  backlinks?: BacklinkItem[];
  error?: string;
}

export function BacklinksPanel({
  docName,
  className = '',
}: {
  docName: string;
  className?: string;
}) {
  const [backlinks, setBacklinks] = useState<BacklinkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/backlinks?docName=${encodeURIComponent(docName)}`);
        const data = (await res.json()) as BacklinksResponse;
        if (cancelled) return;
        if (!data.ok) {
          setError(data.error ?? 'Failed to load backlinks');
          setLoading(false);
          return;
        }
        setBacklinks(Array.isArray(data.backlinks) ? data.backlinks : []);
        setError(null);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load backlinks');
        setLoading(false);
      }
    }

    setLoading(true);
    void load();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void load();
      }
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [docName]);

  return (
    <section className={`flex h-full min-h-0 flex-col ${className}`}>
      <div className="border-b border-border/60 px-4 py-4">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">Backlinks</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {loading
            ? 'Refreshing link graph…'
            : `${backlinks.length} ${backlinks.length === 1 ? 'page links' : 'pages link'} here`}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : backlinks.length === 0 && !loading ? (
          <p className="text-sm text-muted-foreground">No pages link here yet.</p>
        ) : (
          <div className="space-y-2">
            {backlinks.map((backlink) => (
              <button
                key={`${backlink.source}-${backlink.snippet ?? ''}`}
                type="button"
                className="block w-full rounded-lg border border-border bg-background/80 px-3 py-2 text-left transition-colors hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  window.location.hash = `#/${backlink.source}`;
                }}
              >
                <div className="truncate text-sm font-medium">{backlink.title}</div>
                <div className="truncate text-xs text-muted-foreground">{backlink.source}</div>
                {backlink.snippet ? (
                  <p className="mt-1 text-sm text-muted-foreground">{backlink.snippet}</p>
                ) : null}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

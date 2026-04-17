import { useQuery } from '@tanstack/react-query';
import { usePageList } from '@/components/PageListContext';
import {
  Panel,
  PanelBody,
  PanelCount,
  PanelEmpty,
  PanelError,
  PanelHeader,
  PanelTitle,
} from '@/components/ui/panel';
import { hashFromDocName } from '@/lib/doc-hash';
import { resolveTargetNavigationIntent } from './target-navigation-intent';

interface BacklinkItem {
  source: string;
  anchor: string | null;
  title: string;
  snippet: string | null;
}

interface BacklinksResponse {
  ok: boolean;
  backlinks?: BacklinkItem[];
  error?: string;
}

async function fetchBacklinks(docName: string): Promise<BacklinkItem[]> {
  const res = await fetch(`/api/backlinks?docName=${encodeURIComponent(docName)}`);
  if (!res.ok) throw new Error(`Server error: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as BacklinksResponse;
  if (!data.ok) throw new Error(data.error ?? 'Failed to load backlinks');
  return data.backlinks ?? [];
}

export function BacklinksPanel({
  docName,
  className = '',
}: {
  docName: string;
  className?: string;
}) {
  const { folderPaths, pages, loading } = usePageList();
  const {
    data: backlinks = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['backlinks', docName],
    queryFn: () => fetchBacklinks(docName),
    enabled: !loading && pages.has(docName),
  });

  return (
    <Panel className={className}>
      <PanelHeader>
        <PanelTitle>Backlinks</PanelTitle>
        {!isLoading && <PanelCount>{backlinks.length}</PanelCount>}
      </PanelHeader>
      <PanelBody aria-busy={isLoading}>
        {error ? (
          <PanelError>
            {error instanceof Error ? error.message : 'Failed to load backlinks'}
          </PanelError>
        ) : backlinks.length === 0 && !isLoading ? (
          <PanelEmpty>No pages link here yet.</PanelEmpty>
        ) : (
          <div className="flex flex-col gap-2">
            {backlinks.map((backlink, index) => (
              <button
                // biome-ignore lint/suspicious/noArrayIndexKey: rows are stable per poll; source may repeat if API adds multiple edges per source
                key={`${backlink.source}-${index}`}
                type="button"
                className="block w-full rounded-lg border border-border bg-background/80 px-3 py-2 text-left transition-colors hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  const navigationIntent = resolveTargetNavigationIntent(backlink.source, {
                    pages,
                    folderPaths,
                  });
                  window.location.assign(
                    hashFromDocName(navigationIntent.hashDocName, backlink.anchor),
                  );
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
      </PanelBody>
    </Panel>
  );
}

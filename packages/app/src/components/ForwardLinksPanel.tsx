import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Panel,
  PanelBody,
  PanelCount,
  PanelEmpty,
  PanelError,
  PanelHeader,
  PanelTitle,
} from '@/components/ui/panel';

interface ForwardLinksResponse {
  ok: boolean;
  forwardLinks?: string[];
  error?: string;
}

async function fetchForwardLinks(docName: string): Promise<string[]> {
  const res = await fetch(`/api/forward-links?docName=${encodeURIComponent(docName)}`);
  if (!res.ok) throw new Error(`Server error: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as ForwardLinksResponse;
  if (!data.ok) throw new Error(data.error ?? 'Failed to load outgoing links');
  return data.forwardLinks ?? [];
}

export function ForwardLinksPanel({
  docName,
  className = '',
}: {
  docName: string;
  className?: string;
}) {
  const {
    data: links = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['forward-links', docName],
    queryFn: () => fetchForwardLinks(docName),
    refetchInterval: 2000,
    refetchIntervalInBackground: false,
  });

  return (
    <Panel className={className}>
      <PanelHeader>
        <PanelTitle>Outgoing Links</PanelTitle>
        <PanelCount>{!isLoading && links.length}</PanelCount>
      </PanelHeader>
      <PanelBody aria-busy={isLoading}>
        {error ? (
          <PanelError>
            {error instanceof Error ? error.message : 'Failed to load outgoing links'}
          </PanelError>
        ) : links.length === 0 && !isLoading ? (
          <PanelEmpty>This page doesn't link to anything yet.</PanelEmpty>
        ) : (
          <div className="flex flex-col gap-2">
            {links.map((target, index) => (
              <Button
                // biome-ignore lint/suspicious/noArrayIndexKey: forward link targets are stable per fetch
                key={index}
                variant="outline"
                className="h-auto w-full justify-start px-3 py-2 text-left"
                onClick={() => {
                  window.location.hash = `#/${target}`;
                }}
              >
                <span className="truncate text-sm font-medium">{target}</span>
              </Button>
            ))}
          </div>
        )}
      </PanelBody>
    </Panel>
  );
}

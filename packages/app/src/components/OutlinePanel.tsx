import { useQuery } from '@tanstack/react-query';
import {
  Panel,
  PanelBody,
  PanelCount,
  PanelEmpty,
  PanelError,
  PanelHeader,
  PanelTitle,
} from '@/components/ui/panel';
import { cn } from '@/lib/utils';

interface HeadingEntry {
  level: number;
  text: string;
  slug: string;
}

interface PageHeadingsResponse {
  ok: boolean;
  headings?: HeadingEntry[];
  error?: string;
}

async function fetchHeadings(docName: string): Promise<HeadingEntry[]> {
  const res = await fetch(`/api/page-headings?docName=${encodeURIComponent(docName)}`);
  if (!res.ok) throw new Error(`Server error: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as PageHeadingsResponse;
  if (!data.ok) throw new Error(data.error ?? 'Failed to load headings');
  return data.headings ?? [];
}

export function OutlinePanel({ docName, className = '' }: { docName: string; className?: string }) {
  const {
    data: headings = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['page-headings', docName],
    queryFn: () => fetchHeadings(docName),
    refetchInterval: 2000,
    refetchIntervalInBackground: false,
  });

  return (
    <Panel className={className}>
      <PanelHeader>
        <PanelTitle>Outline</PanelTitle>
        {!isLoading && <PanelCount>{headings.length}</PanelCount>}
      </PanelHeader>
      <PanelBody className="px-2 py-2" aria-busy={isLoading}>
        {error ? (
          <PanelError className="px-2">
            {error instanceof Error ? error.message : 'Failed to load headings'}
          </PanelError>
        ) : headings.length === 0 && !isLoading ? (
          <PanelEmpty className="px-2">No headings yet.</PanelEmpty>
        ) : (
          <div className="flex flex-col gap-0.5">
            {headings.map((heading, index) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: headings are positionally stable per load
                key={index}
                className={cn(
                  'h-auto w-full justify-start truncate rounded-md py-1 text-left text-sm font-normal text-muted-foreground',
                  heading.level === 1 && 'font-medium text-foreground',
                )}
                style={{ paddingLeft: `${(heading.level - 1) * 12 + 8}px`, paddingRight: '8px' }}
              >
                {heading.text}
              </div>
            ))}
          </div>
        )}
      </PanelBody>
    </Panel>
  );
}

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

export interface OutlineNavDetail {
  index: number;
  slug: string;
  mode: 'wysiwyg' | 'source';
}

export const OUTLINE_NAV_EVENT = 'open-knowledge:outline-nav';

export function OutlinePanel({
  docName,
  isSourceMode,
  className = '',
}: {
  docName: string;
  isSourceMode: boolean;
  className?: string;
}) {
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
              <button
                type="button"
                // biome-ignore lint/suspicious/noArrayIndexKey: headings are positionally stable per load
                key={index}
                onClick={() => {
                  const detail: OutlineNavDetail = {
                    index,
                    slug: heading.slug,
                    mode: isSourceMode ? 'source' : 'wysiwyg',
                  };
                  window.dispatchEvent(new CustomEvent(OUTLINE_NAV_EVENT, { detail }));
                }}
                className={cn(
                  'h-auto w-full cursor-pointer justify-start truncate rounded-md py-1 text-left text-sm font-normal text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  heading.level === 1 && 'font-medium text-foreground',
                )}
                style={{ paddingLeft: `${(heading.level - 1) * 12 + 8}px`, paddingRight: '8px' }}
                title={heading.text}
              >
                {heading.text}
              </button>
            ))}
          </div>
        )}
      </PanelBody>
    </Panel>
  );
}

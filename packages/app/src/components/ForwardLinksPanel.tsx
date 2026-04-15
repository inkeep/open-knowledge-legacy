import { useQuery } from '@tanstack/react-query';
import { FilePlus2 } from 'lucide-react';
import { useState } from 'react';
import { defaultInitialDir } from '@/components/file-tree-utils';
import { NewItemDialog } from '@/components/NewItemDialog';
import { usePageList } from '@/components/PageListContext';
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
import {
  isResolvedWikiLinkTarget,
  wikiLinkSuggestedFilename,
} from '@/editor/extensions/wiki-link-helpers';
import { docNameFromHash, hashFromDocName } from '@/lib/doc-hash';
import { cn } from '@/lib/utils';

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
  const { pages, loading: pagesLoading } = usePageList();
  const {
    data: links = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['forward-links', docName],
    queryFn: () => fetchForwardLinks(docName),
  });
  const [createTarget, setCreateTarget] = useState<string | null>(null);

  function handleRowClick(target: string) {
    if (!pagesLoading && !isResolvedWikiLinkTarget(target, pages)) {
      setCreateTarget(target);
      return;
    }
    window.location.assign(hashFromDocName(target));
  }

  return (
    <>
      <Panel className={className}>
        <PanelHeader>
          <PanelTitle>Outgoing Links</PanelTitle>
          {!isLoading && <PanelCount>{links.length}</PanelCount>}
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
              {links.map((target, index) => {
                const unresolved = !pagesLoading && !isResolvedWikiLinkTarget(target, pages);

                return (
                  <Button
                    // biome-ignore lint/suspicious/noArrayIndexKey: forward link targets are stable per fetch
                    key={index}
                    variant="ghost"
                    className={cn(
                      'h-auto w-full justify-start px-3 py-2 text-left',
                      unresolved &&
                        'border-amber-300 bg-amber-50/70 text-amber-950 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200 dark:hover:bg-amber-950/35',
                    )}
                    onClick={() => handleRowClick(target)}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{target}</div>
                      {unresolved ? (
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                          <FilePlus2 className="size-3 shrink-0" aria-hidden="true" />
                          <span>Missing page. Click to create.</span>
                        </div>
                      ) : null}
                    </div>
                  </Button>
                );
              })}
            </div>
          )}
        </PanelBody>
      </Panel>

      <NewItemDialog
        open={createTarget !== null}
        kind="file"
        initialDir={defaultInitialDir(docNameFromHash(window.location.hash) ?? '')}
        suggestedName={createTarget ? wikiLinkSuggestedFilename(createTarget) : undefined}
        onOpenChange={(open: boolean) => {
          if (!open) setCreateTarget(null);
        }}
      />
    </>
  );
}

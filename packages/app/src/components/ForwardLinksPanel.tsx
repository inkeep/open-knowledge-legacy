import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, FilePlus2, FolderOpen } from 'lucide-react';
import { useState } from 'react';
import { folderIndexCreateSeed, resolveLinkTargetIntent } from '@/components/link-target-intent';
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
import { hashFromDocName } from '@/lib/doc-hash';
import { cn } from '@/lib/utils';

interface ForwardLinksResponse {
  ok: boolean;
  forwardLinks?: ForwardLinkItem[];
  error?: string;
}

interface DocumentForwardLinkItem {
  kind: 'doc';
  docName: string;
  anchor: string | null;
  title: string;
  snippet: string | null;
}

interface ExternalForwardLinkItem {
  kind: 'external';
  url: string;
  title: string;
  snippet: string | null;
}

type ForwardLinkItem = DocumentForwardLinkItem | ExternalForwardLinkItem;

function compactForwardLinkPath(docName: string): string {
  const segments = docName.split('/');
  if (segments.length <= 2) return docName;
  return `…/${segments.slice(-2).join('/')}`;
}

async function fetchForwardLinks(docName: string): Promise<ForwardLinkItem[]> {
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
  const { folderPaths, pages, loading: pagesLoading } = usePageList();
  const {
    data: links = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['forward-links', docName],
    queryFn: () => fetchForwardLinks(docName),
    enabled: !pagesLoading && pages.has(docName),
  });
  const [createTarget, setCreateTarget] = useState<DocumentForwardLinkItem | null>(null);
  const createDialogIntent =
    createTarget === null
      ? null
      : resolveLinkTargetIntent(createTarget.docName, {
          pages,
          folderPaths,
        });
  const createDialogSeed =
    createDialogIntent === null
      ? null
      : createDialogIntent.kind === 'create'
        ? {
            initialDir: createDialogIntent.initialDir,
            suggestedName: createDialogIntent.suggestedName,
          }
        : folderIndexCreateSeed(createDialogIntent);

  function handleRowClick(link: ForwardLinkItem) {
    if (link.kind === 'external') {
      window.open(link.url, '_blank', 'noopener,noreferrer');
      return;
    }
    const linkIntent = resolveLinkTargetIntent(link.docName, {
      pages,
      folderPaths,
    });
    if (!pagesLoading && linkIntent.kind === 'create') {
      setCreateTarget(link);
      return;
    }
    const hashDocName = linkIntent.kind === 'navigate' ? linkIntent.hashDocName : link.docName;
    window.location.assign(hashFromDocName(hashDocName, link.anchor));
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
              {links.map((link) => {
                const linkIntent =
                  link.kind === 'doc'
                    ? resolveLinkTargetIntent(link.docName, {
                        pages,
                        folderPaths,
                      })
                    : null;
                const unresolved =
                  link.kind === 'doc' && !pagesLoading && linkIntent?.kind === 'create';
                const folderTarget =
                  link.kind === 'doc' &&
                  !pagesLoading &&
                  linkIntent?.kind === 'navigate' &&
                  linkIntent.displayState === 'folder';
                const compactPath =
                  link.kind === 'doc' ? compactForwardLinkPath(link.docName) : link.url;
                const displayTitle =
                  link.kind === 'doc' && link.title === link.docName ? compactPath : link.title;
                const key =
                  link.kind === 'doc'
                    ? `doc:${link.docName}:${link.anchor ?? ''}`
                    : `ext:${link.url}`;
                return (
                  <div key={key} className="flex flex-col gap-2">
                    <Button
                      variant="outline"
                      className={cn(
                        'h-auto w-full items-start justify-start whitespace-normal px-3 py-2 text-left',
                        unresolved &&
                          'border-amber-300 bg-amber-50/70 text-amber-950 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200 dark:hover:bg-amber-950/35',
                        folderTarget &&
                          'border-sky-300 bg-sky-50/70 text-sky-950 hover:bg-sky-100 dark:border-sky-900 dark:bg-sky-950/20 dark:text-sky-100 dark:hover:bg-sky-950/35',
                      )}
                      onClick={() => handleRowClick(link)}
                    >
                      <div className="min-w-0 flex-1">
                        <div
                          className="truncate text-sm font-medium"
                          title={
                            link.kind === 'doc' && link.title === link.docName
                              ? link.docName
                              : link.kind === 'external'
                                ? link.url
                                : undefined
                          }
                        >
                          <span className="inline-flex items-center gap-1">
                            <span>{displayTitle}</span>
                            {link.kind === 'external' ? (
                              <ArrowUpRight
                                className="size-3.5 shrink-0 text-muted-foreground"
                                aria-hidden="true"
                              />
                            ) : null}
                          </span>
                        </div>
                        {link.kind === 'doc' && link.title !== link.docName ? (
                          <div
                            className="truncate font-mono text-xs text-muted-foreground"
                            title={link.docName}
                          >
                            {compactPath}
                          </div>
                        ) : null}
                        {link.kind === 'external' ? (
                          <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                            {link.url}
                          </div>
                        ) : null}
                        {unresolved ? (
                          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                            <FilePlus2 className="size-3 shrink-0" aria-hidden="true" />
                            <span>Missing page. Click to create.</span>
                          </div>
                        ) : null}
                        {folderTarget ? (
                          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-sky-700 dark:text-sky-300">
                            <FolderOpen className="size-3 shrink-0" aria-hidden="true" />
                            <span>Folder target. Click to open the overview.</span>
                          </div>
                        ) : null}
                        {link.snippet ? (
                          <p className="mt-1 break-words text-sm text-muted-foreground">
                            {link.snippet}
                          </p>
                        ) : null}
                      </div>
                    </Button>
                    {folderTarget ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="self-start"
                        onClick={() => setCreateTarget(link)}
                      >
                        <FilePlus2 className="size-3.5" />
                        Create index note
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </PanelBody>
      </Panel>

      <NewItemDialog
        open={createTarget !== null}
        kind="file"
        initialDir={createDialogSeed?.initialDir ?? ''}
        suggestedName={createDialogSeed?.suggestedName}
        onOpenChange={(open: boolean) => {
          if (!open) setCreateTarget(null);
        }}
      />
    </>
  );
}

import {
  type BacklinkEntry,
  BacklinksSuccessSchema,
  type ForwardLinkEntry,
  ForwardLinksSuccessSchema,
  ProblemDetailsSchema,
} from '@inkeep/open-knowledge-core';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  Plus,
  TriangleAlert,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { toast } from 'sonner';
import { folderIndexCreateSeed, resolveLinkTargetIntent } from '@/components/link-target-intent';
import { usePageList } from '@/components/PageListContext';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Panel,
  PanelBody,
  PanelCount,
  PanelEmpty,
  PanelError,
  PanelTitle,
} from '@/components/ui/panel';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { HttpResponseParseError } from '@/editor/http-client';
import { type CreatePageSeed, createPageFromSeedAndUpdate } from '@/lib/create-page';
import { hashFromDocName } from '@/lib/doc-hash';
import { cn } from '@/lib/utils';
import { resolveTargetNavigationIntent } from './target-navigation-intent';

const INITIAL_VISIBLE = 5;

async function fetchBacklinks(docName: string): Promise<BacklinkEntry[]> {
  const res = await fetch(`/api/backlinks?docName=${encodeURIComponent(docName)}`);
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const problem = ProblemDetailsSchema.safeParse(body);
    if (!problem.success) {
      throw new HttpResponseParseError(
        `Failed to parse backlinks error response (HTTP ${res.status})`,
        { status: res.status },
      );
    }
    throw new Error(problem.data.title);
  }
  const success = BacklinksSuccessSchema.safeParse(body);
  if (!success.success) {
    throw new HttpResponseParseError('Backlinks response did not match expected shape.', {
      status: res.status,
    });
  }
  return success.data.backlinks;
}

async function fetchForwardLinks(docName: string): Promise<ForwardLinkEntry[]> {
  const res = await fetch(`/api/forward-links?docName=${encodeURIComponent(docName)}`);
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const problem = ProblemDetailsSchema.safeParse(body);
    if (!problem.success) {
      throw new HttpResponseParseError(
        `Failed to parse forward-links error response (HTTP ${res.status})`,
        { status: res.status },
      );
    }
    throw new Error(problem.data.title);
  }
  const success = ForwardLinksSuccessSchema.safeParse(body);
  if (!success.success) {
    throw new HttpResponseParseError('Forward-links response did not match expected shape.', {
      status: res.status,
    });
  }
  return success.data.forwardLinks;
}

function compactDocPath(docName: string): string {
  const segments = docName.split('/');
  if (segments.length <= 2) return docName;
  return `…/${segments.slice(-2).join('/')}`;
}

function navigateToDocHash(docName: string): void {
  window.location.hash = hashFromDocName(docName);
}

function SectionTrigger({
  title,
  count,
  isLoading,
}: {
  title: string;
  count: number;
  isLoading: boolean;
}) {
  return (
    <CollapsibleTrigger className="group flex w-full cursor-pointer items-center justify-between px-5 py-3 text-left transition-colors hover:bg-muted/40">
      <span className="flex items-center gap-2.5">
        <ChevronDown className="size-3.5 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
        <PanelTitle>{title}</PanelTitle>
      </span>
      {!isLoading && <PanelCount>{count}</PanelCount>}
    </CollapsibleTrigger>
  );
}

function ShowMoreButton({
  total,
  expanded,
  onToggle,
}: {
  total: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (total <= INITIAL_VISIBLE) return null;
  const hidden = total - INITIAL_VISIBLE;
  return (
    <button
      type="button"
      aria-expanded={expanded}
      className="mt-2 inline-flex cursor-pointer items-center gap-1 px-3 text-xs text-muted-foreground transition-colors hover:text-foreground"
      onClick={onToggle}
    >
      {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
      {expanded ? 'Show fewer' : `Show ${hidden} more`}
    </button>
  );
}

interface LinkRowProps {
  icon: ReactNode;
  iconColorClass?: string;
  rowTooltip?: string;
  title: string;
  path?: string;
  anchor?: string | null;
  snippet?: string | null;
  titleHover?: string;
  ariaLabel?: string;
  href?: string;
  external?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  hoverAction?: {
    icon: ReactNode;
    tooltip: string;
    onClick: () => void;
    disabled?: boolean;
  };
}

function LinkRow({
  icon,
  iconColorClass,
  rowTooltip,
  title,
  path,
  anchor,
  snippet,
  titleHover,
  ariaLabel,
  href,
  external,
  disabled,
  onClick,
  hoverAction,
}: LinkRowProps) {
  const showPath = path !== undefined && path !== title;
  const iconNode = (
    <span className={cn('mt-0.5 shrink-0', iconColorClass ?? 'text-muted-foreground')}>{icon}</span>
  );

  const overlayClassName =
    'block w-full truncate text-left font-medium text-foreground no-underline outline-none after:absolute after:inset-0 after:rounded-md focus-visible:after:ring-2 focus-visible:after:ring-ring';
  const primaryInteractive = href ? (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      aria-label={ariaLabel}
      title={titleHover}
      onClick={onClick}
      className={overlayClassName}
    >
      {title}
      {external ? <span className="sr-only"> (opens in new tab)</span> : null}
    </a>
  ) : (
    <button
      type="button"
      aria-label={ariaLabel}
      title={titleHover}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        overlayClassName,
        'cursor-pointer bg-transparent p-0 disabled:cursor-not-allowed disabled:opacity-60',
      )}
    >
      {title}
    </button>
  );

  const row = (
    <div className="group relative flex items-start gap-2.5 rounded-md px-3 py-2.5 transition-colors hover:bg-muted/80">
      <div className="mt-px flex items-center">{iconNode}</div>
      <div className="min-w-0 flex-1 space-y-0.5 text-1sm">
        {primaryInteractive}
        {showPath ? (
          <div className="truncate font-mono text-xs text-muted-foreground">
            {path}
            {anchor ? <span className="ml-1">· #{anchor}</span> : null}
          </div>
        ) : null}
        {snippet ? <p className="line-clamp-2 text-muted-foreground">{snippet}</p> : null}
      </div>
      {hoverAction ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={hoverAction.tooltip}
              disabled={hoverAction.disabled}
              className="relative z-10 shrink-0 cursor-pointer rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground group-hover:opacity-100"
              onClick={hoverAction.onClick}
            >
              {hoverAction.icon}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">{hoverAction.tooltip}</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );

  if (rowTooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{row}</TooltipTrigger>
        <TooltipContent side="top">{rowTooltip}</TooltipContent>
      </Tooltip>
    );
  }
  return row;
}

function BacklinksSection({ docName }: { docName: string }) {
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
  const [expanded, setExpanded] = useState(false);
  const [prevDocName, setPrevDocName] = useState(docName);
  if (prevDocName !== docName) {
    setPrevDocName(docName);
    setExpanded(false);
  }
  const visible = expanded ? backlinks : backlinks.slice(0, INITIAL_VISIBLE);

  return (
    <Collapsible defaultOpen>
      <SectionTrigger title="Backlinks" count={backlinks.length} isLoading={isLoading} />
      <CollapsibleContent>
        <div className="px-2 pb-3" aria-busy={isLoading}>
          {error ? (
            <div className="px-3">
              <PanelError>
                {error instanceof Error ? error.message : 'Failed to load backlinks'}
              </PanelError>
            </div>
          ) : backlinks.length === 0 && !isLoading ? (
            <div className="px-3">
              <PanelEmpty>No pages link here yet.</PanelEmpty>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                {visible.map((backlink, index) => {
                  const navigationIntent = resolveTargetNavigationIntent(backlink.source, {
                    pages,
                    folderPaths,
                  });
                  return (
                    <LinkRow
                      // biome-ignore lint/suspicious/noArrayIndexKey: rows are stable per poll; source may repeat if API adds multiple edges per source
                      key={`${backlink.source}-${index}`}
                      icon={<File className="size-3.5" />}
                      title={backlink.title}
                      path={compactDocPath(backlink.source)}
                      titleHover={backlink.source}
                      anchor={backlink.anchor}
                      snippet={backlink.snippet}
                      href={hashFromDocName(navigationIntent.hashDocName, backlink.anchor)}
                    />
                  );
                })}
              </div>
              <ShowMoreButton
                total={backlinks.length}
                expanded={expanded}
                onToggle={() => setExpanded((prev) => !prev)}
              />
            </>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ForwardLinksSection({ docName }: { docName: string }) {
  const { addPage, folderPaths, pages, pagesBySlug, loading: pagesLoading } = usePageList();
  const {
    data: links = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['forward-links', docName],
    queryFn: () => fetchForwardLinks(docName),
    enabled: !pagesLoading && pages.has(docName),
  });
  const [creatingKey, setCreatingKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [prevDocName, setPrevDocName] = useState(docName);
  if (prevDocName !== docName) {
    setPrevDocName(docName);
    setExpanded(false);
    setCreatingKey(null);
  }
  const visible = expanded ? links : links.slice(0, INITIAL_VISIBLE);

  async function handleCreatePage(seed: CreatePageSeed, key: string) {
    if (creatingKey) return;
    setCreatingKey(key);
    try {
      await createPageFromSeedAndUpdate(seed, {
        addPage,
        onCreated: navigateToDocHash,
      });
      setCreatingKey(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create page');
      setCreatingKey(null);
    }
  }

  function renderRow(link: ForwardLinkEntry) {
    if (link.kind === 'external') {
      const titleIsUrl = link.title === link.url;
      return (
        <LinkRow
          key={`ext:${link.url}`}
          icon={<ArrowUpRight className="size-3.5" />}
          rowTooltip="Opens in a new tab"
          title={link.title}
          path={titleIsUrl ? undefined : link.url}
          titleHover={link.url}
          snippet={link.snippet}
          href={link.url}
          external
        />
      );
    }

    const linkIntent = resolveLinkTargetIntent(link.docName, {
      pages,
      folderPaths,
      pagesBySlug,
    });
    const unresolved = !pagesLoading && linkIntent.kind === 'create';
    const folderTarget =
      !pagesLoading && linkIntent.kind === 'navigate' && linkIntent.displayState === 'folder';
    const path = compactDocPath(link.docName);
    const titleEqualsDocName = link.title === link.docName;
    const displayTitle = titleEqualsDocName ? path : link.title;
    const key = `doc:${link.docName}:${link.anchor ?? ''}`;
    const navigateHashDocName =
      linkIntent.kind === 'navigate' ? linkIntent.hashDocName : link.docName;
    const navigateHref = hashFromDocName(navigateHashDocName, link.anchor);

    if (unresolved && linkIntent.kind === 'create') {
      const seed = {
        initialDir: linkIntent.initialDir,
        suggestedName: linkIntent.suggestedName,
      };
      return (
        <LinkRow
          key={key}
          icon={<TriangleAlert className="size-3.5" />}
          iconColorClass="text-amber-600 dark:text-amber-400"
          rowTooltip={creatingKey === key ? 'Creating page...' : 'Missing page — click to create'}
          ariaLabel={
            creatingKey === key
              ? `Creating page: ${link.title}.`
              : `Missing page: ${link.title}. Click to create.`
          }
          title={displayTitle}
          path={path}
          titleHover={link.docName}
          anchor={link.anchor}
          snippet={link.snippet}
          disabled={creatingKey !== null}
          onClick={() => void handleCreatePage(seed, key)}
        />
      );
    }

    if (folderTarget && linkIntent.kind === 'navigate') {
      const seed = folderIndexCreateSeed(linkIntent);
      return (
        <LinkRow
          key={key}
          icon={<Folder className="size-3.5" />}
          iconColorClass="text-sky-600 dark:text-sky-400"
          ariaLabel={`Folder target: ${link.title}. Click to open the overview.`}
          title={displayTitle}
          path={path}
          titleHover={link.docName}
          anchor={link.anchor}
          snippet={link.snippet}
          href={navigateHref}
          hoverAction={{
            icon: <Plus className="size-3.5" />,
            tooltip: creatingKey === key ? 'Creating index note...' : 'Create index note',
            disabled: creatingKey !== null || seed === null,
            onClick: () => {
              if (seed) void handleCreatePage(seed, key);
            },
          }}
        />
      );
    }

    return (
      <LinkRow
        key={key}
        icon={<File className="size-3.5" />}
        title={displayTitle}
        path={path}
        titleHover={link.docName}
        anchor={link.anchor}
        snippet={link.snippet}
        href={navigateHref}
      />
    );
  }

  return (
    <Collapsible defaultOpen>
      <SectionTrigger title="Outgoing" count={links.length} isLoading={isLoading} />
      <CollapsibleContent>
        <div className="px-2 pb-3" aria-busy={isLoading}>
          {error ? (
            <div className="px-3">
              <PanelError>
                {error instanceof Error ? error.message : 'Failed to load outgoing links'}
              </PanelError>
            </div>
          ) : links.length === 0 && !isLoading ? (
            <div className="px-3">
              <PanelEmpty>This page doesn't link to anything yet.</PanelEmpty>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1">{visible.map(renderRow)}</div>
              <ShowMoreButton
                total={links.length}
                expanded={expanded}
                onToggle={() => setExpanded((prev) => !prev)}
              />
            </>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function LinksPanel({ docName, className = '' }: { docName: string; className?: string }) {
  return (
    <Panel className={className}>
      <PanelBody className="px-0 py-0">
        <BacklinksSection docName={docName} />
        <Separator />
        <ForwardLinksSection docName={docName} />
      </PanelBody>
    </Panel>
  );
}

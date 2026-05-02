import { Search } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInput,
} from '@/components/ui/sidebar';
import {
  DEFAULT_GBRAIN_SEARCH_LIMIT,
  fetchGBrainStatus,
  type GBrainSearchResponse,
  type GBrainSearchResult,
  type GBrainStatus,
  searchGBrain,
} from '@/lib/gbrain-client';

interface GBrainSidebarSearchProps {
  initialStatus?: GBrainStatus | null;
  initialSearchResponse?: GBrainSearchResponse | null;
}

export function GBrainSidebarSearch({
  initialStatus,
  initialSearchResponse = null,
}: GBrainSidebarSearchProps = {}) {
  const [status, setStatus] = useState<GBrainStatus | null>(initialStatus ?? null);

  useEffect(() => {
    if (initialStatus !== undefined) return;
    let active = true;
    fetchGBrainStatus().then((nextStatus) => {
      if (active) setStatus(nextStatus);
    });
    return () => {
      active = false;
    };
  }, [initialStatus]);

  if (status?.state !== 'matched') return null;

  return (
    <GBrainSidebarSearchPanel
      initialSearchResponse={initialSearchResponse}
      sourceName={status.sourceName}
    />
  );
}

interface GBrainSidebarSearchPanelProps {
  initialSearchResponse?: GBrainSearchResponse | null;
  sourceName: string;
}

function GBrainSidebarSearchPanel({
  initialSearchResponse = null,
  sourceName,
}: GBrainSidebarSearchPanelProps) {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResponse, setSearchResponse] = useState<GBrainSearchResponse | null>(
    initialSearchResponse,
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedQuery = query.trim();
    if (trimmedQuery === '' || isSearching) return;

    setIsSearching(true);
    setSearchResponse(null);
    const response = await searchGBrain(trimmedQuery, { limit: DEFAULT_GBRAIN_SEARCH_LIMIT });
    setSearchResponse(response);
    setIsSearching(false);
  }

  return (
    <GBrainSidebarSearchView
      isSearching={isSearching}
      onQueryChange={setQuery}
      onSubmit={handleSubmit}
      query={query}
      searchResponse={searchResponse}
      sourceName={sourceName}
    />
  );
}

export interface GBrainSidebarSearchViewProps {
  isSearching: boolean;
  onQueryChange: (query: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  query: string;
  searchResponse: GBrainSearchResponse | null;
  sourceName: string;
}

export function GBrainSidebarSearchView({
  isSearching,
  onQueryChange,
  onSubmit,
  query,
  searchResponse,
  sourceName,
}: GBrainSidebarSearchViewProps) {
  const results = searchResponse?.ok ? searchResponse.results : [];
  const error = searchResponse?.ok === false ? searchResponse.message : null;
  const hasSearched = searchResponse !== null;

  return (
    <SidebarGroup className="border-sidebar-border/70 border-b pb-3" data-testid="gbrain-search">
      <SidebarGroupLabel className="px-0 font-mono text-[0.65rem] uppercase tracking-wider text-sidebar-foreground/50">
        gbrain search
      </SidebarGroupLabel>
      <SidebarGroupContent className="space-y-2">
        <form className="flex items-center gap-1" onSubmit={onSubmit}>
          <SidebarInput
            aria-label="Search gbrain"
            className="h-7 text-xs"
            onInput={(event) => onQueryChange(event.currentTarget.value)}
            placeholder={`Search ${sourceName}`}
            type="search"
            value={query}
          />
          <Button
            aria-label="Submit gbrain search"
            className="text-sidebar-foreground hover:bg-sidebar-hover"
            disabled={query.trim() === '' || isSearching}
            size="icon-sm"
            type="submit"
            variant="ghost"
          >
            <Search aria-hidden="true" />
          </Button>
        </form>
        {isSearching ? (
          <p className="px-1 text-xs text-sidebar-foreground/50">Searching gbrain...</p>
        ) : null}
        {error !== null ? (
          <p className="px-1 text-xs text-destructive" role="status">
            {error}
          </p>
        ) : null}
        {hasSearched && results.length === 0 && error === null && !isSearching ? (
          <p className="px-1 text-xs text-sidebar-foreground/50">No gbrain results found.</p>
        ) : null}
        {results.length > 0 ? <GBrainResultList results={results} /> : null}
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function GBrainResultList({ results }: { results: GBrainSearchResult[] }) {
  return (
    <ul className="space-y-1" data-testid="gbrain-search-results">
      {results.map((result) => (
        <li
          className="rounded-md px-2 py-1.5 text-xs hover:bg-sidebar-hover"
          key={`${result.sourceId ?? 'source'}:${result.slug}`}
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate font-medium text-sidebar-foreground">
              {result.title ?? result.slug}
            </span>
            {typeof result.score === 'number' ? (
              <span className="shrink-0 text-sidebar-foreground/40">
                {formatScore(result.score)}
              </span>
            ) : null}
          </div>
          <div className="truncate font-mono text-[0.65rem] text-sidebar-foreground/50">
            {result.slug}
          </div>
          <p className="line-clamp-2 text-sidebar-foreground/70">{result.snippet}</p>
        </li>
      ))}
    </ul>
  );
}

function formatScore(score: number): string {
  if (!Number.isFinite(score)) return '';
  return score.toFixed(2);
}

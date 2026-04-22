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
import { rememberPendingSourceNavigation } from '@/editor/source-editor-navigation';
import { useActiveHeading } from '@/hooks/useActiveHeading';
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

// Each button is py-1.5 (6px × 2) + text-sm line-height (20px) = 32px tall.
// These values must stay in sync with the button className below.
const ITEM_H = 32;
const PAD_TOP = 6; // py-1.5
const PAD_BOT = 6; // py-1.5
// Horizontal px per nesting level (1-based)
const LEVEL_W = 8;

function lineX(level: number): number {
  // +0.5 centres a 1px stroke on a pixel column (crisp rendering)
  return (level - 1) * LEVEL_W + 0.5;
}

/**
 * Single SVG path that runs
 * vertically within each heading's text region, then draws a diagonal
 * to the next heading's x-position via `L x top` between items.
 *
 *   |  H1                 ← vertical at x=0
 *    \                    ← diagonal (L to H2 top)
 *     |  H2               ← vertical at x=8
 *     |  H2               ← vertical at x=8
 *    /                    ← diagonal (L to H1 top)
 *   |  H1                 ← vertical at x=0
 */
function buildLinePath(headings: HeadingEntry[]): string {
  if (headings.length === 0) return '';
  const parts: string[] = [];

  for (let i = 0; i < headings.length; i++) {
    const x = lineX(headings[i].level);
    const top = i * ITEM_H + PAD_TOP;
    const bot = i * ITEM_H + ITEM_H - PAD_BOT;

    // Move on first item; subsequent items arrive via an L that draws the
    // diagonal (or straight line when same depth) from the previous bottom.
    parts.push(`${i === 0 ? 'M' : 'L'}${x} ${top}`);
    parts.push(`L${x} ${bot}`);
  }

  return parts.join(' ');
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
  const { pages, loading } = usePageList();
  const {
    data: headings = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['page-headings', docName],
    queryFn: () => fetchHeadings(docName),
    enabled: !loading && pages.has(docName),
    refetchInterval: 2000,
    refetchIntervalInBackground: false,
  });

  const slugs = headings.map((h) => h.slug);
  const activeSlug = useActiveHeading(slugs, isSourceMode);
  const activeIndex = activeSlug ? headings.findIndex((h) => h.slug === activeSlug) : -1;

  function handleNav(index: number, slug: string) {
    const detail: OutlineNavDetail = {
      index,
      slug,
      mode: isSourceMode ? 'source' : 'wysiwyg',
    };
    if (detail.mode === 'source') {
      rememberPendingSourceNavigation(docName, { kind: 'outline', detail });
    }
    window.dispatchEvent(new CustomEvent(OUTLINE_NAV_EVENT, { detail }));
  }

  const maxLevel = headings.reduce((m, h) => Math.max(m, h.level), 1);
  const svgW = (maxLevel - 1) * LEVEL_W + 1;
  const svgH = headings.length * ITEM_H;
  const linePath = buildLinePath(headings);

  // The SVG path doubles as a CSS mask so the animated thumb is clipped to
  // the path shape — primary color travels along the diagonal connectors too.
  const maskUrl = linePath
    ? `url("data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}"><path d="${linePath}" stroke="black" stroke-width="2" fill="none" /></svg>`,
      )}")`
    : undefined;

  // Thumb covers the text region of the active item (excluding py-1.5 padding).
  const thumbTop = activeIndex >= 0 ? activeIndex * ITEM_H + PAD_TOP : 0;
  const thumbHeight = activeIndex >= 0 ? ITEM_H - PAD_TOP - PAD_BOT : 0;

  return (
    <Panel className={className}>
      <PanelHeader>
        <PanelTitle>Outline</PanelTitle>
        {!isLoading && <PanelCount>{headings.length}</PanelCount>}
      </PanelHeader>
      <PanelBody className="px-3 py-2" aria-busy={isLoading}>
        {error ? (
          <PanelError className="px-2">
            {error instanceof Error ? error.message : 'Failed to load headings'}
          </PanelError>
        ) : headings.length === 0 && !isLoading ? (
          <PanelEmpty className="px-2">No headings yet.</PanelEmpty>
        ) : (
          <nav aria-label="Document outline" className="relative">
            {/* Gray base path */}
            <svg
              width={svgW}
              height={svgH}
              className="pointer-events-none absolute left-0 top-0"
              aria-hidden="true"
            >
              <path d={linePath} fill="none" strokeWidth="1" style={{ stroke: 'var(--border)' }} />
            </svg>
            {/* Animated primary thumb — path used as CSS mask so the colored
                block is clipped to the path shape; translateY is GPU-composited. */}
            {maskUrl && (
              <div
                className="pointer-events-none absolute left-0 top-0"
                style={{
                  width: svgW,
                  height: svgH,
                  maskImage: maskUrl,
                  WebkitMaskImage: maskUrl,
                }}
              >
                <div
                  className="w-full motion-safe:[transition:transform_0.25s_var(--ease-out-strong),height_0.1s_var(--ease-out-strong)]"
                  style={{
                    transform: `translateY(${thumbTop}px)`,
                    height: thumbHeight,
                    backgroundColor: 'var(--primary)',
                  }}
                />
              </div>
            )}
            {/* Buttons sit on top of the SVG; paddingLeft aligns text with line */}
            {headings.map((heading, index) => {
              const isActive = heading.slug === activeSlug;
              return (
                <button
                  // biome-ignore lint/suspicious/noArrayIndexKey: headings are positionally stable per load
                  key={index}
                  type="button"
                  aria-current={isActive ? 'location' : undefined}
                  onClick={() => handleNav(index, heading.slug)}
                  className={cn(
                    'w-full cursor-pointer truncate py-1.5 pe-2 text-left text-sm transition-colors',
                    isActive
                      ? 'font-medium text-primary'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  style={{ paddingLeft: `${(heading.level - 1) * LEVEL_W + 16}px` }}
                  title={heading.text}
                >
                  {heading.text}
                </button>
              );
            })}
          </nav>
        )}
      </PanelBody>
    </Panel>
  );
}

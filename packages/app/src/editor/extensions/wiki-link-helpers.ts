import { getHeadingSlug, toWikiLinkSlug } from '@inkeep/open-knowledge-core';
import type { PageListCacheSnapshot } from '../page-list-cache';

export { getHeadingSlug, toWikiLinkSlug };

/**
 * Input shape accepted by resolution helpers. A bare `Set<string>` works
 * for tests and legacy callers — the helper derives the slug index on the
 * fly (O(n) per call with a slug computation each). A `PageListCacheSnapshot`
 * carries a precomputed `pagesBySlug` map — O(1) lookup. React components
 * that consume `usePageList()` typically pass the bare `pages` Set; chip
 * PM plugins that read `getPageListCache()` pass the snapshot.
 */
type PagesLookupInput = ReadonlySet<string> | PageListCacheSnapshot;

function isSnapshot(input: PagesLookupInput): input is PageListCacheSnapshot {
  return 'pagesBySlug' in input;
}

function getPagesSet(input: PagesLookupInput): ReadonlySet<string> {
  return isSnapshot(input) ? input.pages : input;
}

function getAssetPathsSet(input: PagesLookupInput, assetPaths?: ReadonlySet<string>) {
  return isSnapshot(input) ? (input.assetPaths ?? new Set<string>()) : (assetPaths ?? new Set());
}

/**
 * Look up a target by slug against the pages set / snapshot. Returns the
 * original docName on match, or undefined when no entry's slug matches
 * the target's slug.
 *
 * `buildUnresolvedWikiLinkAttrs` stores the lowercased slug as the PM
 * wikiLink target. The page cache keeps
 * case-preserved + non-slug-form docNames (`README`,
 * `BA_for_Depression_Research`). Without a slug-based fallback,
 * `pages.has('readme')` and `pages.has('ba-for-depression-research')`
 * never match, so every dropped `.md` file + hand-typed `[[README]]`
 * (via the suggestion-menu fallback path that also slugs) shows
 * "Page not found".
 *
 * `targetSlug` is the slug of `target` — if target is already in slug
 * form, it equals the input. Both branches use the slug as the lookup
 * key, so `README` and `readme` and `Readme` all resolve to the same
 * cache entry.
 */
function slugLookup(target: string, input: PagesLookupInput): string | undefined {
  const targetSlug = toWikiLinkSlug(target);
  if (!targetSlug) return undefined;
  if (isSnapshot(input)) {
    return input.pagesBySlug.get(targetSlug);
  }
  // Bare Set — O(n) scan with slug computation per entry. Acceptable for
  // PropPanel / non-hot-path callers (tests, one-off resolutions).
  for (const page of input) {
    if (toWikiLinkSlug(page) === targetSlug) return page;
  }
  return undefined;
}

/**
 * True when the wiki-link target text can safely be used as a path segment
 * verbatim (no path separators, no reserved chars, not "." or ".."). When
 * false, callers should fall back to `toWikiLinkSlug`.
 */
export function canUseTargetAsPathSegment(target: string): boolean {
  const trimmed = target.trim();
  return (
    trimmed.length > 0 &&
    !/[\\/\0<>:"|?*]/.test(trimmed) &&
    !/[. ]$/.test(trimmed) &&
    trimmed !== '.' &&
    trimmed !== '..'
  );
}

/**
 * Suggested filename (with `.md`) for the NewItemDialog when creating a page
 * from a wiki-link target. Preserves the literal target name when it's a safe
 * path segment; otherwise falls back to the kebab-case slug.
 */
export function wikiLinkSuggestedFilename(target: string): string {
  const baseName = canUseTargetAsPathSegment(target) ? target.trim() : toWikiLinkSlug(target);
  return `${baseName}.md`;
}

export function buildUnresolvedWikiLinkAttrs(query: string): {
  target: string;
  alias: string | null;
  anchor: null;
} | null {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const slug = toWikiLinkSlug(trimmed);
  if (!slug) return null;

  return {
    target: slug,
    alias: slug === trimmed ? null : trimmed,
    anchor: null,
  };
}

export function getWikiLinkResolutionCandidates(target: string): string[] {
  const trimmed = target.trim();
  if (!trimmed) return [];
  const slug = toWikiLinkSlug(trimmed);
  return slug.length > 0 && slug !== trimmed ? [slug] : [];
}

function normalizeAssetTarget(target: string): string {
  const trimmed = target.trim();
  const withoutHash = (trimmed.split('#')[0] ?? '').trim();
  const withoutQuery = (withoutHash.split('?')[0] ?? '').trim();
  return withoutQuery.startsWith('/') ? withoutQuery.slice(1) : withoutQuery;
}

export function resolveWikiLinkAssetTarget(
  target: string,
  assetPaths: ReadonlySet<string>,
): string | null {
  const normalized = normalizeAssetTarget(target);
  if (!normalized) return null;

  if (assetPaths.has(normalized)) return normalized;
  const lowerTarget = normalized.toLowerCase();
  for (const path of assetPaths) {
    if (path.toLowerCase() === lowerTarget) return path;
  }

  if (normalized.includes('/')) return null;
  const matches = [...assetPaths].filter((path) => {
    const slash = path.lastIndexOf('/');
    const basename = slash === -1 ? path : path.slice(slash + 1);
    return basename.toLowerCase() === lowerTarget;
  });
  if (matches.length === 0) return null;
  return matches.sort((a, b) => a.localeCompare(b))[0] ?? null;
}

export function isResolvedWikiLinkTarget(
  target: string,
  pages: PagesLookupInput,
  assetPaths?: ReadonlySet<string>,
): boolean {
  const trimmed = target.trim();
  if (!trimmed) return false;
  if (resolveWikiLinkAssetTarget(trimmed, getAssetPathsSet(pages, assetPaths))) return true;

  const pagesSet = getPagesSet(pages);
  if (pagesSet.has(trimmed)) return true;

  if (getWikiLinkResolutionCandidates(trimmed).some((candidate) => pagesSet.has(candidate))) {
    return true;
  }

  // Slug-based fallback. Handles dropped `.md`
  // (target='readme' from slug) against case-preserved cache entry
  // (`README`) AND underscore/space/punctuation cache entries
  // (`BA_for_Depression_Research` → slug `ba-for-depression-research`).
  // Plus hand-typed `[[README]]` via the suggestion-menu fallback path
  // that also runs the slug transform. First-wins on slug collision —
  // if both `README` and `ReadMe` exist (different case, same slug), the
  // insertion-order-first entry wins (documented in the
  // PageListCacheSnapshot JSDoc at `page-list-cache.ts`).
  return slugLookup(trimmed, pages) !== undefined;
}

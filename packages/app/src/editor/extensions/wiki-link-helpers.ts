import { getHeadingSlug, toWikiLinkSlug } from '@inkeep/open-knowledge-core';
import type { PageListCacheSnapshot } from '../page-list-cache';

export { getHeadingSlug, toWikiLinkSlug };

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
  for (const page of input) {
    if (toWikiLinkSlug(page) === targetSlug) return page;
  }
  return undefined;
}

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

  return slugLookup(trimmed, pages) !== undefined;
}

import { getHeadingSlug, toWikiLinkSlug } from '@inkeep/open-knowledge-core';

export { getHeadingSlug, toWikiLinkSlug };

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

export function isResolvedWikiLinkTarget(target: string, pages: Set<string>): boolean {
  const trimmed = target.trim();
  if (!trimmed) return false;
  if (pages.has(trimmed)) return true;

  const slug = toWikiLinkSlug(trimmed);
  return slug.length > 0 && pages.has(slug);
}

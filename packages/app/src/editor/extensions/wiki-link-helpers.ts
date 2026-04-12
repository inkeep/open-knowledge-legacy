import { toWikiLinkSlug } from '@inkeep/open-knowledge-core';

export { toWikiLinkSlug };

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

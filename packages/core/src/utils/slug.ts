/** Shared heading/anchor slug interface — used by API responses and client-side consumers. */
export interface HeadingEntry {
  level: number;
  text: string;
  /** URL-safe slug derived from the heading text — matches wiki link anchor syntax. */
  slug: string;
}

/**
 * Convert arbitrary heading text to a URL-safe slug suitable for wiki link anchors.
 * Any run of non-alphanumeric characters becomes a single hyphen; leading/trailing
 * hyphens are stripped.
 *
 * This is the canonical implementation shared between:
 *   - server  (api-extension.ts — generates slugs for /api/page-headings)
 *   - app     (wiki-link-helpers.ts, heading-anchors.ts — renders heading IDs + resolves links)
 */
export function toWikiLinkSlug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Frontmatter strip/prepend utilities for markdown round-trip.
 *
 * marked treats `---` as a thematic break (horizontal rule).
 * Frontmatter must be regex-stripped before parsing and re-prepended after serialization.
 */
export declare function stripFrontmatter(markdown: string): {
    frontmatter: string;
    body: string;
};
export declare function prependFrontmatter(frontmatter: string, body: string): string;

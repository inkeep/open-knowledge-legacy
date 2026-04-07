/**
 * Frontmatter strip/prepend utilities for markdown round-trip.
 *
 * marked treats `---` as a thematic break (horizontal rule).
 * Frontmatter must be regex-stripped before parsing and re-prepended after serialization.
 */

const FRONTMATTER_RE = /^---\n[\s\S]*?\n---\n/;

export function stripFrontmatter(markdown: string): { frontmatter: string; body: string } {
  const match = markdown.match(FRONTMATTER_RE);
  if (match) {
    return {
      frontmatter: match[0],
      body: markdown.slice(match[0].length),
    };
  }
  return { frontmatter: '', body: markdown };
}

export function prependFrontmatter(frontmatter: string, body: string): string {
  if (!frontmatter) return body;
  return frontmatter + body;
}

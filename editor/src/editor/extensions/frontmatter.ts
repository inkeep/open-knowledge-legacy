/**
 * Frontmatter strip/prepend utilities.
 *
 * The markdown parser treats `---` as a thematic break and `key:` lines as
 * setext headings, corrupting YAML frontmatter on each round-trip. We strip it
 * before parsing and re-prepend after serialization.
 */

const FRONTMATTER_RE = /^---\n[\s\S]*?\n---\n?/;

export function stripFrontmatter(markdown: string): { frontmatter: string; body: string } {
  const match = markdown.match(FRONTMATTER_RE);
  if (match) {
    return { frontmatter: match[0], body: markdown.slice(match[0].length) };
  }
  return { frontmatter: '', body: markdown };
}

export function prependFrontmatter(frontmatter: string, body: string): string {
  if (!frontmatter) return body;
  return frontmatter + body;
}

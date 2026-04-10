/**
 * Frontmatter parsing utilities for wiki .md files.
 *
 * Follows the Jekyll frontmatter convention (2008) — the de facto standard
 * used by Hugo, gray-matter, Astro, Next.js, and most static site generators.
 * There is no formal spec (not part of CommonMark or GFM).
 *
 * Convention:
 *   - Opening `---` must be the first line of the file (byte position 0)
 *   - Closing `---` on its own line terminates the block
 *   - Content between delimiters is parsed as YAML (1.2 via the `yaml` package)
 *   - Empty frontmatter (`---\n---`) is valid (parses to null)
 *
 * All frontmatter access in the wiki package should go through these
 * functions — no raw regex matching elsewhere.
 */
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

// Matches Jekyll-style frontmatter: `---` at file start, YAML content, `---` closing.
// Handles both Unix (\n) and Windows (\r\n) line endings.
// Empty frontmatter (`---\n---`) is matched via the optional content group.
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

/**
 * Parse YAML frontmatter from a markdown string into a key-value record.
 * Returns null if no frontmatter block is found or YAML is invalid.
 */
export function parseFrontmatter(content: string): Record<string, unknown> | null {
  const match = content.match(FRONTMATTER_RE);
  if (!match) return null;
  try {
    const parsed = parseYaml(match[1]);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // gracefully handle invalid YAML
  }
  return null;
}

/**
 * Serialize a record into a YAML frontmatter block (with --- delimiters).
 */
export function serializeFrontmatter(data: Record<string, unknown>): string {
  return `---\n${stringifyYaml(data).trim()}\n---`;
}

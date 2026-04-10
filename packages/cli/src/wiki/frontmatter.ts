/**
 * Frontmatter parsing utilities for wiki .md files.
 *
 * Extracts YAML frontmatter from markdown and parses it into a typed record
 * using the `yaml` package. All frontmatter access in the wiki package
 * should go through these functions — no raw regex matching elsewhere.
 */
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?/;

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
